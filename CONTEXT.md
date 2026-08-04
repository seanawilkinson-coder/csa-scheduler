# CSA Portal Domain

This context defines the people, institutions, and governance units represented in the unified CSA Portal.

## Membership and identity

**Institution**:
The college or university that participates in the CSA and may operate one or more independent programs.
_Avoid_: Account, school account

**CSA program**:
A CSA-participating institutional program account that participates independently in portal workflows, including voting. An institution normally has one program account, but may have multiple accounts—often one for men's squash and one for women's squash—when its governance, coaching, or voting must be separate.
_Avoid_: College account, combined team

**Program account**:
The portal identity and authorization boundary for one CSA program. A single person may be authorized for multiple program accounts, but each program retains its own submissions, votes, and records.
_Avoid_: Institution account, shared team account

**Program-account split**:
A CSA staff decision that separates one institution into multiple program accounts when their governance, coaching, or voting must be independent. The split is not inferred solely from college name or gender, and the decision should preserve prior records.
_Avoid_: Automatic team split, gender split

**Program voting unit**:
The men's or women's program-level unit that receives an independent vote in a CSA decision. A combined program account may submit multiple voting-unit records in one action, while a split institution requires separate authorized representatives to act for each unit.
_Avoid_: Institution vote, combined vote

**Combined voting action**:
A single user interaction that records one explicitly chosen vote for each selected program voting unit. The choices may differ by unit, and the system retains separate vote records and audit entries.
_Avoid_: One institution-wide vote, shared ballot

**Proxy**:
A temporary delegation of a program voting unit's authority to an eligible CSA Board member or an institution-assigned representative—such as an assistant coach—for a defined meeting or decision. Whether and when proxies are legally effective remains a governance decision.
_Avoid_: Permanent substitute, shared voter

**Proxy registration deadline**:
The proxy must be communicated and registered at least 72 hours before the relevant meeting or vote.
_Avoid_: Last-minute proxy, 48-hour proxy

**Proxy deadline exception**:
The Commissioner may override the 72-hour registration deadline when an exceptional situation arises. The exception should be attributable to the Commissioner and preserved in the governance audit trail.
_Avoid_: Informal late proxy, automatic emergency proxy

**Institutional representative**:
An assistant coach or college administrator authorized to use the portal for an institution or program account. The representative may view, submit, and comment within their scope, but has no official voting authority unless separately designated as a proxy.
_Avoid_: Automatic voter, standing proxy

**Senior administrator**:
An institution-level observer with read and comment access across that institution's legislative, awards, and scheduling information. Senior-administrator access does not itself grant submission, edit, or voting authority.
_Avoid_: Institution owner, automatic administrator

**Board member**:
A CSA governance participant with read and comment access to legislative proposals, scheduling, and published award outcomes. Board members do not receive editing or voting authority solely from Board membership; detailed award nominations and academic records require a separate assigned role.
_Avoid_: Global administrator, automatic award reviewer

**CSA staff member**:
A CSA operations user whose portal role and module scope are explicitly assigned by the Commissioner. Staff access is not implied by employment status and may differ by workflow.
_Avoid_: Automatic administrator, global staff access

**Staff permission assignment**:
The Commissioner grants CSA staff explicit permissions by module and action, such as scheduling editor, awards coordinator, legislative administrator, or read-only auditor. Permissions are auditable and may be combined for one staff member.
_Avoid_: Blanket staff role, implicit access

**Access deactivation**:
When a coach or administrator leaves a program, the Commissioner or an assigned CSA staff member deactivates the user's access promptly. Historical submissions, comments, votes, and audit records remain preserved and attributable.
_Avoid_: Deleting the user, erasing history

**Conference observer**:
A conference representative with comment-only access to legislative proposals during designated comment windows. Awards, voting, and scheduling access require an explicit CSA-assigned scope.
_Avoid_: Conference administrator, automatic stakeholder access

**Head coach / program representative**:
The default representative for a CSA program account. The head coach may request or manage assistant-coach and administrator access, subject to final approval and control by CSA staff.
_Avoid_: Institution owner, automatic proxy

**Approved Legislative Cycle v4**:
The approved CSA legislative governance framework that controls portal behavior for the 2026–27 season, including its proposal stages, voting rules, proxy process, Board process, and emergency pathways.
_Avoid_: Draft legislative framework, earlier cycle draft

**Proposal submission**:
A legislative proposal's structured four-part form plus its approved co-sponsor requirement. A proposer may save a draft, request an electronic co-sponsor signature, attach supporting documents, and submit only when required fields and signatures are complete.
_Avoid_: Email proposal, informal submission

**Proposal revision**:
A new version of an advanced proposal that preserves the prior submitted version, its authorizations, attached documents, and audit history.
_Avoid_: Overwriting the proposal, silent edit

**Proposal review gate**:
A CSA staff review step between proposer submission and coaching-body distribution. The gate confirms required content, co-sponsorship, timing, and eligibility for the current cycle before broader visibility.
_Avoid_: Automatic publication, informal screening

**Returned proposal**:
A submitted proposal that CSA staff do not accept for the current cycle and return to its proposer with a recorded reason and correction path. The record is retained; it is not silently rejected or deleted.
_Avoid_: Deleted submission, silent rejection

**Approved distribution date**:
The policy-defined date when an accepted proposal becomes visible to its eligible audience. Acceptance alone does not publish the proposal early.
_Avoid_: Immediate publication, staff acceptance date

**Legislative comment window**:
The approved phase during which eligible users may add comments to a proposal. When the window closes, the thread becomes read-only and remains part of the permanent proposal record.
_Avoid_: Open-ended comments, deleted discussion

**Comment moderation record**:
The visible proposal thread may reflect a user's edit or deletion, or CSA staff moderation, while the audit record preserves prior text, actor, timestamp, and reason where applicable.
_Avoid_: Silent edit, permanent deletion

**Legislative stage advancement**:
A proposal advances only after its required vote passes and the Commissioner completes final review. The portal records both the vote result and the Commissioner's advancement decision.
_Avoid_: Automatic advancement, vote-only advancement

**Failed proposal**:
A proposal that does not pass its required vote. It closes with the recorded result and is ineligible for resubmission until the next legislative cycle.
_Avoid_: Silent failure, immediate resubmission

**Approved with amendments**:
A final-review outcome in which minor wording or administrative corrections are accepted directly, while substantive changes create a new linked proposal version, require proposer acknowledgment, and trigger another required vote.
_Avoid_: Silent post-vote rewrite, amended approval without re-vote

**Decision bucket**:
The governance classification assigned to a proposal that determines whether it follows the full legislative cycle, requires a coach vote, requires Board review, or may be handled through an administrative or abbreviated path. The bucket is a governance decision, not a user-selected workflow option.
_Avoid_: User-selected priority, automatic route

**Bucket assignment**:
During staff review, the Commissioner and Board Chair assign a proposal's decision bucket and rationale. Eligible participants can see the assignment; only authorized CSA staff may change it.
_Avoid_: Hidden routing, proposer-selected bucket

**Bucket route**:
Bucket 1 uses an administrative path without a coach vote; Bucket 2 follows the full cycle and ends with a coach vote; Bucket 3 follows the full cycle, a coach vote, and Board ratification.
_Avoid_: Uniform proposal workflow, automatic Board review

**Governance policy configuration**:
The portal's quorum, threshold, voting-unit, deadline, and route rules are versioned policy data rather than hard-coded behavior. Authorized staff may draft corrections; the Commissioner activates an approved version with an effective date, reason, and audit record while prior versions remain available for historical decisions.
_Avoid_: Hard-coded governance rule, silent policy change

**Vote preflight**:
Before final submission, the portal shows the voter's program voting unit, whether representation is direct or by proxy, current quorum status, and the governing threshold. A voter submits one final ballot per voting unit for that decision.
_Avoid_: Ambiguous ballot, untracked proxy vote

**Vote publication**:
Individual ballots and the aggregate result remain confidential until the vote closes. After finalization, both the individual ballots and aggregate result become public to the eligible audience.
_Avoid_: Live vote reveal, aggregate-only publication

**Vote finalization**:
A closed vote is immutable. Reopening or correcting it requires a Commissioner-authorized action that records the reason, actor, time, and resulting change in the audit trail.
_Avoid_: Editable ballot, silent correction

**Urgent measure**:
A separate governance workflow for an approved urgent-action pathway. The portal records the qualifying basis, route, notice, decision, interim status, sunset date, and follow-up task that carries the measure into the next standard legislative cycle.
_Avoid_: Informal exception, permanent emergency policy

**Urgent-measure request path**:
A head coach submits an urgent-measure request to the Commissioner. The Commissioner reviews the request and routes it to the Board or to an emergency coaches session under the approved pathway.
_Avoid_: Direct coach-to-Board request, untriaged emergency

**Mandatory urgent escalation**:
The Commissioner may organize and document an urgent-measure request but may not silently decline it; the request must be brought to the Board for consideration.
_Avoid_: Commissioner-only rejection, unrecorded escalation

**Urgent route decision**:
The Board's recorded decision determines whether an urgent request qualifies and whether it proceeds through the unanimous-Board path or an emergency coaches session.
_Avoid_: Commissioner-selected route, unrecorded Board decision

**Emergency policy override**:
Emergency notice periods and proxy deadlines are configurable policy values. The Commissioner may override them when circumstances require flexibility, with the override reason, effective timing, and authorization preserved in the audit trail.
_Avoid_: Hard-coded emergency deadline, undocumented exception

**Proposal history**:
A chronological, append-only record of a proposal's stage changes, reviews, votes, amendments, comment-window changes, Board decisions, actors, programs, timestamps, reasons, and linked documents.
_Avoid_: Status-only record, scattered email history

**Route-specific decision outcome**:
The portal uses a shared auditable decision record with outcome choices appropriate to the route: administrative decisions for Bucket 1, coach-vote and Commissioner-review outcomes for Bucket 2, Board outcomes for Bucket 3, and interim authorization outcomes for urgent measures.
_Avoid_: Board outcome on every route, generic status without authority

**CSA feedback channel**:
The portal provides a feedback channel visible to eligible coaches and a separate confidential channel to the Commissioner. The Commissioner acknowledges feedback within two weeks and includes it in the annual feedback summary.
_Avoid_: Back-channel-only feedback, proposal-only feedback

**Automatic All-American selection**:
The Commissioner enters or uploads official Individuals results, confirms the top 16 players per gender, and locks those selections before the nomination workflow opens. Locked automatic selections are not overridden through the coach ballot.
_Avoid_: Coach-overridden automatic selection, inferred tournament result

**All-American eligibility intake**:
The nomination workflow collects broad eligibility inputs—match participation, Individuals participation, good-standing status, supporting data, and injury/illness documentation—while the final eligibility gate remains configurable until CSA settles the policy.
_Avoid_: Hard-coded eligibility assumption, rejected nomination without policy

**All-American statistical packet**:
The Commissioner-provided nominee packet that eligible coaches review before voting. Coaches certify review and report errors; the ballot remains locked for a coach until the required certification is complete.
_Avoid_: Unreviewed ballot, coach-supplied packet

**All-American voter eligibility**:
The portal derives the eligible-voter list from the approved ranking snapshot and nominee pool, while allowing the Commissioner to correct or override the list with a recorded reason. The calculation remains refinable policy logic.
_Avoid_: Unbounded ballot access, unexplained override

**Final award documents**:
The approved All-Americans and Academic Awards documents used as the portal's current policy baseline. Coach feedback and proposed changes may inform later revisions but do not change portal behavior until separately approved.
_Avoid_: Coach-question proposal, informal criteria

**Passwordless portal identity**:
A single person identity authenticated through a one-time, expiring email link or code sent only to a Commissioner-approved email address. The identity may be linked to multiple program accounts; the portal has no open self-registration or SSO dependency.
_Avoid_: Shared login, password account, SSO identity

## Portal proposal lifecycle

**Annual Legislative Cycle**:
The named governance cycle for a season, beginning with the Commissioner's memo and submission window and ending with the Board outcome. A proposal always belongs to one cycle; the cycle is not just a date range or a dashboard filter.
_Avoid_: Current proposals, active year, rolling queue

**Legislative proposal**:
An authored policy submission tied to a program account and cycle. Its identity is stable across review, discussion, voting, and decision; its visible stage describes where it is in the cycle, not a replacement record.
_Avoid_: Row, card, ticket, request

**Proposal draft**:
A saved but not-yet-submitted proposal. It remains private to its authorized proposer and is incomplete as a governance submission until the proposer explicitly submits it for staff review.
_Avoid_: Submitted proposal, pending review

**Proposal submission**:
The explicit act that moves a completed proposal draft into the CSA staff review gate. Submission is an auditable event; saving a draft is not submission, and a proposal cannot be treated as distributed before staff acceptance.
_Avoid_: Save, publish, send

**CSA staff review gate**:
The intake stage in which authorized CSA staff verifies the proposal's required content, co-sponsorship, cycle timing, and eligibility before distribution. A proposal at this gate is not yet open for the coaching body to discuss.
_Avoid_: Automatic publication, informal screening

**Accepted and distributed proposal**:
A proposal that has passed the staff review gate and has been shared with its eligible participants for the current cycle. Acceptance and distribution are one recorded governance transition for this portal surface; they are not implied by a proposal's existence.
_Avoid_: Approved forever, publicly published

**Legislative comment window**:
The phase in which eligible coaches, administrators, and other explicitly scoped participants may add attributable written comments to an accepted proposal. When it closes, the thread is read-only but remains part of the proposal record.
_Avoid_: Open comments, chat, deleted discussion

**Proposal comment**:
An attributable contribution to a proposal's visible discussion thread. A comment is distinct from an audit event: the comment carries the participant's words, while the audit records the fact that it was added, edited, or removed.
_Avoid_: Note, private message, anonymous feedback

**Comment moderation record**:
The visible representation of a removed or moderated comment, paired with preserved original text, actor, timestamp, and reason in the proposal history. Removal changes what participants see; it does not erase the record.
_Avoid_: Hard delete, silent edit

**Decision bucket**:
The Commissioner-and-Board-Chair governance classification assigned during staff review. Bucket 1 uses an administrative path; Bucket 2 follows the standard cycle and coach vote; Bucket 3 adds Board ratification. The proposer does not choose the bucket.
_Avoid_: Priority, user-selected route, label-only tag

**Proposal history**:
The chronological, append-only record of lifecycle transitions, decisions, comments, moderation, actors, dates, reasons, and linked material. The current stage is a summary of this history, not a substitute for it.
_Avoid_: Status-only record, activity feed without provenance

**Record owner**:
The program account and authorized proposer responsible for the proposal's submission. Ownership governs who may create or continue the proposal; it does not grant authority to assign a decision bucket, accept distribution, or make a governance decision.
_Avoid_: Whoever last edited it, institution-wide owner

### Lifecycle invariants

- A draft is not in staff review; only an explicit submission creates that transition.
- Only an authorized representative may submit for a program account; a Commissioner may act across program accounts when governance authority requires it.
- Only authorized CSA staff may assign a decision bucket, accept and distribute, return a proposal, or record a route-specific decision.
- A proposal must not be open for comments before acceptance and distribution, and a closed comment window must reject new comments while preserving its thread and history.
- Removing a comment may alter its visible text but must preserve attribution, original text, removal reason, and the moderation event.
- Lifecycle history is append-only. A current summary may be updated, but prior events cannot be rewritten or dropped.
- A proposal's title, program, and stage are human-readable fields; the stable proposal identity is the record itself, not its position in a list.

### Current portal slice

The portal currently demonstrates the submission, staff review, bucket assignment, acceptance and distribution, comment-window, comment moderation, coach voting, Board decisions, proposal revisions, scoped roles, and append-only history behaviors. Urgent measures and policy configuration remain governed domain concepts that must be added as explicit transitions rather than represented by generic status labels.

## Expanded governance lifecycle

**Coach vote**:
A time-bounded decision in which each eligible program voting unit may submit one ballot for an advanced proposal. The vote is governed by the active cycle policy, including quorum, advancement threshold, representation, and proxy rules.
_Avoid_: Poll, survey, institution-wide vote

**Ballot**:
The immutable choice submitted for one program voting unit, including the choice, voting unit, direct or proxy representation, voter identity, and submission time. A later correction does not edit the ballot; it creates a Commissioner-authorized correction record.
_Avoid_: Editable vote, anonymous count, shared institution ballot

**Vote result**:
The computed outcome of a finalized coach vote, including represented units, quorum, yes/no/abstain counts, threshold, and whether the proposal advanced. A result is not public as final until the Commissioner closes the vote.
_Avoid_: Live tally, manual status label

**Board decision**:
The Board's route-specific final outcome for a Bucket 3 proposal after a passing coach vote. The decision must be Adopted, Rejected, or Tabled, and Adopted requires an effective date while Rejected and Tabled require written reasoning.
_Avoid_: Commissioner-only approval, generic close

**Proposal version**:
An immutable submitted form of a proposal. A new version preserves the prior version's content, documents, authorizations, comments, votes, and history while becoming the current version for any future action.
_Avoid_: Overwrite, autosave revision, silent edit

**Revision request**:
An explicit request to revise an advanced proposal. The proposer may create a new proposal version only through the permitted revision path; substantive changes require proposer acknowledgment and another required vote.
_Avoid_: Inline edit, post-vote rewrite

**Scoped role**:
An identity's authorized role and module permissions for one or more program accounts. Role names do not grant blanket access: a conference observer may comment, a Board member may decide only within the Board route, and CSA staff act only within assigned modules.
_Avoid_: Preview role, global administrator

### Expanded lifecycle invariants

- A ballot is one-per-voting-unit per open vote; changing a choice requires a new authorized correction event, not mutation of the prior ballot.
- A vote cannot finalize without the configured quorum. A passing vote also requires the active route threshold; an abstention is represented and does not silently become a no vote.
- Individual ballots remain confidential until vote finalization; the finalized result and ballots are then published to the eligible audience.
- A passing Bucket 2 vote moves to Commissioner final review; a passing Bucket 3 vote moves to Board decision. A failed vote closes the proposal for the cycle.
- A Board decision must match the route. Bucket 1 does not enter a coach vote, and Bucket 2 does not require Board ratification.
- Revisions never destroy the prior proposal version. The current version and all prior versions remain attributable and auditable.
- Role scope is enforced at the action boundary. UI affordances may explain access, but they cannot create authority.
