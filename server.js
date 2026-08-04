const express = require('express');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const PDFDocument = require('pdfkit');
const app     = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/portal', (req, res) => res.sendFile(path.join(__dirname, 'public', 'portal.html')));

// ── Legislative portal persistence + passwordless development auth ──────────
// The JSON store keeps this slice runnable without provisioning Supabase first.
// The API boundary is intentionally shaped so the store can be replaced later.
const DATA_FILE = process.env.CSA_PORTAL_DATA_FILE || path.join(__dirname, 'data', 'portal-data.json');
const sessions = new Map();
const loginCodes = new Map();

function readPortalData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writePortalData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n');
}

function getSession(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|; )csa_session=([^;]+)/);
  return match ? sessions.get(match[1]) : null;
}

function requireSession(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Sign-in required' });
  req.user = session;
  next();
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, programs: user.programs || [], permissions: user.permissions || [] };
}

const PROPOSAL_LIMITS = { title: 160, body: 4000, fileCount: 20, fileName: 200, coSponsorCount: 5, statusLabel: 80, next: 160, activity: 200, reason: 1000 };

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value, label, max) {
  if (typeof value !== 'string') return { error: `${label} must be text` };
  const text = value.trim();
  if (!text) return { error: `${label} is required` };
  if (text.length > max) return { error: `${label} must be ${max} characters or fewer` };
  return { value: text };
}

function optionalText(value, label, max) {
  if (value === undefined) return { value: undefined };
  return requiredText(value, label, max);
}

function canSubmitForProgram(user, program) {
  if (user.role === 'commissioner' || hasPermission(user, 'legislative:admin')) return true;
  return (user.programs || []).some(account => program === account || program.startsWith(`${account} `));
}

function isDraftOwner(user, proposal) {
  if (proposal.status !== 'draft' || !['coach', 'institutional_representative'].includes(user.role)) return false;
  return proposal.proposerId ? proposal.proposerId === user.id : proposal.proposer === user.name;
}

function hasPermission(user, permission) {
  return user.role === 'commissioner' || (user.permissions || []).includes('*') || (user.permissions || []).includes(permission);
}

function isGovernanceAdmin(user) {
  return hasPermission(user, 'legislative:admin');
}

function isModerator(user) {
  return hasPermission(user, 'legislative:moderation');
}

function isBoardMember(user) {
  return hasPermission(user, 'legislative:board');
}

function requireGovernanceAdmin(req, res, next) {
  if (!isGovernanceAdmin(req.user)) return res.status(403).json({ error: 'CSA staff or Commissioner permission required' });
  next();
}

function requireBoardAuthority(req, res, next) {
  if (!isBoardMember(req.user)) return res.status(403).json({ error: 'Board decision permission required' });
  next();
}

function appendAudit(proposal, event, by, extra = {}) {
  proposal.audit = [...(proposal.audit || []), { event, by, at: 'Just now', ...extra }];
}

const MEMBER_PROGRAMS = ['Columbia', 'Princeton', 'Penn', 'Trinity', 'Yale'];
const VOTE_CHOICES = ['yes', 'no', 'abstain'];

function currentVersion(proposal) {
  return Number.isInteger(proposal.version) && proposal.version > 0 ? proposal.version : (Array.isArray(proposal.versions) && proposal.versions.length ? proposal.versions.length : 1);
}

function proposalSnapshot(proposal, version, createdBy, createdAt = 'Just now') {
  return {
    version,
    title: proposal.title,
    program: proposal.program,
    coSponsors: Array.isArray(proposal.coSponsors) ? [...proposal.coSponsors] : [],
    body: proposal.body,
    files: Array.isArray(proposal.files) ? [...proposal.files] : [],
    comments: JSON.parse(JSON.stringify(proposal.comments || [])),
    audit: JSON.parse(JSON.stringify(proposal.audit || [])),
    createdBy,
    createdAt
  };
}

function ensureVersionHistory(proposal) {
  if (!Array.isArray(proposal.versions) || !proposal.versions.length) {
    proposal.versions = [proposalSnapshot(proposal, 1, proposal.proposer || 'CSA staff', proposal.time || 'Original record')];
  }
  proposal.version = currentVersion(proposal);
  return proposal.versions;
}

function initializeVote(proposal) {
  if (!proposal.vote || !isRecord(proposal.vote)) {
    proposal.vote = {
      eligibleUnits: [...MEMBER_PROGRAMS],
      quorumRequired: Math.ceil(MEMBER_PROGRAMS.length / 2),
      thresholdPercent: 50,
      ballots: [],
      status: 'open',
      result: null,
      counts: null,
      quorumMet: null,
      thresholdMet: null
    };
  } else {
    proposal.vote.eligibleUnits = Array.isArray(proposal.vote.eligibleUnits) && proposal.vote.eligibleUnits.length ? [...proposal.vote.eligibleUnits] : [...MEMBER_PROGRAMS];
    proposal.vote.quorumRequired = Number.isInteger(proposal.vote.quorumRequired) ? proposal.vote.quorumRequired : Math.ceil(proposal.vote.eligibleUnits.length / 2);
    proposal.vote.thresholdPercent = typeof proposal.vote.thresholdPercent === 'number' ? proposal.vote.thresholdPercent : 50;
    proposal.vote.ballots = Array.isArray(proposal.vote.ballots) ? proposal.vote.ballots : [];
    proposal.vote.status = proposal.vote.status || 'open';
  }
  return proposal.vote;
}

function publicProposal(proposal, user) {
  const result = JSON.parse(JSON.stringify(proposal));
  const vote = result.vote;
  if (vote) {
    const votedUnits = (vote.ballots || []).filter(ballot => (user.programs || []).includes(ballot.votingUnit)).map(ballot => ballot.votingUnit);
    result.vote = { ...vote, ballots: [], myVotingUnits: votedUnits };
    if (vote.status !== 'finalized') {
      result.vote.counts = null;
      result.vote.result = null;
      result.vote.quorumMet = null;
      result.vote.thresholdMet = null;
    }
  }
  if (Array.isArray(result.voteHistory)) {
    result.voteHistory = result.voteHistory.map(historyVote => ({
      ...historyVote,
      ballots: [],
      counts: historyVote.status === 'finalized' ? historyVote.counts : null,
      result: historyVote.status === 'finalized' ? historyVote.result : null
    }));
  }
  return result;
}

function serializeProposals(proposals, user) {
  return proposals.map(proposal => publicProposal(proposal, user));
}

function validateProposalInput(body, user) {
  if (!isRecord(body)) return { error: 'Proposal payload must be an object' };
  const title = requiredText(body.title, 'Title', PROPOSAL_LIMITS.title);
  if (title.error) return title;
  const program = requiredText(body.program, 'Program', PROPOSAL_LIMITS.title);
  if (program.error) return program;
  if (!canSubmitForProgram(user, program.value)) return { error: 'You may only submit for your program account' };
  const proposalBody = requiredText(body.body, 'Proposal body', PROPOSAL_LIMITS.body);
  if (proposalBody.error) return proposalBody;
  const submissionState = body.submissionState === undefined ? 'submit' : body.submissionState;
  if (!['draft', 'submit'].includes(submissionState)) return { error: 'Submission state must be draft or submit' };
  const coSponsors = body.coSponsors === undefined ? [] : body.coSponsors;
  if (!Array.isArray(coSponsors)) return { error: 'Co-sponsors must be an array' };
  if (coSponsors.length > PROPOSAL_LIMITS.coSponsorCount) return { error: `Co-sponsors must contain ${PROPOSAL_LIMITS.coSponsorCount} items or fewer` };
  const normalizedCoSponsors = [];
  for (const sponsor of coSponsors) {
    const normalized = requiredText(sponsor, 'Co-sponsor', PROPOSAL_LIMITS.title);
    if (normalized.error) return normalized;
    if (normalized.value === program.value) return { error: 'The primary program cannot co-sponsor its own proposal' };
    if (normalizedCoSponsors.includes(normalized.value)) return { error: 'Co-sponsors must be different programs' };
    normalizedCoSponsors.push(normalized.value);
  }
  if (submissionState === 'submit' && normalizedCoSponsors.length < 2) return { error: 'At least two co-sponsoring programs are required before submission' };
  const files = body.files === undefined ? [] : body.files;
  if (!Array.isArray(files)) return { error: 'Files must be an array' };
  if (files.length > PROPOSAL_LIMITS.fileCount) return { error: `Files must contain ${PROPOSAL_LIMITS.fileCount} items or fewer` };
  const normalizedFiles = [];
  for (const file of files) {
    const normalized = requiredText(file, 'File name', PROPOSAL_LIMITS.fileName);
    if (normalized.error) return normalized;
    normalizedFiles.push(normalized.value);
  }
  return { value: { title: title.value, program: program.value, body: proposalBody.value, files: normalizedFiles, coSponsors: normalizedCoSponsors, submissionState } };
}

function nextProposalId(data) {
  let id;
  do id = `p${Date.now()}-${crypto.randomUUID()}`;
  while (data.proposals.some(proposal => proposal.id === id));
  return id;
}

function validatePatchInput(body) {
  if (!isRecord(body)) return { error: 'Patch payload must be an object' };
  const patch = {};
  if (Object.hasOwn(body, 'bucket')) {
    if (!['Unassigned', 'Bucket 1', 'Bucket 2', 'Bucket 3'].includes(body.bucket)) return { error: 'Invalid decision bucket' };
    patch.bucket = body.bucket;
  }
  if (Object.hasOwn(body, 'status')) {
    if (!['draft', 'review', 'comment', 'vote', 'board', 'decision', 'closed'].includes(body.status)) return { error: 'Invalid proposal status' };
    patch.status = body.status;
  }
  for (const [key, max] of Object.entries({ statusLabel: PROPOSAL_LIMITS.statusLabel, next: PROPOSAL_LIMITS.next, activity: PROPOSAL_LIMITS.activity, time: 80, reviewReason: PROPOSAL_LIMITS.reason })) {
    if (Object.hasOwn(body, key)) {
      const value = optionalText(body[key], key, max);
      if (value.error) return value;
      patch[key] = value.value;
    }
  }
  if (Object.hasOwn(body, 'audit')) {
    if (!Array.isArray(body.audit) || body.audit.length > 100) return { error: 'Audit must be an array of 100 items or fewer' };
    patch.audit = body.audit.map(item => {
      if (!isRecord(item)) return null;
      const event = requiredText(item.event, 'Audit event', 200);
      const by = requiredText(item.by, 'Audit author', 120);
      const at = requiredText(item.at, 'Audit date', 80);
      if (event.error || by.error || at.error) return null;
      const result = { event: event.value, by: by.value, at: at.value };
      if (item.reason !== undefined && typeof item.reason === 'string' && item.reason.trim()) result.reason = item.reason.trim().slice(0, PROPOSAL_LIMITS.reason);
      return result;
    });
    if (patch.audit.some(item => item === null)) return { error: 'Audit entries are invalid' };
  }
  return { value: patch };
}

function auditIsAppendOnly(previous, next) {
  if (!Array.isArray(next) || next.length < previous.length) return false;
  return previous.every((entry, index) => JSON.stringify(entry) === JSON.stringify(next[index]));
}

function validateDecisionInput(body) {
  if (!isRecord(body)) return { error: 'Decision payload must be an object' };
  const outcome = requiredText(body.outcome, 'Decision outcome', 20);
  if (outcome.error) return outcome;
  if (!['Adopted', 'Rejected', 'Tabled'].includes(outcome.value)) return { error: 'Decision outcome must be Adopted, Rejected, or Tabled' };
  const reason = body.reason === undefined ? { value: '' } : optionalText(body.reason, 'Decision reason', PROPOSAL_LIMITS.reason);
  if (reason.error) return reason;
  const effectiveDate = body.effectiveDate === undefined ? { value: '' } : optionalText(body.effectiveDate, 'Effective date', 40);
  if (effectiveDate.error) return effectiveDate;
  if (outcome.value === 'Adopted' && !effectiveDate.value) return { error: 'An effective date is required for an Adopted decision' };
  if (['Rejected', 'Tabled'].includes(outcome.value) && !reason.value) return { error: `A reason is required for a ${outcome.value} decision` };
  return { value: { outcome: outcome.value, reason: reason.value, effectiveDate: effectiveDate.value } };
}

function recordDecision(proposal, input, user) {
  proposal.decision = {
    outcome: input.outcome,
    reason: input.reason,
    effectiveDate: input.effectiveDate,
    decidedBy: user.name,
    decidedAt: 'Just now'
  };
  proposal.status = 'closed';
  proposal.statusLabel = input.outcome;
  proposal.next = input.outcome === 'Adopted' ? `Effective ${input.effectiveDate}` : 'Decision recorded';
  proposal.activity = `${input.outcome} decision recorded by ${user.name}`;
  proposal.time = 'Just now';
  appendAudit(proposal, `${input.outcome} decision recorded`, user.name, {
    reason: input.reason || undefined,
    effectiveDate: input.effectiveDate || undefined
  });
}

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'csa-legislative-portal', persistence: 'json' }));

app.get('/api/auth/me', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user: session });
});

app.post('/api/auth/request-code', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const data = readPortalData();
  const user = data.users.find(item => item.email.toLowerCase() === email);
  // Keep the response generic for unknown emails; only approved users receive a code.
  if (!user) return res.json({ sent: true });
  const code = String(crypto.randomInt(100000, 1000000));
  loginCodes.set(email, { code, expires: Date.now() + 10 * 60 * 1000 });
  const response = { sent: true };
  if (process.env.NODE_ENV !== 'production') response.devCode = code;
  res.json(response);
});

app.post('/api/auth/verify-code', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const pending = loginCodes.get(email);
  if (!pending || pending.expires < Date.now() || pending.code !== code) return res.status(401).json({ error: 'Invalid or expired code' });
  const data = readPortalData();
  const user = data.users.find(item => item.email.toLowerCase() === email);
  if (!user) return res.status(401).json({ error: 'This email is not approved for CSA Portal access' });
  loginCodes.delete(email);
  const token = crypto.randomBytes(32).toString('hex');
  const session = publicUser(user);
  sessions.set(token, session);
  res.setHeader('Set-Cookie', `csa_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800`);
  res.json({ user: session });
});

app.post('/api/auth/logout', (req, res) => {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|; )csa_session=([^;]+)/);
  if (match) sessions.delete(match[1]);
  res.setHeader('Set-Cookie', 'csa_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/proposals', requireSession, (req, res) => {
  const data = readPortalData();
  res.json(serializeProposals(data.proposals, req.user));
});

app.post('/api/proposals', requireSession, (req, res) => {
  const data = readPortalData();
  const input = validateProposalInput(req.body, req.user);
  if (input.error) return res.status(400).json({ error: input.error });
  const draft = input.value.submissionState === 'draft';
  const proposal = {
    id: nextProposalId(data),
    title: input.value.title,
    program: input.value.program,
    body: input.value.body,
    files: input.value.files,
    coSponsors: input.value.coSponsors,
    proposerId: req.user.id,
    proposer: req.user.name,
    bucket: 'Unassigned',
    status: draft ? 'draft' : 'review',
    statusLabel: draft ? 'Draft' : 'Staff review',
    next: draft ? 'Complete and submit' : 'CSA staff review',
    comments: [],
    audit: [{ event: draft ? 'Draft saved' : 'Proposal submitted', by: req.user.name, at: 'Just now' }],
    activity: draft ? 'Draft saved' : 'Submitted for staff review',
    time: 'Just now',
    version: 1,
    versions: []
  };
  proposal.versions.push(proposalSnapshot(proposal, 1, req.user.name));
  data.proposals.unshift(proposal);
  writePortalData(data);
  res.status(201).json(publicProposal(proposal, req.user));
});

app.patch('/api/proposals/:id', requireSession, (req, res) => {
  const data = readPortalData();
  const proposal = data.proposals.find(item => item.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

  if (!isGovernanceAdmin(req.user)) {
    if (!isDraftOwner(req.user, proposal)) return res.status(403).json({ error: 'Only the draft owner may edit this proposal' });
    const input = validateProposalInput(req.body, req.user);
    if (input.error) return res.status(400).json({ error: input.error });
    const submitting = input.value.submissionState === 'submit';
    Object.assign(proposal, {
      title: input.value.title,
      program: input.value.program,
      body: input.value.body,
      files: input.value.files,
      coSponsors: input.value.coSponsors,
      status: submitting ? 'review' : 'draft',
      statusLabel: submitting ? 'Staff review' : 'Draft',
      next: submitting ? 'CSA staff review' : 'Complete and submit',
      activity: submitting ? 'Submitted for staff review' : 'Draft updated',
      time: 'Just now',
      audit: [...(proposal.audit || []), { event: submitting ? 'Proposal submitted' : 'Draft updated', by: req.user.name, at: 'Just now' }]
    });
    writePortalData(data);
    return res.json(publicProposal(proposal, req.user));
  }

  const patch = validatePatchInput(req.body);
  if (patch.error) return res.status(400).json({ error: patch.error });
  if (Object.hasOwn(patch.value, 'audit') && !auditIsAppendOnly(Array.isArray(proposal.audit) ? proposal.audit : [], patch.value.audit)) {
    return res.status(400).json({ error: 'Audit history can only be appended' });
  }
  Object.assign(proposal, patch.value);
  writePortalData(data);
  res.json(publicProposal(proposal, req.user));
});

app.post('/api/proposals/:id/open-vote', requireSession, requireGovernanceAdmin, (req, res) => {
  const data = readPortalData();
  const proposal = data.proposals.find(item => item.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (!['Bucket 2', 'Bucket 3'].includes(proposal.bucket)) return res.status(409).json({ error: 'Only Bucket 2 and Bucket 3 proposals use a coach vote' });
  if (!['comment', 'review'].includes(proposal.status)) return res.status(409).json({ error: 'Proposal is not ready to open a coach vote' });
  initializeVote(proposal);
  proposal.status = 'vote';
  proposal.statusLabel = 'Coach vote open';
  proposal.next = 'Quorum and threshold calculated at close';
  proposal.activity = `Coach vote opened by ${req.user.name}`;
  proposal.time = 'Just now';
  appendAudit(proposal, 'Coach vote opened', req.user.name);
  writePortalData(data);
  res.json(publicProposal(proposal, req.user));
});

app.post('/api/proposals/:id/votes', requireSession, (req, res) => {
  const data = readPortalData();
  const proposal = data.proposals.find(item => item.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.status !== 'vote') return res.status(409).json({ error: 'Coach voting is not open' });
  const choice = requiredText(req.body?.choice, 'Vote choice', 10);
  if (choice.error || !VOTE_CHOICES.includes(choice.value)) return res.status(400).json({ error: 'Vote choice must be yes, no, or abstain' });
  const votingUnit = requiredText(req.body?.votingUnit, 'Voting unit', 120);
  if (votingUnit.error) return res.status(400).json({ error: votingUnit.error });
  const vote = initializeVote(proposal);
  if (!vote.eligibleUnits.includes(votingUnit.value)) return res.status(400).json({ error: 'That program is not an eligible voting unit' });
  const proxyFor = req.body?.proxyFor === undefined ? '' : optionalText(req.body.proxyFor, 'Proxy holder', 120);
  if (proxyFor.error) return res.status(400).json({ error: proxyFor.error });
  const isProxy = Boolean(proxyFor.value);
  if (isProxy && !isGovernanceAdmin(req.user)) return res.status(403).json({ error: 'Only CSA staff may record a proxy ballot' });
  if (!isProxy && !(req.user.programs || []).some(account => votingUnit.value === account || votingUnit.value.startsWith(`${account} `))) {
    return res.status(403).json({ error: 'You may only vote for your authorized program account' });
  }
  if (vote.ballots.some(ballot => ballot.votingUnit === votingUnit.value)) return res.status(409).json({ error: 'That voting unit has already submitted a ballot' });
  vote.ballots.push({
    votingUnit: votingUnit.value,
    choice: choice.value,
    voterId: req.user.id,
    submittedBy: req.user.name,
    proxyFor: isProxy ? proxyFor.value : undefined,
    submittedAt: 'Just now'
  });
  proposal.activity = `Coach ballot recorded for ${votingUnit.value}`;
  proposal.time = 'Just now';
  appendAudit(proposal, 'Coach ballot recorded', req.user.name, { votingUnit: votingUnit.value });
  writePortalData(data);
  res.status(201).json(publicProposal(proposal, req.user));
});

app.post('/api/proposals/:id/finalize-vote', requireSession, requireGovernanceAdmin, (req, res) => {
  const data = readPortalData();
  const proposal = data.proposals.find(item => item.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.status !== 'vote') return res.status(409).json({ error: 'Proposal is not in the coach vote stage' });
  const vote = initializeVote(proposal);
  if (vote.status === 'finalized') return res.status(409).json({ error: 'Coach vote is already finalized' });
  const counts = { yes: 0, no: 0, abstain: 0 };
  vote.ballots.forEach(ballot => { counts[ballot.choice] += 1; });
  const represented = new Set(vote.ballots.map(ballot => ballot.votingUnit)).size;
  const quorumMet = represented >= vote.quorumRequired;
  const decided = counts.yes + counts.no;
  const yesPercent = decided ? (counts.yes / decided) * 100 : 0;
  const thresholdMet = decided > 0 && yesPercent >= vote.thresholdPercent;
  const passed = quorumMet && thresholdMet;
  vote.status = 'finalized';
  vote.counts = { ...counts, represented, eligible: vote.eligibleUnits.length, yesPercent: Number(yesPercent.toFixed(2)) };
  vote.quorumMet = quorumMet;
  vote.thresholdMet = thresholdMet;
  vote.result = passed ? 'passed' : 'failed';
  vote.finalizedAt = 'Just now';
  vote.finalizedBy = req.user.name;
  if (!passed) {
    proposal.status = 'closed';
    proposal.statusLabel = 'Vote not adopted';
    proposal.next = 'Next legislative cycle';
    proposal.decision = { outcome: 'Rejected', reason: `Coach vote did not meet ${quorumMet ? 'the approval threshold' : 'quorum'}.`, effectiveDate: '', decidedBy: req.user.name, decidedAt: 'Just now' };
    proposal.activity = `Coach vote not adopted by ${req.user.name}`;
  } else if (proposal.bucket === 'Bucket 3') {
    proposal.status = 'board';
    proposal.statusLabel = 'Board decision';
    proposal.next = 'Board to record Adopted, Rejected, or Tabled';
    proposal.activity = `Coach vote passed; routed to Board by ${req.user.name}`;
  } else {
    proposal.status = 'decision';
    proposal.statusLabel = 'Commissioner decision';
    proposal.next = 'Commissioner to record final outcome';
    proposal.activity = `Coach vote passed; awaiting Commissioner decision`;
  }
  proposal.time = 'Just now';
  appendAudit(proposal, passed ? 'Coach vote finalized: passed' : 'Coach vote finalized: not adopted', req.user.name, {
    reason: `Represented ${represented}/${vote.eligibleUnits.length}; ${counts.yes} yes, ${counts.no} no, ${counts.abstain} abstain`
  });
  writePortalData(data);
  res.json(publicProposal(proposal, req.user));
});

app.post('/api/proposals/:id/decision', requireSession, requireGovernanceAdmin, (req, res) => {
  const data = readPortalData();
  const proposal = data.proposals.find(item => item.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.bucket === 'Bucket 3') return res.status(409).json({ error: 'Bucket 3 proposals require a Board decision' });
  if (proposal.status !== 'decision' && !(proposal.bucket === 'Bucket 1' && ['review', 'comment'].includes(proposal.status))) return res.status(409).json({ error: 'Proposal is not awaiting a Commissioner decision' });
  const input = validateDecisionInput(req.body);
  if (input.error) return res.status(400).json({ error: input.error });
  recordDecision(proposal, input.value, req.user);
  writePortalData(data);
  res.json(publicProposal(proposal, req.user));
});

app.post('/api/proposals/:id/board-decision', requireSession, requireBoardAuthority, (req, res) => {
  const data = readPortalData();
  const proposal = data.proposals.find(item => item.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.bucket !== 'Bucket 3' || proposal.status !== 'board') return res.status(409).json({ error: 'Proposal is not awaiting a Board decision' });
  const input = validateDecisionInput(req.body);
  if (input.error) return res.status(400).json({ error: input.error });
  recordDecision(proposal, input.value, req.user);
  appendAudit(proposal, 'Board decision recorded', req.user.name);
  writePortalData(data);
  res.json(publicProposal(proposal, req.user));
});

app.post('/api/proposals/:id/revisions', requireSession, (req, res) => {
  const data = readPortalData();
  const proposal = data.proposals.find(item => item.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  const owner = proposal.proposerId ? proposal.proposerId === req.user.id : proposal.proposer === req.user.name;
  if (!owner || !['comment', 'vote', 'board', 'decision'].includes(proposal.status)) return res.status(403).json({ error: 'Only the proposer may revise an active proposal' });
  const input = validateProposalInput({ ...req.body, submissionState: 'submit' }, req.user);
  if (input.error) return res.status(400).json({ error: input.error });
  const changeSummary = requiredText(req.body?.changeSummary, 'Change summary', PROPOSAL_LIMITS.reason);
  if (changeSummary.error) return changeSummary;
  const versions = ensureVersionHistory(proposal);
  const nextVersion = currentVersion(proposal) + 1;
  versions.push({ version: nextVersion, title: input.value.title, program: input.value.program, coSponsors: [...input.value.coSponsors], body: input.value.body, files: [...input.value.files], createdBy: req.user.name, createdAt: 'Just now', changeSummary: changeSummary.value });
  Object.assign(proposal, { title: input.value.title, program: input.value.program, coSponsors: input.value.coSponsors, body: input.value.body, files: input.value.files, version: nextVersion, bucket: 'Unassigned', status: 'review', statusLabel: 'Staff review', next: 'CSA staff review', activity: `Version ${nextVersion} submitted for staff review`, time: 'Just now' });
  if (proposal.vote) proposal.voteHistory = [...(proposal.voteHistory || []), proposal.vote];
  proposal.vote = null;
  proposal.decision = null;
  appendAudit(proposal, `Revision ${nextVersion} submitted`, req.user.name, { reason: changeSummary.value });
  writePortalData(data);
  res.status(201).json(publicProposal(proposal, req.user));
});

app.post('/api/proposals/:id/comments', requireSession, (req, res) => {
  const data = readPortalData();
  const proposal = data.proposals.find(item => item.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.status !== 'comment') return res.status(409).json({ error: 'Comment window is closed' });
  const text = requiredText(req.body?.text, 'Comment text', 2000);
  if (text.error) return res.status(400).json({ error: text.error });
  proposal.comments.push({ authorId: req.user.id, author: req.user.name, date: 'Just now', text: text.value });
  proposal.activity = `Comment added by ${req.user.name}`;
  proposal.time = 'Just now';
  proposal.audit = [...(proposal.audit || []), { event: 'Comment added', by: req.user.name, at: 'Just now' }];
  writePortalData(data);
  res.status(201).json(proposal);
});

app.delete('/api/proposals/:id/comments/:index', requireSession, (req, res) => {
  const data = readPortalData();
  const proposal = data.proposals.find(item => item.id === req.params.id);
  if (!/^\d+$/.test(req.params.index)) return res.status(400).json({ error: 'Comment index must be a non-negative integer' });
  const index = Number(req.params.index);
  if (!Number.isSafeInteger(index)) return res.status(400).json({ error: 'Comment index is out of range' });
  if (!proposal || !proposal.comments[index]) return res.status(404).json({ error: 'Comment not found' });
  const comment = proposal.comments[index];
  const isOwner = comment.authorId ? comment.authorId === req.user.id : comment.author === req.user.name;
  if (!isOwner && !isModerator(req.user)) return res.status(403).json({ error: 'You may only remove your own comments' });
  const suppliedReason = req.body?.reason;
  if (suppliedReason !== undefined && typeof suppliedReason !== 'string') return res.status(400).json({ error: 'Removal reason must be text' });
  const reason = (suppliedReason || (isOwner ? 'Removed by commenter' : '')).trim();
  if (reason.length > PROPOSAL_LIMITS.reason) return res.status(400).json({ error: `Removal reason must be ${PROPOSAL_LIMITS.reason} characters or fewer` });
  if (isModerator(req.user) && !isOwner && !reason) return res.status(400).json({ error: 'A moderation reason is required' });
  comment.removed = true;
  comment.originalText = comment.text;
  comment.removedBy = req.user.name;
  comment.removedReason = reason;
  proposal.audit = [...(proposal.audit || []), { event: 'Comment removed', by: req.user.name, at: 'Just now', reason }];
  proposal.activity = 'Comment removed from visible thread';
  proposal.time = 'Just now';
  writePortalData(data);
  res.json(publicProposal(proposal, req.user));
});

// ── Colors (exact match to app CSS) ──────────────────────────────────────────
const C = {
  pageBg:    '#F5F0E6',
  navy:      '#1b2a4a',
  gold:      '#c4933f',
  divider:   '#D6CEBC',
  altRow:    '#FAF7F2',
  marker:    '#999999',
  white:     '#ffffff',
  csaBg:     '#1b2a4a',
  csaBorder: '#c4933f',
  usBg:      '#8B1F17',
  usBorder:  '#E84C3F',
};

// ── Layout ────────────────────────────────────────────────────────────────────
const M          = 30;    // margin
const DATE_W     = 72;    // date column width
const MONTH_H    = 20;    // month header row height
const SCEN_H     = 24;    // scenario header row height
const BASE_ROW_H = 30;    // minimum data row height
const CHIP_H     = 16;    // chip height
const CHIP_GAP   = 3;     // gap between stacked chips
const CHIP_R     = 3;     // chip corner radius
const CHIP_PAD   = 4;     // horizontal padding inside chip column
const BORDER_W   = 4;     // left accent border width

// ── Helpers ───────────────────────────────────────────────────────────────────
function truncate(doc, text, maxW) {
  if (doc.widthOfString(text) <= maxW) return text;
  while (text.length > 1 && doc.widthOfString(text + '…') > maxW) text = text.slice(0, -1);
  return text + '…';
}

function drawChip(doc, x, y, w, bgColor, borderColor, label) {
  // Background
  doc.save().roundedRect(x, y, w, CHIP_H, CHIP_R).fill(bgColor);
  // Left accent border
  doc.rect(x, y, BORDER_W, CHIP_H).fill(borderColor);
  // Label
  const textX  = x + BORDER_W + 6;
  const maxW   = w - BORDER_W - 10;
  const text   = truncate(doc, label, maxW);
  doc.font('Helvetica-Bold').fontSize(7).fillColor(C.white)
     .text(text, textX, y + (CHIP_H - 7) / 2 + 1, { lineBreak: false });
  doc.restore();
}

function drawScenHeader(doc, gridL, gridW, scenX, scenColW, columns, y) {
  doc.rect(gridL, y, gridW, SCEN_H).fill(C.navy);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.white)
     .text('Weekend', gridL + 4, y + (SCEN_H - 9) / 2 + 1, { lineBreak: false, width: DATE_W - 8 });
  columns.forEach((col, i) => {
    const lbl = col.label || `Option ${i + 1}`;
    const tw  = doc.widthOfString(lbl);
    const cx  = scenX(i) + (scenColW - tw) / 2;
    doc.text(lbl, cx, y + (SCEN_H - 9) / 2 + 1, { lineBreak: false });
  });
  return y + SCEN_H;
}

// ── PDF endpoint ──────────────────────────────────────────────────────────────
app.post('/generate-pdf', (req, res) => {
  const { filename = 'CSA-Schedule.pdf', label = '', year = '', weekends = [], columns = [], events = [] } = req.body;

  const eventMap = {};
  events.forEach(e => { eventMap[e.id] = e; });

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: M, right: M, bottom: M, left: M }, autoFirstPage: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const PW      = doc.page.width;
  const PH      = doc.page.height;
  const usableW = PW - M * 2;
  const gridL   = M;
  const colCount = Math.max(columns.length, 1);
  const scenColW = (usableW - DATE_W) / colCount;
  const scenX    = i => gridL + DATE_W + i * scenColW;

  function newPage(curY) {
    doc.addPage();
    doc.rect(0, 0, PW, PH).fill(C.pageBg);
    return drawScenHeader(doc, gridL, usableW, scenX, scenColW, columns, M);
  }

  // Page background
  doc.rect(0, 0, PW, PH).fill(C.pageBg);

  // ── Header block ─────────────────────────────────────────────────────────
  let curY = M;
  doc.font('Helvetica-Bold').fontSize(18).fillColor(C.navy)
     .text('CSA SEASON SCHEDULER', gridL, curY, { lineBreak: false });
  curY += 22;

  const subtitle = [year.replace('-', '–'), label].filter(Boolean).join(' · ');
  doc.font('Helvetica').fontSize(10).fillColor(C.gold)
     .text(subtitle, gridL, curY, { lineBreak: false });
  curY += 14;

  doc.moveTo(gridL, curY).lineTo(gridL + usableW, curY).lineWidth(0.75).stroke(C.gold);
  curY += 10;

  // ── Scenario header row ───────────────────────────────────────────────────
  curY = drawScenHeader(doc, gridL, usableW, scenX, scenColW, columns, curY);

  // ── Calendar rows ─────────────────────────────────────────────────────────
  let rowIdx = 0;
  weekends.forEach(wknd => {

    // Month header
    if (wknd.month) {
      if (curY + MONTH_H + BASE_ROW_H > PH - M) curY = newPage(curY);
      doc.rect(gridL, curY, usableW, MONTH_H).fill(C.navy);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.white)
         .text(wknd.month.toUpperCase(), gridL + 8, curY + (MONTH_H - 10) / 2 + 1, { lineBreak: false });
      curY += MONTH_H;
    }

    // Row height: tallest chip stack across all columns
    let maxChips = 0;
    columns.forEach(col => {
      const placed = (col.placements && col.placements[wknd.key]) || [];
      if (placed.length > maxChips) maxChips = placed.length;
    });
    const chipStack = maxChips > 0 ? maxChips * CHIP_H + (maxChips - 1) * CHIP_GAP : 0;
    const rowH = Math.max(BASE_ROW_H, chipStack + 8 + (wknd.marker ? 12 : 0));

    // Page break
    if (curY + rowH > PH - M) curY = newPage(curY);

    // Alt row
    if (rowIdx % 2 === 1) doc.rect(gridL, curY, usableW, rowH).fill(C.altRow);
    rowIdx++;

    // Date label
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.navy)
       .text(wknd.label, gridL + 4, curY + 4, { lineBreak: false, width: DATE_W - 8 });

    // Holiday marker
    if (wknd.marker) {
      doc.font('Helvetica-Oblique').fontSize(7).fillColor(C.marker)
         .text(wknd.marker.text, gridL + 4, curY + 16, { lineBreak: false, width: DATE_W - 8 });
    }

    // Chips
    columns.forEach((col, ci) => {
      const placed = (col.placements && col.placements[wknd.key]) || [];
      const cx     = scenX(ci);
      const chipW  = scenColW - CHIP_PAD * 2;
      let chipY    = curY + 4;
      placed.forEach(evtId => {
        const evt      = eventMap[evtId] || { name: evtId, type: 'csa' };
        const isUs     = evt.type === 'us';
        drawChip(doc, cx + CHIP_PAD, chipY, chipW, isUs ? C.usBg : C.csaBg, isUs ? C.usBorder : C.csaBorder, evt.name);
        chipY += CHIP_H + CHIP_GAP;
      });
    });

    // Bottom divider
    curY += rowH;
    doc.moveTo(gridL, curY).lineTo(gridL + usableW, curY).lineWidth(0.5).stroke(C.divider);
  });

  doc.end();
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && Object.hasOwn(error, 'body')) {
    return res.status(400).json({ error: 'Request body must be valid JSON' });
  }
  next(error);
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CSA Scheduler on port ${PORT}`));
