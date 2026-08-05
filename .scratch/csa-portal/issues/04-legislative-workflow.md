# Specify the Legislative Proposal Workflow

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

What exact end-to-end workflow must the portal implement for standard proposals, revisions, comments, bucket assignment, advancement and ratification votes, Board decisions, urgent measures, emergency coaches sessions, proxy handling, feedback, deadlines, meeting records, notifications, and fallback email operations?

## Answer

- Proposers may save drafts, invite an approved co-sponsor to sign electronically, attach supporting documents, and submit once the four talking points and co-sponsor requirement are complete.
- CSA staff review submissions before distribution. Incomplete or non-qualifying submissions are returned with a recorded reason and correction path; they are never silently deleted.
- Accepted proposals remain private until the approved distribution date, then become visible to the eligible audience.
- Proposal comments are phase-gated. They become read-only when the window closes and remain part of the permanent record. Commenters may edit/delete their own comments; CSA staff may hide/delete any comment. Prior text, actor, timestamp, and reason remain in the audit history.
- The Commissioner and Board Chair assign a visible decision bucket and rationale during review. Bucket 1 uses the administrative path without a coach vote; Bucket 2 uses the full cycle and coach vote without Board ratification; Bucket 3 uses the full cycle, coach vote, and Board ratification.
- A proposal advances only after its required vote passes and the Commissioner completes final review. Failed proposals close with their result and cannot be resubmitted until the next cycle.
- Final review may approve minor wording/administrative amendments directly. Substantive amendments create a linked version, require proposer acknowledgment, and trigger another vote. The Commissioner classifies amendments and records the reasoning.
- Route-specific outcomes are used: administrative outcomes for Bucket 1, coach-vote and Commissioner-review outcomes for Bucket 2, and Adopted/Rejected/Tabled Board outcomes for Bucket 3. Board rejection or tabling requires written reasoning; adoption records an effective date and policy version.
- The portal uses versioned governance policy configuration for quorum, thresholds, voting units, deadlines, and routes. Staff may draft corrections; the Commissioner activates an approved version with an effective date, reason, and audit record.
- Vote preflight identifies the program voting unit, direct/proxy status, quorum, and threshold. Individual ballots and aggregate results remain confidential until close, then both become public. Closed votes are immutable; reopening or correction requires Commissioner authorization and a full audit record.
- Head coaches submit urgent-measure requests to the Commissioner. The Commissioner may organize and document but must take the request to the Board. The Board determines qualification and route: unanimous Board action or emergency coaches session. Urgent measures are interim, show sunset dates, and create a next-cycle follow-up. Emergency notice and proxy deadlines are configurable, with Commissioner-authorized overrides recorded.
- The portal provides a coach-visible feedback channel and confidential Commissioner channel, with a two-week acknowledgment target and annual summary.
- Detailed notification behavior remains blocked on [Confirm CSA Notification Policy with the Commissioner](11-commissioner-notification-policy.md).
