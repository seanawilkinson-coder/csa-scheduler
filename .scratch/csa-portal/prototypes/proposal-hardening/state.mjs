// PROTOTYPE — pure case generation and run-state reducer.

const PROGRAMS = ['Columbia', 'Columbia Men', 'Columbia Women'];

function baseCase(index, overrides = {}) {
  return {
    index,
    label: `proposal ${index}`,
    kind: 'valid-submit',
    auth: 'coach',
    expectedCreate: 201,
    expectedState: 'review',
    body: {
      title: `Hardening proposal ${index}`,
      program: PROGRAMS[index % PROGRAMS.length],
      coSponsors: ['Princeton', 'Penn'],
      body: `Current issue: proposal ${index}.\n\nAssociation impact: validates the shared legislative record.\n\nFinancial implications: none expected.\n\nBenefit to the student-athlete: clearer, fairer decision-making.`,
      files: [],
      proposer: 'Impostor Name',
      status: 'closed',
      comments: [{ author: 'Impostor', text: 'must be discarded' }],
      audit: [{ event: 'must be discarded' }],
      arbitrary: 'must not be persisted'
    },
    ...overrides
  };
}

export function buildProposalCases() {
  const cases = Array.from({ length: 100 }, (_, offset) => baseCase(offset + 1));

  cases[60] = baseCase(61, { kind: 'unicode', body: { title: 'Équité 🏛️ — student-athlete voice', program: 'Columbia', body: 'Issue: naïve ranking inputs.\nImpact: naïve systems miss context.\nBenefit: equitable review.', files: [] } });
  cases[61] = baseCase(62, { kind: 'markup-string', body: { title: '<img src=x onerror=alert(1)> & policy', program: 'Columbia', body: '<script>not executable</script>\nA plain-text proposal body.', files: [] } });
  cases[62] = baseCase(63, { kind: 'trim-boundary', body: { title: '   Trimmed title   ', program: ' Columbia ', body: '  Trimmed body  ', files: [] } });
  cases[63] = baseCase(64, { kind: 'duplicate-title', body: { title: 'Same title, distinct record A', program: 'Columbia', body: 'Duplicate titles are allowed when the records remain distinct.', files: [] } });
  cases[64] = baseCase(65, { kind: 'duplicate-title', body: { title: 'Same title, distinct record A', program: 'Columbia', body: 'The second record has the same title and must still receive a unique id.', files: [] } });
  cases[65] = baseCase(66, { kind: 'max-valid-title', body: { title: 'T'.repeat(160), program: 'Columbia', body: 'x', files: [] } });
  cases[66] = baseCase(67, { kind: 'minimal-valid', body: { title: 'x', program: 'Columbia', body: 'x', files: [] } });
  cases[67] = baseCase(68, { kind: 'multiline', body: { title: 'Line one\nLine two', program: 'Columbia', body: 'First line\n\nSecond line\nThird line', files: ['policy draft.pdf'] } });
  cases[68] = baseCase(69, { kind: 'many-files', body: { title: 'Many supporting documents', program: 'Columbia', body: 'Document index test.', files: Array.from({ length: 20 }, (_, i) => `support-${i + 1}.pdf`) } });
  cases[69] = baseCase(70, { kind: 'draft', expectedState: 'draft', body: { title: 'A saved draft', program: 'Columbia', body: 'This is not ready for staff review.', files: [], submissionState: 'draft' } });

  cases[70] = baseCase(71, { kind: 'missing-title', expectedCreate: 400, body: { program: 'Columbia', body: 'Missing title.', files: [] } });
  cases[71] = baseCase(72, { kind: 'blank-title', expectedCreate: 400, body: { title: '   ', program: 'Columbia', body: 'Blank title.', files: [] } });
  cases[72] = baseCase(73, { kind: 'missing-program', expectedCreate: 400, body: { title: 'Missing program', body: 'Missing program.', files: [] } });
  cases[73] = baseCase(74, { kind: 'wrong-program', expectedCreate: 400, body: { title: 'Out of account', program: 'Harvard', body: 'A coach must not submit for another institution.', files: [] } });
  cases[74] = baseCase(75, { kind: 'missing-body', expectedCreate: 400, body: { title: 'Missing body', program: 'Columbia', files: [] } });
  cases[75] = baseCase(76, { kind: 'blank-body', expectedCreate: 400, body: { title: 'Blank body', program: 'Columbia', body: '   ', files: [] } });
  cases[76] = baseCase(77, { kind: 'array-payload', expectedCreate: 400, rawBody: [] });
  cases[77] = baseCase(78, { kind: 'null-payload', expectedCreate: 400, rawBody: null });
  cases[78] = baseCase(79, { kind: 'wrong-title-type', expectedCreate: 400, body: { title: { bad: true }, program: 'Columbia', body: 'Bad title type.', files: [] } });
  cases[79] = baseCase(80, { kind: 'wrong-body-type', expectedCreate: 400, body: { title: 'Bad body type', program: 'Columbia', body: ['not', 'text'], files: [] } });
  cases[80] = baseCase(81, { kind: 'wrong-files-type', expectedCreate: 400, body: { title: 'Bad files type', program: 'Columbia', body: 'Bad files type.', files: 'not-an-array' } });
  cases[81] = baseCase(82, { kind: 'wrong-file-entry', expectedCreate: 400, body: { title: 'Bad file entry', program: 'Columbia', body: 'Bad file entry.', files: ['ok.pdf', 42] } });
  cases[82] = baseCase(83, { kind: 'oversized-title', expectedCreate: 400, body: { title: 'T'.repeat(161), program: 'Columbia', body: 'Too long.', files: [] } });
  cases[83] = baseCase(84, { kind: 'oversized-body', expectedCreate: 400, body: { title: 'Oversized body', program: 'Columbia', body: 'x'.repeat(4001), files: [] } });
  cases[84] = baseCase(85, { kind: 'too-many-files', expectedCreate: 400, body: { title: 'Too many files', program: 'Columbia', body: 'Too many files.', files: Array.from({ length: 21 }, (_, i) => `file-${i}.pdf`) } });
  cases[85] = baseCase(86, { kind: 'blank-file-name', expectedCreate: 400, body: { title: 'Blank file name', program: 'Columbia', body: 'Blank file name.', files: ['   '] } });
  cases[86] = baseCase(87, { kind: 'wrong-program-type', expectedCreate: 400, body: { title: 'Bad program type', program: ['Columbia'], body: 'Bad program type.', files: [] } });
  cases[87] = baseCase(88, { kind: 'unauthenticated', auth: 'none', expectedCreate: 401, body: { title: 'No session', program: 'Columbia', body: 'No session.', files: [] } });
  cases[88] = baseCase(89, { kind: 'server-owned-fields', body: { title: 'Server-owned fields', program: 'Columbia', body: 'Server-owned field test.', files: [], id: 'p-owned-by-client', proposer: 'Not Jordan', status: 'closed', statusLabel: 'Fake', next: 'Fake', comments: [{ text: 'Fake' }], audit: [{ event: 'Fake' }] } });
  cases[89] = baseCase(90, { kind: 'empty-files', body: { title: 'No supporting files', program: 'Columbia', body: 'No files is valid.', files: [] } });

  cases[90] = baseCase(91, { kind: 'quotes-and-entities', body: { title: `Board's “quoted” rule & review`, program: 'Columbia', body: `Quotes, ampersands, and apostrophes remain plain text.`, files: [] } });
  cases[91] = baseCase(92, { kind: 'zero-width', body: { title: 'Zero\u200Bwidth marker', program: 'Columbia', body: 'Invisible characters must not break the record.', files: [] } });
  cases[92] = baseCase(93, { kind: 'long-valid-body', body: { title: 'Long but valid body', program: 'Columbia', body: 'x'.repeat(4000), files: [] } });
  cases[93] = baseCase(94, { kind: 'slash-title', body: { title: 'Rules / safety / travel', program: 'Columbia', body: 'Slash-heavy title remains one title.', files: [] } });
  cases[94] = baseCase(95, { kind: 'numeric-looking-title', body: { title: '1. First proposal', program: 'Columbia', body: 'Numbering begins at one.', files: [] } });
  for (let index = 96; index <= 100; index += 1) {
    cases[index - 1] = baseCase(index, {
      kind: 'concurrent-create',
      concurrentGroup: 'burst-1',
      body: { title: 'Concurrent title', program: 'Columbia', body: `Concurrent create ${index}.`, files: [] }
    });
  }

  for (const item of cases) {
    if (item.expectedCreate === 201 && item.body && !Object.hasOwn(item.body, 'coSponsors')) item.body.coSponsors = ['Princeton', 'Penn'];
  }

  return cases;
}

export function initialRunState() {
  return { attempts: 0, created: 0, rejected: 0, actions: 0, failures: 0, lastAction: 'initialised' };
}

export function reduceRunState(state, event) {
  const next = { ...state, attempts: state.attempts + (event.type === 'create' ? 1 : 0), actions: state.actions + 1, lastAction: event.label };
  if (event.type === 'created') next.created += 1;
  if (event.type === 'rejected') next.rejected += 1;
  if (event.failed) next.failures += 1;
  return next;
}
