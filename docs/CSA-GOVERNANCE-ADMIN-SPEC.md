# CSA Governance Administration

Status: implementation spec for the Commissioner and legislative administrator workspace.

## Purpose

Administration is the operating surface for the people who keep the legislative cycle moving. It answers four questions in one place:

1. What needs a governance action now?
2. Which cycle and policy rules are active?
3. Who is authorized to act, and is that access still active?
4. What changed, by whom, and when?

The surface is a register and command rail. It does not become a spreadsheet, a role preview, or a second proposal workspace.

## Development access

Local development exposes a commissioner-only username/password path so the full governance workspace can be exercised without an email provider. The default identity is `commissioner@csasquash.org` and the default password is `CSA-commissioner-dev-2026`; `CSA_DEV_USERNAME`, `CSA_DEV_PASSWORD`, and `CSA_DEV_USER_EMAIL` override them. Hosted environments require the explicit `CSA_DEV_AUTH_ENABLED=true` flag, and this path should be removed or disabled before production hardening; it does not replace approved-email sign-in.

## Authority model

| Capability | Commissioner | Legislative administrator | Other roles |
| --- | --- | --- | --- |
| See administration overview | Yes | Yes | No |
| Move proposals through staff review | Yes | Yes | No |
| Open/finalize coach votes | Yes | Yes | No |
| Record Bucket 1 decisions | Yes | Yes | No |
| Manage approved identities | Yes | Yes when `legislative:access` or `legislative:admin` is assigned | No |
| Change cycle dates and phase | Yes | Yes when `legislative:configuration` or `legislative:admin` is assigned | No |
| Activate policy values | Yes | Yes when configuration authority is explicitly assigned | No |
| Read consolidated governance audit | Yes | Yes when `legislative:records` or `legislative:admin` is assigned | No |
| Override an exceptional deadline or proxy rule | Yes, with reason | No unless separately assigned by a later policy decision | No |

Commissioner authority is role-based. Administrator authority is permission-based and must be visible in the access register.

## Panel structure

### 1. Administration overview

The first view is a working queue, not a KPI mosaic:

- active cycle and next deadline;
- proposal counts by governed stage;
- access register health: active and inactive identities;
- records needing action now, ordered by stage and deadline;
- recent administration and proposal audit events.

Each queue row opens the existing proposal record drawer. The drawer remains the single place for proposal actions, version history, discussion, and decision packets.

### 2. Cycle and policy

The Commissioner or an explicitly authorized administrator can update:

- cycle status and phase;
- cycle note and timezone;
- named milestone dates;
- policy version and effective date;
- quorum, yes/no threshold, eligible voting units, and proxy registration window.

Saving a policy change retires the previous policy into policy history. The active policy is the only policy used for newly opened votes; finalized votes retain their captured policy values.

### 3. Access register

The register supports:

- adding an approved identity without granting access by implication;
- assigning a role, program scope, and explicit permissions;
- deactivating or reactivating an identity;
- preventing self-deactivation;
- retaining historical records after deactivation.

An added identity is approved for sign-in only after its active state and permissions are set. Email delivery remains an infrastructure concern; the register is the authority source.

### 4. Audit register

The audit register combines administration events and proposal lifecycle events. Every entry has an actor, timestamp, scope, and when relevant a proposal, changed field list, reason, or policy version.

Audit history is append-only from the panel. No form accepts an audit replacement.

## Workflows

### Start-of-cycle review

1. Commissioner opens Administration.
2. Confirms cycle phase, dates, timezone, and active policy.
3. Checks inactive identities and program scope.
4. Saves any correction once; the configuration event appears in the audit register.

### Staff review queue

1. Administrator opens a review row.
2. Assigns a decision bucket or returns the proposal with a reason.
3. Accepts and distributes eligible proposals.
4. Opens or finalizes the vote when the route allows it.
5. The next action and audit trail update from the transition.

### Identity approval

1. Administrator adds the person and email.
2. Assigns role, program scope, and permissions explicitly.
3. Saves the record.
4. The access event appears in the consolidated audit.
5. Deactivation removes current access while preserving authored records.

### Policy correction

1. Commissioner edits the active policy values.
2. The previous policy is moved to policy history with retiring actor and timestamp.
3. The new version becomes active for future governed transitions.
4. Existing vote records remain tied to their captured policy version.

## Non-negotiable invariants

- UI visibility never grants authority; every mutation is checked on the server.
- A user cannot deactivate their own current session.
- A review-stage proposal remains private outside its proposer and governance staff.
- A policy or deadline change creates an attributable configuration event.
- A proposal audit and an administration audit cannot be edited through a client payload.
- No identity may be silently replaced; email uniqueness is enforced.
- No policy change rewrites the prior policy or finalized vote.

## Open decisions

- Production outbound mail provider and delivery retry policy.
- Whether a legislative administrator may receive explicit exception authority for late proxy or deadline changes.
- Whether administration should eventually split into separate modules for legislative, scheduling, and awards operations.
