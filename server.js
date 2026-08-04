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
const SEED_DATA_FILE = path.join(__dirname, 'data', 'portal-data.json');
const DATA_FILE = process.env.CSA_PORTAL_DATA_FILE || SEED_DATA_FILE;
if (DATA_FILE !== SEED_DATA_FILE && !fs.existsSync(DATA_FILE)) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.copyFileSync(SEED_DATA_FILE, DATA_FILE);
}
const sessions = new Map();
const loginCodes = new Map();
const ROLE_VALUES = ['coach', 'institutional_representative', 'commissioner', 'board_member', 'staff', 'administrator', 'conference_observer'];
const PERMISSION_VALUES = ['legislative:submit', 'legislative:comment', 'legislative:vote', 'legislative:admin', 'legislative:moderation', 'legislative:board'];
const DEFAULT_POLICY = {
  version: 'v4',
  effectiveDate: '2026-08-01',
  quorumRequired: 3,
  thresholdPercent: 50,
  eligibleVotingUnits: ['Columbia', 'Princeton', 'Penn', 'Trinity', 'Yale'],
  proxyRegistrationHours: 72
};
const DEFAULT_CYCLE = {
  id: '2026-27',
  name: 'Annual Legislative Cycle',
  status: 'pilot',
  phase: 'review',
  timeZone: 'America/New_York',
  policyVersion: 'v4',
  note: 'Pilot timing is configurable by CSA governance authority.',
  deadlines: [
    { id: 'submission-close', label: 'Proposal submission window closes', date: '2026-09-04', stage: 'review' },
    { id: 'distribution', label: 'Accepted proposals distributed', date: '2026-09-18', stage: 'comment' },
    { id: 'comment-close', label: 'Comment and revision window closes', date: '2026-12-01', stage: 'vote' },
    { id: 'vote-close', label: 'Coach vote closes', date: '2027-05-07', stage: 'board' },
    { id: 'board-review', label: 'Board ratification window', date: '2027-05-21', stage: 'decision' }
  ],
  audit: []
};

function nowStamp() {
  return new Date().toISOString();
}

function readPortalData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writePortalData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n');
}

function getSession(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|; )csa_session=([^;]+)/);
  if (!match) return null;
  const session = sessions.get(match[1]);
  if (!session) return null;
  const data = readPortalData();
  const user = data.users.find(item => item.id === session.id);
  if (!user || user.active === false) {
    sessions.delete(match[1]);
    return null;
  }
  const refreshed = publicUser(user);
  sessions.set(match[1], refreshed);
  return refreshed;
}

function requireSession(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Sign-in required' });
  req.user = session;
  next();
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active !== false, programs: user.programs || [], permissions: user.permissions || [] };
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
  proposal.audit = [...(proposal.audit || []), { event, by, at: nowStamp(), ...extra }];
}

const MEMBER_PROGRAMS = ['Columbia', 'Princeton', 'Penn', 'Trinity', 'Yale'];
const PROGRAM_SCOPE = [...MEMBER_PROGRAMS, 'CSA'];
const VOTE_CHOICES = ['yes', 'no', 'abstain'];

function cycleFor(data) {
  const cycle = isRecord(data.cycle) ? JSON.parse(JSON.stringify(data.cycle)) : JSON.parse(JSON.stringify(DEFAULT_CYCLE));
  cycle.deadlines = Array.isArray(cycle.deadlines) ? cycle.deadlines : [];
  cycle.audit = Array.isArray(cycle.audit) ? cycle.audit : [];
  return cycle;
}

function policyFor(data) {
  return { ...DEFAULT_POLICY, ...(isRecord(data.policy) ? data.policy : {}) };
}

function publicCycle(data) {
  const cycle = cycleFor(data);
  const policy = policyFor(data);
  const today = new Date();
  const deadlines = cycle.deadlines
    .filter(item => isRecord(item) && typeof item.date === 'string')
    .map(item => ({ id: item.id, label: item.label, date: item.date, stage: item.stage }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextDeadline = deadlines.find(item => new Date(`${item.date}T23:59:59`) >= today) || null;
  return {
    id: cycle.id,
    name: cycle.name,
    status: cycle.status,
    phase: cycle.phase,
    timeZone: cycle.timeZone,
    policyVersion: cycle.policyVersion || policy.version,
    note: cycle.note || '',
    today: today.toISOString(),
    deadlines,
    nextDeadline,
    policy: {
      version: policy.version,
      effectiveDate: policy.effectiveDate,
      quorumRequired: policy.quorumRequired,
      thresholdPercent: policy.thresholdPercent,
      eligibleVotingUnits: policy.eligibleVotingUnits,
      proxyRegistrationHours: policy.proxyRegistrationHours
    }
  };
}

function canViewProposal(user, proposal) {
  const owner = proposal.proposerId ? proposal.proposerId === user.id : proposal.proposer === user.name;
  if (owner || isGovernanceAdmin(user) || isBoardMember(user)) return true;
  return !['draft', 'review'].includes(proposal.status);
}

function versionSummaries(proposal) {
  const versions = Array.isArray(proposal.versions) && proposal.versions.length
    ? proposal.versions
    : [proposalSnapshot(proposal, currentVersion(proposal), proposal.proposer || 'CSA staff', proposal.time || 'Original record')];
  const fields = ['title', 'program', 'coSponsors', 'body', 'files'];
  return versions.map((version, index) => {
    const previous = versions[index - 1];
    const changed = previous ? fields.filter(field => JSON.stringify(previous[field]) !== JSON.stringify(version[field])) : [];
    return {
      version: version.version || index + 1,
      title: version.title,
      program: version.program,
      coSponsors: Array.isArray(version.coSponsors) ? [...version.coSponsors] : [],
      files: Array.isArray(version.files) ? [...version.files] : [],
      createdBy: version.createdBy,
      createdAt: version.createdAt,
      changeSummary: version.changeSummary || (index === 0 ? 'Original submission' : ''),
      changedFields: changed
    };
  });
}

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

function initializeVote(proposal, data = {}) {
  const policy = policyFor(data);
  if (!proposal.vote || !isRecord(proposal.vote)) {
    proposal.vote = {
      eligibleUnits: [...(policy.eligibleVotingUnits || MEMBER_PROGRAMS)],
      quorumRequired: policy.quorumRequired,
      thresholdPercent: policy.thresholdPercent,
      ballots: [],
      status: 'open',
      result: null,
      counts: null,
      quorumMet: null,
      thresholdMet: null
    };
  } else {
    proposal.vote.eligibleUnits = Array.isArray(proposal.vote.eligibleUnits) && proposal.vote.eligibleUnits.length ? [...proposal.vote.eligibleUnits] : [...(policy.eligibleVotingUnits || MEMBER_PROGRAMS)];
    proposal.vote.quorumRequired = Number.isInteger(proposal.vote.quorumRequired) ? proposal.vote.quorumRequired : policy.quorumRequired;
    proposal.vote.thresholdPercent = typeof proposal.vote.thresholdPercent === 'number' ? proposal.vote.thresholdPercent : policy.thresholdPercent;
    proposal.vote.ballots = Array.isArray(proposal.vote.ballots) ? proposal.vote.ballots : [];
    proposal.vote.status = proposal.vote.status || 'open';
  }
  return proposal.vote;
}

function publicProposal(proposal, user) {
  const result = JSON.parse(JSON.stringify(proposal));
  result.versions = versionSummaries(proposal);
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
  return proposals.filter(proposal => canViewProposal(user, proposal)).map(proposal => publicProposal(proposal, user));
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
  if (Object.hasOwn(body, 'audit')) return { error: 'Audit history is server-managed' };
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
  return { value: patch };
}

function auditIsAppendOnly(previous, next) {
  if (!Array.isArray(next) || next.length < previous.length) return false;
  return previous.every((entry, index) => JSON.stringify(entry) === JSON.stringify(next[index]));
}

function validateCyclePatch(body) {
  if (!isRecord(body)) return { error: 'Cycle payload must be an object' };
  const patch = {};
  if (Object.hasOwn(body, 'phase')) {
    const phase = requiredText(body.phase, 'Cycle phase', 40);
    if (phase.error || !['submission', 'review', 'comment', 'vote', 'board', 'decision', 'complete'].includes(phase.value)) return { error: 'Invalid cycle phase' };
    patch.phase = phase.value;
  }
  if (Object.hasOwn(body, 'note')) {
    const note = optionalText(body.note, 'Cycle note', 400);
    if (note.error) return note;
    patch.note = note.value || '';
  }
  if (Object.hasOwn(body, 'deadlines')) {
    if (!Array.isArray(body.deadlines) || body.deadlines.length > 20) return { error: 'Deadlines must be an array of 20 items or fewer' };
    const deadlines = [];
    for (const item of body.deadlines) {
      if (!isRecord(item)) return { error: 'Each deadline must be an object' };
      const id = requiredText(item.id, 'Deadline id', 80);
      const label = requiredText(item.label, 'Deadline label', 160);
      const date = requiredText(item.date, 'Deadline date', 10);
      const stage = requiredText(item.stage, 'Deadline stage', 40);
      if (id.error || label.error || date.error || stage.error) return { error: 'Deadline fields are invalid' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value) || Number.isNaN(Date.parse(`${date.value}T00:00:00Z`))) return { error: 'Deadline dates must use YYYY-MM-DD' };
      if (!['submission', 'review', 'comment', 'vote', 'board', 'decision', 'complete'].includes(stage.value)) return { error: 'Deadline stage is invalid' };
      deadlines.push({ id: id.value, label: label.value, date: date.value, stage: stage.value });
    }
    if (new Set(deadlines.map(item => item.id)).size !== deadlines.length) return { error: 'Deadline ids must be unique' };
    patch.deadlines = deadlines;
  }
  if (Object.hasOwn(body, 'policy')) {
    if (!isRecord(body.policy)) return { error: 'Policy must be an object' };
    const policy = { ...DEFAULT_POLICY };
    if (body.policy.version !== undefined) {
      const version = requiredText(body.policy.version, 'Policy version', 40);
      if (version.error) return version;
      policy.version = version.value;
    }
    if (body.policy.effectiveDate !== undefined) {
      const effectiveDate = requiredText(body.policy.effectiveDate, 'Policy effective date', 10);
      if (effectiveDate.error || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate.value)) return { error: 'Policy effective date must use YYYY-MM-DD' };
      policy.effectiveDate = effectiveDate.value;
    }
    if (body.policy.quorumRequired !== undefined) policy.quorumRequired = Number(body.policy.quorumRequired);
    if (body.policy.thresholdPercent !== undefined) policy.thresholdPercent = Number(body.policy.thresholdPercent);
    if (body.policy.proxyRegistrationHours !== undefined) policy.proxyRegistrationHours = Number(body.policy.proxyRegistrationHours);
    if (!Number.isInteger(policy.quorumRequired) || policy.quorumRequired < 1 || policy.quorumRequired > MEMBER_PROGRAMS.length) return { error: 'Quorum must be a whole number within the member program count' };
    if (!Number.isFinite(policy.thresholdPercent) || policy.thresholdPercent < 0 || policy.thresholdPercent > 100) return { error: 'Threshold must be between 0 and 100 percent' };
    if (!Number.isInteger(policy.proxyRegistrationHours) || policy.proxyRegistrationHours < 1) return { error: 'Proxy registration hours must be a positive whole number' };
    if (body.policy.eligibleVotingUnits !== undefined) {
      if (!Array.isArray(body.policy.eligibleVotingUnits) || !body.policy.eligibleVotingUnits.length || body.policy.eligibleVotingUnits.some(unit => !MEMBER_PROGRAMS.includes(unit))) return { error: 'Eligible voting units are invalid' };
      policy.eligibleVotingUnits = [...new Set(body.policy.eligibleVotingUnits)];
    }
    patch.policy = policy;
  }
  return { value: patch };
}

function validateAccessPatch(body) {
  if (!isRecord(body)) return { error: 'Access payload must be an object' };
  const patch = {};
  if (Object.hasOwn(body, 'active')) {
    if (typeof body.active !== 'boolean') return { error: 'Active must be true or false' };
    patch.active = body.active;
  }
  if (Object.hasOwn(body, 'role')) {
    const role = requiredText(body.role, 'Role', 60);
    if (role.error || !ROLE_VALUES.includes(role.value)) return { error: 'Role is invalid' };
    patch.role = role.value;
  }
  if (Object.hasOwn(body, 'programs')) {
    if (!Array.isArray(body.programs) || body.programs.some(program => typeof program !== 'string' || !PROGRAM_SCOPE.includes(program))) return { error: 'Program scope is invalid' };
    patch.programs = [...new Set(body.programs)];
  }
  if (Object.hasOwn(body, 'permissions')) {
    if (!Array.isArray(body.permissions) || body.permissions.some(permission => typeof permission !== 'string' || !PERMISSION_VALUES.includes(permission))) return { error: 'Permission scope is invalid' };
    patch.permissions = [...new Set(body.permissions)];
  }
  if (!Object.keys(patch).length) return { error: 'Provide an access change' };
  return { value: patch };
}

function appendAccessAudit(data, event, by, extra = {}) {
  data.accessAudit = [...(Array.isArray(data.accessAudit) ? data.accessAudit : []), { event, by, at: nowStamp(), ...extra }];
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

app.get('/api/cycle', requireSession, (req, res) => {
  const data = readPortalData();
  res.json(publicCycle(data));
});

app.patch('/api/cycle', requireSession, requireGovernanceAdmin, (req, res) => {
  const data = readPortalData();
  const input = validateCyclePatch(req.body);
  if (input.error) return res.status(400).json({ error: input.error });
  const before = publicCycle(data);
  const cycle = cycleFor(data);
  if (input.value.policy) data.policy = input.value.policy;
  const cyclePatch = { ...input.value };
  delete cyclePatch.policy;
  Object.assign(cycle, cyclePatch);
  data.cycle = cycle;
  appendAccessAudit(data, 'Cycle configuration updated', req.user.name, { fields: Object.keys(input.value) });
  writePortalData(data);
  res.json({ cycle: publicCycle(data), previous: before });
});

app.get('/api/access/users', requireSession, requireGovernanceAdmin, (req, res) => {
  const data = readPortalData();
  res.json({ users: data.users.map(publicUser), audit: data.accessAudit || [] });
});

app.patch('/api/access/users/:id', requireSession, requireGovernanceAdmin, (req, res) => {
  const data = readPortalData();
  const user = data.users.find(item => item.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const input = validateAccessPatch(req.body);
  if (input.error) return res.status(400).json({ error: input.error });
  if (user.id === req.user.id && input.value.active === false) return res.status(409).json({ error: 'You cannot deactivate your own access' });
  const changed = Object.keys(input.value).filter(key => JSON.stringify(user[key]) !== JSON.stringify(input.value[key]));
  Object.assign(user, input.value);
  appendAccessAudit(data, 'User access updated', req.user.name, { user: user.email, fields: changed });
  writePortalData(data);
  res.json({ user: publicUser(user) });
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
  if (!user || user.active === false) return res.status(401).json({ error: 'This email is not approved for CSA Portal access' });
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
    audit: [{ event: draft ? 'Draft saved' : 'Proposal submitted', by: req.user.name, at: nowStamp() }],
    activity: draft ? 'Draft saved' : 'Submitted for staff review',
    time: nowStamp(),
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
      time: nowStamp(),
      audit: [...(proposal.audit || []), { event: submitting ? 'Proposal submitted' : 'Draft updated', by: req.user.name, at: nowStamp() }]
    });
    writePortalData(data);
    return res.json(publicProposal(proposal, req.user));
  }

  const patch = validatePatchInput(req.body);
  if (patch.error) return res.status(400).json({ error: patch.error });
  const changedFields = Object.keys(patch.value).filter(key => JSON.stringify(proposal[key]) !== JSON.stringify(patch.value[key]));
  Object.assign(proposal, patch.value);
  if (changedFields.length) appendAudit(proposal, 'Proposal record updated', req.user.name, { fields: changedFields });
  writePortalData(data);
  res.json(publicProposal(proposal, req.user));
});

app.post('/api/proposals/:id/open-vote', requireSession, requireGovernanceAdmin, (req, res) => {
  const data = readPortalData();
  const proposal = data.proposals.find(item => item.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (!['Bucket 2', 'Bucket 3'].includes(proposal.bucket)) return res.status(409).json({ error: 'Only Bucket 2 and Bucket 3 proposals use a coach vote' });
  if (!['comment', 'review'].includes(proposal.status)) return res.status(409).json({ error: 'Proposal is not ready to open a coach vote' });
  initializeVote(proposal, data);
  const voteDeadline = cycleFor(data).deadlines.find(item => item.id === 'vote-close');
  proposal.vote.closeAt = voteDeadline?.date || null;
  proposal.vote.policyVersion = policyFor(data).version;
  proposal.status = 'vote';
  proposal.statusLabel = 'Coach vote open';
  proposal.next = voteDeadline ? `Vote closes ${voteDeadline.date}` : 'Quorum and threshold calculated at close';
  proposal.activity = `Coach vote opened by ${req.user.name}`;
  proposal.time = nowStamp();
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
  const vote = initializeVote(proposal, data);
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
    submittedAt: nowStamp()
  });
  proposal.activity = `Coach ballot recorded for ${votingUnit.value}`;
  proposal.time = nowStamp();
  appendAudit(proposal, 'Coach ballot recorded', req.user.name, { votingUnit: votingUnit.value });
  writePortalData(data);
  res.status(201).json(publicProposal(proposal, req.user));
});

app.post('/api/proposals/:id/finalize-vote', requireSession, requireGovernanceAdmin, (req, res) => {
  const data = readPortalData();
  const proposal = data.proposals.find(item => item.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.status !== 'vote') return res.status(409).json({ error: 'Proposal is not in the coach vote stage' });
  const vote = initializeVote(proposal, data);
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
  vote.finalizedAt = nowStamp();
  vote.finalizedBy = req.user.name;
  if (!passed) {
    proposal.status = 'closed';
    proposal.statusLabel = 'Vote not adopted';
    proposal.next = 'Next legislative cycle';
    proposal.decision = { outcome: 'Rejected', reason: `Coach vote did not meet ${quorumMet ? 'the approval threshold' : 'quorum'}.`, effectiveDate: '', decidedBy: req.user.name, decidedAt: nowStamp() };
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
  proposal.time = nowStamp();
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
  versions.push({ version: nextVersion, title: input.value.title, program: input.value.program, coSponsors: [...input.value.coSponsors], body: input.value.body, files: [...input.value.files], createdBy: req.user.name, createdAt: nowStamp(), changeSummary: changeSummary.value });
  Object.assign(proposal, { title: input.value.title, program: input.value.program, coSponsors: input.value.coSponsors, body: input.value.body, files: input.value.files, version: nextVersion, bucket: 'Unassigned', status: 'review', statusLabel: 'Staff review', next: 'CSA staff review', activity: `Version ${nextVersion} submitted for staff review`, time: nowStamp() });
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
  if (!canViewProposal(req.user, proposal)) return res.status(403).json({ error: 'You do not have access to this proposal' });
  proposal.comments.push({ authorId: req.user.id, author: req.user.name, date: nowStamp(), text: text.value });
  proposal.activity = `Comment added by ${req.user.name}`;
  proposal.time = nowStamp();
  appendAudit(proposal, 'Comment added', req.user.name);
  writePortalData(data);
  res.status(201).json(publicProposal(proposal, req.user));
});

app.delete('/api/proposals/:id/comments/:index', requireSession, (req, res) => {
  const data = readPortalData();
  const proposal = data.proposals.find(item => item.id === req.params.id);
  if (!/^\d+$/.test(req.params.index)) return res.status(400).json({ error: 'Comment index must be a non-negative integer' });
  const index = Number(req.params.index);
  if (!Number.isSafeInteger(index)) return res.status(400).json({ error: 'Comment index is out of range' });
  if (!proposal || !proposal.comments[index]) return res.status(404).json({ error: 'Comment not found' });
  if (!canViewProposal(req.user, proposal)) return res.status(403).json({ error: 'You do not have access to this proposal' });
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
  appendAudit(proposal, 'Comment removed', req.user.name, { reason });
  proposal.activity = 'Comment removed from visible thread';
  proposal.time = nowStamp();
  writePortalData(data);
  res.json(publicProposal(proposal, req.user));
});

app.get('/api/proposals/:id/record.pdf', requireSession, (req, res) => {
  const data = readPortalData();
  const proposal = data.proposals.find(item => item.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (!canViewProposal(req.user, proposal)) return res.status(403).json({ error: 'You do not have access to this proposal' });
  const cycle = publicCycle(data);
  const versions = versionSummaries(proposal);
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 48, right: 52, bottom: 48, left: 52 } });
  const filename = `${proposal.id}-${String(proposal.title).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'proposal'}-record.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  doc.fillColor('#1b2a4a').font('Helvetica-Bold').fontSize(18).text('CSA LEGISLATIVE RECORD');
  doc.moveDown(0.35).fillColor('#c4933f').font('Helvetica').fontSize(10).text(`${cycle.id} · ${cycle.name} · Policy ${cycle.policyVersion}`);
  doc.moveDown(1).fillColor('#1b2a4a').font('Helvetica-Bold').fontSize(16).text(text(proposal.title));
  doc.moveDown(0.4).fillColor('#555555').font('Helvetica').fontSize(10).text(`${text(proposal.program)} · ${text(proposal.bucket)} · ${text(proposal.statusLabel)} · Version ${proposal.version || 1}`);
  doc.moveDown(1).fillColor('#1b2a4a').font('Helvetica-Bold').fontSize(11).text('Proposal');
  doc.moveDown(0.25).fillColor('#333333').font('Helvetica').fontSize(10).text(text(proposal.body), { lineGap: 3 });
  doc.moveDown(0.8).fillColor('#1b2a4a').font('Helvetica-Bold').fontSize(11).text('Decision record');
  const decision = proposal.decision || {};
  doc.moveDown(0.25).fillColor('#333333').font('Helvetica').fontSize(10).text([decision.outcome, decision.effectiveDate && `Effective ${decision.effectiveDate}`, decision.reason].filter(Boolean).join(' · ') || 'No final decision recorded.', { lineGap: 3 });
  doc.moveDown(0.8).fillColor('#1b2a4a').font('Helvetica-Bold').fontSize(11).text('Version history');
  versions.forEach(version => {
    doc.moveDown(0.2).fillColor('#333333').font('Helvetica').fontSize(10).text(`Version ${version.version} · ${text(version.createdBy)} · ${text(version.createdAt)}${version.changeSummary ? ` · ${text(version.changeSummary)}` : ''}`);
    if (version.changedFields.length) doc.fillColor('#666666').fontSize(9).text(`Changed fields: ${version.changedFields.join(', ')}`);
  });
  doc.moveDown(0.8).fillColor('#1b2a4a').font('Helvetica-Bold').fontSize(11).text('Discussion');
  const comments = (proposal.comments || []).filter(comment => !comment.removed);
  doc.moveDown(0.25).fillColor('#333333').font('Helvetica').fontSize(10).text(comments.length ? comments.map(comment => `${text(comment.author)} · ${text(comment.date)}: ${text(comment.text)}`).join('\n') : 'No visible comments recorded.', { lineGap: 3 });
  doc.moveDown(0.8).fillColor('#1b2a4a').font('Helvetica-Bold').fontSize(11).text('Audit trail');
  (proposal.audit || []).forEach(item => {
    const fields = item.fields?.length ? ` · fields: ${item.fields.join(', ')}` : '';
    doc.moveDown(0.18).fillColor('#333333').font('Helvetica').fontSize(9).text(`${text(item.at)} · ${text(item.by)} · ${text(item.event)}${item.reason ? ` · ${text(item.reason)}` : ''}${fields}`);
  });
  doc.end();
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
