# CSA Portal — Wayfinder Map

## Destination

Produce a build-ready product specification for a unified CSA Portal serving coaches, assistant coaches, CSA staff, college administrative staff, senior college administrators, conference observers, Board members, and the Commissioner. The specification covers the Legislative Cycle, All-Americans, Academic Awards, full CSA season/team-match scheduling, and the shared identity, notifications, documents, audit, calendar, and administration foundation.

## Notes

- Domain: CSA governance, collegiate squash operations, legislative proposals, awards, and season scheduling.
- This is a planning map. Tickets resolve product and policy decisions; implementation is out of scope until the route is clear.
- Consult the CSA source artifacts before resolving tickets: `CSA_Coach_Portal_Design.md`, `CSA_01_Legislative_Cycle.html`, `CSA_01_Legislative_Cycle_v4.html`, `CSA-Bylaws-Full.md`, `CSA_03_All_Americans_FINAL.pdf`, `CSA_04_Academic_Awards_FINAL.pdf`, and `Responses to Documents/Coach-Questions-Tracker.md`.
- Existing implementation context: `csa-scheduler` is the current scheduler repository; the former coach-portal path is absent locally; `csa-coach-portal` is the named Railway service but its remote status was unavailable during charting.
- Preserve a clean separation between ratified policy, proposed framework, and product assumptions. Where sources conflict, the specification must record the chosen authority and the effective date.

## Decisions so far

<!-- Closed tickets are appended here. Open tickets are discovered from the issues directory. -->

- [Define CSA Portal Roles, Institutional Identity, and Access](issues/01-portal-roles-and-access.md) — Institutions default to one program account, CSA staff may split accounts, voting is per program unit, combined actions preserve separate votes, and access is Commissioner-controlled and granular.
- [Establish the Authoritative CSA Governance Rules](issues/02-authoritative-governance-rules.md) — Approved Legislative Cycle v4 controls 2026–27; final award documents are the baseline; later coach-feedback changes require separate approval.
- [Specify the Legislative Proposal Workflow](issues/04-legislative-workflow.md) — Proposals use staff review, approved-date distribution, bucketed routes, audited votes and amendments, urgent-measure paths, and public/confidential feedback channels.

## Not yet specified

- The canonical authority and effective version for legislative rules where the April 2026 framework conflicts with current bylaws or earlier legislative-cycle drafts.
- Exact institutional identity model: one member institution may have multiple programs, divisions, genders, teams, and authorized representatives.
- Whether the first production release is one coordinated launch or a staged launch while the specification still covers every module.
- The source of truth and edit authority for schedule data, results, rankings, rosters, eligibility, and academic records.
- Detailed data retention, export, privacy, and records-access policy for governance and student information.
- The degree of configurability required for future CSA processes beyond the included modules.
- The unresolved All-Americans and Academic Awards refinements surfaced in coach feedback, including criteria, timing, rounding, team awards, and exceptions.
- The final All-American eligibility and exception gate; the initial workflow should collect broad inputs without hard-coding unsettled policy.
- The Commissioner-approved notification policy: mandatory versus configurable events, batching/digests, and role-specific delivery.

## Out of scope

- CRM or recruiting workflows.
- A public-facing fan site or public social/community product.
- The sponsor-facing college-squash professional network idea recorded in the coach-question tracker.
- Replacing external systems for match results, rankings, roster management, or academic verification unless a later decision explicitly brings that work into scope.
