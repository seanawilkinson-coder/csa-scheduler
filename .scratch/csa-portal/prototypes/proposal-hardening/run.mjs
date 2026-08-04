// PROTOTYPE — throwaway HTTP lifecycle runner. The pure case/state logic lives in state.mjs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildProposalCases, initialRunState, reduceRunState } from './state.mjs';

const root = path.resolve(import.meta.dirname, '../../../..');
const port = Number(process.env.PROTOTYPE_PORT || 3310);
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csa-proposal-prototype-'));
const tempData = path.join(tempDir, 'portal-data.json');
fs.copyFileSync(path.join(root, 'data', 'portal-data.json'), tempData);

const failures = [];
let state = initialRunState();
const sessions = {};

function report(label, details, failed = false) {
  state = reduceRunState(state, { type: details.type || 'action', label, failed });
  const marker = failed ? 'FAIL' : ' OK ';
  console.log(`[${marker}] ${label} ${JSON.stringify(details)}`);
  if (failed) failures.push({ label, details });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Prototype server did not become healthy');
}

function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'development', CSA_PORTAL_DATA_FILE: tempData },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => process.stdout.write(`[server] ${chunk}`));
  child.stderr.on('data', chunk => process.stderr.write(`[server] ${chunk}`));
  return child;
}

async function request(pathname, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (options.cookie) headers.Cookie = options.cookie;
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const payload = pathname.endsWith('.pdf') ? await response.arrayBuffer() : await response.json().catch(() => ({}));
  return { status: response.status, payload, headers: response.headers, setCookie: response.headers.get('set-cookie') || '' };
}

async function login(email) {
  const codeResponse = await request('/api/auth/request-code', { method: 'POST', body: { email } });
  if (!codeResponse.payload.devCode) throw new Error(`No development code for ${email}`);
  const verified = await request('/api/auth/verify-code', { method: 'POST', body: { email, code: codeResponse.payload.devCode } });
  if (verified.status !== 200) throw new Error(`Could not sign in ${email}`);
  return verified.setCookie.split(';')[0];
}

function bodyFor(item) {
  return item.rawBody !== undefined ? item.rawBody : item.body;
}

function expectedState(item) {
  return item.expectedState || 'review';
}

function check(condition, label, details) {
  if (!condition) report(label, details, true);
}

async function createOne(item, cookie) {
  const result = await request('/api/proposals', { method: 'POST', cookie, body: bodyFor(item) });
  state = reduceRunState(state, { type: 'create', label: `create ${item.index}` });
  const expected = item.expectedCreate;
  const ok = result.status === expected;
  const resultType = result.status >= 200 && result.status < 300 ? 'created' : 'rejected';
  report(`create ${item.index} · ${item.kind}`, { type: resultType, status: result.status, expected, id: result.payload.id, error: result.payload.error }, !ok);
  return result;
}

async function verifyCreated(item, created, coachCookie, commissionerCookie, knownIds) {
  const proposal = created.payload;
  check(typeof proposal.id === 'string' && proposal.id.startsWith('p'), `shape ${item.index}`, { id: proposal.id });
  check(!knownIds.has(proposal.id), `unique id ${item.index}`, { id: proposal.id });
  knownIds.add(proposal.id);
  check(proposal.proposer === 'Jordan Smith', `server owner ${item.index}`, { proposer: proposal.proposer });
  check(proposal.bucket === 'Unassigned', `server bucket ${item.index}`, { bucket: proposal.bucket });
  check(Array.isArray(proposal.comments) && proposal.comments.length === 0, `fresh comments ${item.index}`, { comments: proposal.comments });
  check(Array.isArray(proposal.audit) && proposal.audit.length === 1, `audit seed ${item.index}`, { audit: proposal.audit });
  check(proposal.status === expectedState(item), `state ${item.index}`, { actual: proposal.status, expected: expectedState(item) });
  check(!Object.hasOwn(proposal, 'arbitrary'), `unknown field stripped ${item.index}`, { hasArbitrary: Object.hasOwn(proposal, 'arbitrary') });

  const listed = await request('/api/proposals', { cookie: coachCookie });
  const listedProposal = listed.payload.find(candidate => candidate.id === proposal.id);
  check(Boolean(listedProposal), `listed ${item.index}`, { listed: Boolean(listedProposal) });
  report(`read ${item.index}`, { type: 'read', status: listed.status, id: proposal.id }, listed.status !== 200 || !listedProposal);

  if (item.expectedState === 'draft') return;

  const accepted = await request(`/api/proposals/${proposal.id}`, {
    method: 'PATCH', cookie: commissionerCookie,
    body: { bucket: 'Bucket 1', status: 'comment', statusLabel: 'Comment window', next: 'Comments close Dec 1', activity: 'Accepted and distributed', time: 'Just now' }
  });
  report(`accept ${item.index}`, { type: 'accepted', status: accepted.status, id: proposal.id }, accepted.status !== 200 || accepted.payload.status !== 'comment');

  const commentText = item.kind === 'markup-string' ? '<b>plain text</b> & record' : `Comment for ${item.index}`;
  const commented = await request(`/api/proposals/${proposal.id}/comments`, { method: 'POST', cookie: coachCookie, body: { text: commentText } });
  report(`comment ${item.index}`, { type: 'commented', status: commented.status, count: commented.payload.comments?.length }, commented.status !== 201 || commented.payload.comments?.length !== 1);

  const removed = await request(`/api/proposals/${proposal.id}/comments/0`, { method: 'DELETE', cookie: commissionerCookie, body: { reason: `Hardening removal ${item.index}` } });
  report(`remove comment ${item.index}`, { type: 'removed', status: removed.status, removed: removed.payload.comments?.[0]?.removed }, removed.status !== 200 || removed.payload.comments?.[0]?.removed !== true);
}

async function run() {
  const server = startServer();
  try {
    await waitForHealth();
    sessions.coach = await login('jordan@columbia.edu');
    sessions.princeton = await login('will@princeton.edu');
    sessions.penn = await login('chris@penn.edu');
    sessions.commissioner = await login('commissioner@csasquash.org');
    sessions.board = await login('board@csasquash.org');
    sessions.observer = await login('observer@conference.org');
    sessions.admin = await login('admin@columbia.edu');
    report('auth', { type: 'auth', coach: Boolean(sessions.coach), commissioner: Boolean(sessions.commissioner), board: Boolean(sessions.board), observer: Boolean(sessions.observer) }, !sessions.coach || !sessions.commissioner || !sessions.board || !sessions.observer);

    const cycle = await request('/api/cycle', { cookie: sessions.coach });
    report('cycle record is operational', { type: 'cycle', status: cycle.status, id: cycle.payload.id, next: cycle.payload.nextDeadline?.id, policy: cycle.payload.policy?.version }, cycle.status !== 200 || cycle.payload.status !== 'pilot' || !cycle.payload.nextDeadline || cycle.payload.policy?.version !== 'v4');
    const coachAccess = await request('/api/access/users', { cookie: sessions.coach });
    report('coach cannot manage access', { type: 'access-scope', status: coachAccess.status }, coachAccess.status !== 403);
    const adminAccess = await request('/api/access/users', { cookie: sessions.commissioner });
    report('commissioner can manage access', { type: 'access-register', status: adminAccess.status, users: adminAccess.payload.users?.length }, adminAccess.status !== 200 || adminAccess.payload.users?.length !== 8);
    const coachAdminOverview = await request('/api/admin/overview', { cookie: sessions.coach });
    report('coach cannot open administration', { type: 'admin-scope', status: coachAdminOverview.status }, coachAdminOverview.status !== 403);
    const commissionerAdminOverview = await request('/api/admin/overview', { cookie: sessions.commissioner });
    report('commissioner sees governance overview', { type: 'admin-overview', status: commissionerAdminOverview.status, queue: commissionerAdminOverview.payload.queue?.length, active: commissionerAdminOverview.payload.access?.active }, commissionerAdminOverview.status !== 200 || commissionerAdminOverview.payload.counts?.total < 5 || commissionerAdminOverview.payload.queue?.length < 1 || commissionerAdminOverview.payload.access?.active !== 8);
    const permissionedAdminOverview = await request('/api/admin/overview', { cookie: sessions.admin });
    report('permissioned administrator sees governance overview', { type: 'admin-permission', status: permissionedAdminOverview.status }, permissionedAdminOverview.status !== 200);
    const coachAudit = await request('/api/admin/audit', { cookie: sessions.coach });
    report('coach cannot read governance audit', { type: 'audit-scope', status: coachAudit.status }, coachAudit.status !== 403);
    const commissionerAudit = await request('/api/admin/audit', { cookie: sessions.commissioner });
    report('commissioner can read consolidated audit', { type: 'audit-register', status: commissionerAudit.status, entries: commissionerAudit.payload.audit?.length }, commissionerAudit.status !== 200 || !commissionerAudit.payload.audit?.some(item => item.scope === 'Proposal'));
    const cycleUpdate = await request('/api/cycle', { method: 'PATCH', cookie: sessions.commissioner, body: { note: 'Pilot timing updated for rehearsal.' } });
    report('cycle updates are audited', { type: 'cycle-update', status: cycleUpdate.status, note: cycleUpdate.payload.cycle?.note }, cycleUpdate.status !== 200 || cycleUpdate.payload.cycle?.note !== 'Pilot timing updated for rehearsal.');
    const policyUpdate = await request('/api/cycle', { method: 'PATCH', cookie: sessions.commissioner, body: { policy: { version: 'v4.1' } } });
    const policyOverview = await request('/api/admin/overview', { cookie: sessions.commissioner });
    report('policy changes retain history', { type: 'policy-history', status: policyUpdate.status, version: policyOverview.payload.cycle?.policyVersion, history: policyOverview.payload.policyHistory?.length }, policyUpdate.status !== 200 || policyOverview.payload.cycle?.policyVersion !== 'v4.1' || policyOverview.payload.policyHistory?.[0]?.version !== 'v4');
    const invalidAccess = await request('/api/access/users', { method: 'POST', cookie: sessions.commissioner, body: { name: 'No Email' } });
    report('invalid identity is rejected', { type: 'access-validation', status: invalidAccess.status }, invalidAccess.status !== 400);
    const missingAccessRole = await request('/api/access/users', { method: 'POST', cookie: sessions.commissioner, body: { name: 'No Role', email: 'no-role@example.org' } });
    report('identity role is explicit', { type: 'access-role', status: missingAccessRole.status }, missingAccessRole.status !== 400);
    const addedAccess = await request('/api/access/users', { method: 'POST', cookie: sessions.admin, body: { name: 'Pilot Administrator', email: 'pilot-admin@example.org', role: 'staff', active: true, programs: ['CSA'], permissions: ['legislative:records'] } });
    report('approved identity can be added', { type: 'access-add', status: addedAccess.status, id: addedAccess.payload.user?.id }, addedAccess.status !== 201 || addedAccess.payload.user?.email !== 'pilot-admin@example.org');
    const duplicateAccess = await request('/api/access/users', { method: 'POST', cookie: sessions.commissioner, body: { name: 'Duplicate Administrator', email: 'PILOT-ADMIN@example.org', role: 'staff', active: true, programs: [], permissions: [] } });
    report('identity email is unique', { type: 'access-unique', status: duplicateAccess.status }, duplicateAccess.status !== 409);
    const observerView = await request('/api/proposals', { cookie: sessions.observer });
    report('observer cannot see undistributed review records', { type: 'visibility', status: observerView.status, seesReview: observerView.payload.some(item => item.id === 'p2') }, observerView.status !== 200 || observerView.payload.some(item => item.id === 'p2'));
    const recordPdf = await request('/api/proposals/p1/record.pdf', { cookie: sessions.observer });
    report('record packet is downloadable', { type: 'record-packet', status: recordPdf.status, contentType: recordPdf.headers.get('content-type'), bytes: recordPdf.payload.byteLength }, recordPdf.status !== 200 || !recordPdf.headers.get('content-type')?.includes('application/pdf') || recordPdf.payload.byteLength < 1000);

    const cases = buildProposalCases();
    const knownIds = new Set();
    for (const item of cases.filter(candidate => candidate.concurrentGroup !== 'burst-1')) {
      const cookie = item.auth === 'none' ? undefined : sessions.coach;
      const created = await createOne(item, cookie);
      if (created.status === 201) await verifyCreated(item, created, sessions.coach, sessions.commissioner, knownIds);
    }

    const concurrent = cases.filter(candidate => candidate.concurrentGroup === 'burst-1');
    const burst = await Promise.all(concurrent.map(item => createOne(item, sessions.coach)));
    const burstIds = burst.filter(result => result.status === 201).map(result => result.payload.id);
    const uniqueBurstIds = new Set(burstIds);
    report('concurrent burst', { type: 'burst', created: burstIds.length, unique: uniqueBurstIds.size }, burstIds.length !== concurrent.length || uniqueBurstIds.size !== burstIds.length);
    for (let index = 0; index < burst.length; index += 1) {
      if (burst[index].status === 201) await verifyCreated(concurrent[index], burst[index], sessions.coach, sessions.commissioner, knownIds);
    }

    const valid = cases.find(item => item.expectedCreate === 201 && item.expectedState !== 'draft');
    const validProposal = (await request('/api/proposals', { cookie: sessions.coach })).payload.find(item => item.title === valid.body.title);
    const unauthorizedPatch = await request(`/api/proposals/${validProposal.id}`, { method: 'PATCH', cookie: sessions.coach, body: { status: 'closed' } });
    report('coach cannot patch', { type: 'permission', status: unauthorizedPatch.status }, unauthorizedPatch.status !== 403);
    const invalidPatch = await request(`/api/proposals/${validProposal.id}`, { method: 'PATCH', cookie: sessions.commissioner, body: { status: 'imaginary' } });
    report('invalid commissioner patch', { type: 'invalid-patch', status: invalidPatch.status }, invalidPatch.status !== 400);
    const invalidBucket = await request(`/api/proposals/${validProposal.id}`, { method: 'PATCH', cookie: sessions.commissioner, body: { bucket: 'Bucket 99' } });
    report('invalid decision bucket', { type: 'invalid-bucket', status: invalidBucket.status }, invalidBucket.status !== 400);
    const auditBaseline = Array.isArray(validProposal.audit) ? validProposal.audit : [];
    const droppedAudit = await request(`/api/proposals/${validProposal.id}`, { method: 'PATCH', cookie: sessions.commissioner, body: { audit: auditBaseline.slice(0, -1) } });
    report('audit history is append-only', { type: 'audit-immutability', status: droppedAudit.status }, droppedAudit.status !== 400);
    const invalidCommentType = await request(`/api/proposals/${validProposal.id}/comments`, { method: 'POST', cookie: sessions.coach, body: { text: { object: true } } });
    report('comment type boundary', { type: 'comment-type', status: invalidCommentType.status }, invalidCommentType.status !== 400);
    const oversizedComment = await request(`/api/proposals/${validProposal.id}/comments`, { method: 'POST', cookie: sessions.coach, body: { text: 'x'.repeat(2001) } });
    report('comment length boundary', { type: 'comment-length', status: oversizedComment.status }, oversizedComment.status !== 400);
    const commissionerComment = await request(`/api/proposals/${validProposal.id}/comments`, { method: 'POST', cookie: sessions.commissioner, body: { text: 'Commissioner-authored comment for ownership testing.' } });
    report('commissioner comment', { type: 'commissioner-comment', status: commissionerComment.status }, commissionerComment.status !== 201);
    const coachDelete = await request(`/api/proposals/${validProposal.id}/comments/1`, { method: 'DELETE', cookie: sessions.coach, body: {} });
    report('coach cannot remove commissioner comment', { type: 'ownership', status: coachDelete.status }, coachDelete.status !== 403);
    const badIndex = await request(`/api/proposals/${validProposal.id}/comments/not-an-index`, { method: 'DELETE', cookie: sessions.commissioner, body: {} });
    report('comment index boundary', { type: 'index', status: badIndex.status }, badIndex.status !== 400);
    const removedCommissionerComment = await request(`/api/proposals/${validProposal.id}/comments/1`, { method: 'DELETE', cookie: sessions.commissioner, body: { reason: 'Ownership test complete' } });
    report('commissioner removes own comment target', { type: 'moderation', status: removedCommissionerComment.status }, removedCommissionerComment.status !== 200);
    const unauthComment = await request(`/api/proposals/${validProposal.id}/comments`, { method: 'POST', body: { text: 'no session' } });
    report('unauthenticated comment', { type: 'permission', status: unauthComment.status }, unauthComment.status !== 401);
    const unknown = await request('/api/proposals/does-not-exist/comments', { method: 'POST', cookie: sessions.coach, body: { text: 'unknown id' } });
    report('unknown proposal id', { type: 'unknown-id', status: unknown.status }, unknown.status !== 404);

    const seeded = (await request('/api/proposals', { cookie: sessions.coach })).payload;
    const voteProposal = seeded.find(item => item.id === 'p3');
    check(Boolean(voteProposal), 'seeded vote proposal present', { present: Boolean(voteProposal) });
    const coachBallot = await request('/api/proposals/p3/votes', { method: 'POST', cookie: sessions.coach, body: { votingUnit: 'Columbia', choice: 'yes' } });
    report('coach ballot accepted', { type: 'ballot', status: coachBallot.status }, coachBallot.status !== 201);
    const duplicateBallot = await request('/api/proposals/p3/votes', { method: 'POST', cookie: sessions.coach, body: { votingUnit: 'Columbia', choice: 'no' } });
    report('ballot is immutable', { type: 'ballot-immutability', status: duplicateBallot.status }, duplicateBallot.status !== 409);
    const proxyCoach = await request('/api/proposals/p3/votes', { method: 'POST', cookie: sessions.coach, body: { votingUnit: 'Trinity', choice: 'abstain', proxyFor: 'Trinity' } });
    report('coach cannot invent proxy', { type: 'proxy-permission', status: proxyCoach.status }, proxyCoach.status !== 403);
    const princetonBallot = await request('/api/proposals/p3/votes', { method: 'POST', cookie: sessions.princeton, body: { votingUnit: 'Princeton', choice: 'yes' } });
    const pennBallot = await request('/api/proposals/p3/votes', { method: 'POST', cookie: sessions.penn, body: { votingUnit: 'Penn', choice: 'yes' } });
    const proxyAdmin = await request('/api/proposals/p3/votes', { method: 'POST', cookie: sessions.commissioner, body: { votingUnit: 'Trinity', choice: 'abstain', proxyFor: 'Trinity' } });
    report('proxy ballot recorded by staff', { type: 'proxy-ballot', status: proxyAdmin.status }, proxyAdmin.status !== 201 || princetonBallot.status !== 201 || pennBallot.status !== 201);
    const finalizedVote = await request('/api/proposals/p3/finalize-vote', { method: 'POST', cookie: sessions.commissioner });
    report('vote finalization routes to Board', { type: 'vote-finalization', status: finalizedVote.status, next: finalizedVote.payload.status }, finalizedVote.status !== 200 || finalizedVote.payload.status !== 'board' || finalizedVote.payload.vote?.result !== 'passed');
    const unauthorizedBoardDecision = await request('/api/proposals/p3/board-decision', { method: 'POST', cookie: sessions.coach, body: { outcome: 'Adopted', effectiveDate: '2027-07-01' } });
    report('coach cannot record Board decision', { type: 'board-permission', status: unauthorizedBoardDecision.status }, unauthorizedBoardDecision.status !== 403);
    const boardDecision = await request('/api/proposals/p3/board-decision', { method: 'POST', cookie: sessions.board, body: { outcome: 'Adopted', effectiveDate: '2027-07-01', reason: 'Approved after the formal vote.' } });
    report('Board decision recorded', { type: 'board-decision', status: boardDecision.status, outcome: boardDecision.payload.decision?.outcome }, boardDecision.status !== 200 || boardDecision.payload.status !== 'closed' || boardDecision.payload.decision?.outcome !== 'Adopted');

    const revision = await request('/api/proposals/p1/revisions', { method: 'POST', cookie: sessions.princeton, body: { title: 'Standardize championship host selection criteria — revised', program: 'Princeton', coSponsors: ['Penn', 'Yale'], body: 'Revised host-selection process with a published facility checklist and travel threshold.', files: ['Host selection draft v3.pdf'], changeSummary: 'Added objective travel threshold and publication requirement.' } });
    report('proposal revision preserves version history', { type: 'revision', status: revision.status, version: revision.payload.version, versions: revision.payload.versions?.length }, revision.status !== 201 || revision.payload.status !== 'review' || revision.payload.version !== 2 || revision.payload.versions?.length !== 2);
    const observerPatch = await request('/api/proposals/p5', { method: 'PATCH', cookie: sessions.observer, body: { status: 'closed' } });
    report('observer cannot change lifecycle', { type: 'scope', status: observerPatch.status }, observerPatch.status !== 403);
    const observerComment = await request('/api/proposals/p5/comments', { method: 'POST', cookie: sessions.observer, body: { text: 'Observer context note for the public record.' } });
    report('observer can comment', { type: 'observer-comment', status: observerComment.status }, observerComment.status !== 201);

    await request(`/api/proposals/${validProposal.id}`, { method: 'PATCH', cookie: sessions.commissioner, body: { bucket: 'Bucket 3', status: 'comment', statusLabel: 'Comment window', next: 'Comments close Dec 1' } });
    const openNoQuorum = await request(`/api/proposals/${validProposal.id}/open-vote`, { method: 'POST', cookie: sessions.commissioner });
    const noQuorum = await request(`/api/proposals/${validProposal.id}/finalize-vote`, { method: 'POST', cookie: sessions.commissioner });
    report('vote without quorum is not adopted', { type: 'quorum', openStatus: openNoQuorum.status, finalizeStatus: noQuorum.status, result: noQuorum.payload.vote?.result }, openNoQuorum.status !== 200 || noQuorum.status !== 200 || noQuorum.payload.vote?.result !== 'failed' || noQuorum.payload.status !== 'closed');
  } finally {
    server.kill('SIGTERM');
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log(`\nPROTOTYPE STATE ${JSON.stringify(state)}`);
  console.log(`PROTOTYPE FAILURES ${failures.length}`);
  if (failures.length) {
    console.log(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
