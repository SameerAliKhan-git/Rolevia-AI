# Subscription blueprint for the proposed platform

Prepared 24 October 2026. This is an implementation design for the user's subscription-based job-application platform. Except for the explicitly labeled evidence below, it is **proposed behavior, not a claim about Tsenta's private implementation**. No billing provider has been selected or configured; prices and commercial limits require a product decision. This document does not constitute an implemented or tested application.

## Observed Tsenta subscription surface

Static source: [`subscriptionApi-D1butwwh.js`](../evidence/public-assets/subscriptionApi-D1butwwh.js), a shipped client bundle inspected locally. The bundle declares:

- Plan fields including `price`, optional `originalPrice`, `currency`, `interval`, `monthlyApps`, `trialDays`, `dodoProductId`, `isActive`, and display metadata. Interval strings are `WEEKLY`, `MONTHLY`, `QUARTERLY`, `YEARLY`.
- Subscription status strings `ACTIVE`, `ON_HOLD`, `PAUSED`, `CANCELLED`, `EXPIRED`; provider strings `DODO`, `REVENUECAT`, `ENTERPRISE`.
- Client calls under `/api/v1/subscription/`: `plans`, `current`, `checkout`, `cancel`, `reactivate`, `plan/preview`, `plan/change`, `pause`, `resume`, `portal`, and `plan/cancel-change`.
- Plan-change preview fields `kind`, `chargeNow`, `currency`, `effectiveAt`, `newPlan`; change kinds `upgrade` and `downgrade`.
- UI messages directing enterprise users to an administrator and app subscribers to App Store or Google Play management.

These are static client declarations, not successful endpoint executions. They do not establish live prices, plan availability, provider activation, actual quota enforcement, pause economics, or server-side billing correctness. In particular, a `monthlyApps` field alongside weekly/annual billing intervals does not prove when application allowances reset.

## Product model and configurable catalog

Bill for access plus a bounded allowance of **confirmed application submissions**, not a promise of interviews or employment. Discovery, tailoring, and failed execution incur internal costs and must also have resource caps. Show those caps clearly before checkout.

| Proposed tier | Intended capabilities | Commercial values |
|---|---|---|
| Preview | Profile, resume parsing, job discovery, fit explanations; no unattended external submissions | Free; bounded parsing/search credits |
| Starter | Review-before-submit, application tracking, resume tailoring | Price, submission allowance, daily cap configurable |
| Pro | Starter plus opt-in automated submission, scheduling and richer preference controls | Price, allowance, concurrency and AI budgets configurable |
| Organization, deferred | Sponsored seats, centralized billing, admin policy and reporting | Separate contract and tenant scope; do not imply launch support |

Avoid launch-time “unlimited” submissions. Define immutable `plan_version` records containing: price in integer minor units, currency, billing interval, quota interval, submission quota, daily safety cap, concurrent worker cap, active search limit, resume-generation budget, model-spend budget, feature flags, trial policy, overage policy, and effective dates. Never trust price, quota, tenant, or provider product IDs supplied by a browser. An existing subscriber references a specific catalog version until an explicit migration or plan change.

Proposed defaults: no automatic paid overages, no rollover, no allowance reset on cancel/reactivate, no trial auto-submit, and no entitlement from merely opening or returning from checkout. An exhausted account can inspect history, edit preferences and renew/upgrade; new paid work is blocked. Notify users before exhaustion and when blocked.

### Billing interval versus quota interval

Use calendar-month quota windows even when billing annually, with a documented subscription anniversary anchor. Annual payment funds twelve monthly windows; it does not grant twelve months of submissions immediately. Do not add weekly billing at launch unless its separate allowance policy is specified. Calculate UTC boundaries from the provider-confirmed subscription anchor, clamp invalid month days consistently (e.g. 31 January → last day of February), and persist each boundary rather than deriving it inconsistently in workers. Display localized boundary dates.

Paid coverage and quota-window generation are separate: only create a funded window when its range falls within confirmed paid coverage. A renewal webhook, scheduled job, and reconciliation job must converge on the same unique window record. No duplicated grants after webhook retries. Mid-period purchases of additional credits, if later supported, need their own expiring grant records and explicit spending order.

## State and entitlement policy

Store provider billing status, normalized subscription status, cancellation intent, automation pause, and entitlements separately. An automation pause is not a billing pause. Proposed launch behavior pauses job execution while recurring charges continue; the UI must state that explicitly. Actual payment suspension is a separate future feature requiring provider support and an allowance policy.

| Normalized billing state | Entry | Entitlements and exit |
|---|---|---|
| `pending` | Checkout created, payment not confirmed | Preview only; enter active on verified payment, expire abandoned checkout |
| `trialing` | Explicit trial grant with start/end | Bounded preview/review features; paid submissions disabled by default; paid conversion requires consent and confirmed funding |
| `active` | Payment confirmed and coverage current | Paid features within limits; cancel intent leaves access through paid end |
| `past_due` | Renewal failure | Preserve history and profile; block new paid reservations immediately; show recovery link; no silent continued AI spend |
| `suspended` | Chargeback, risk hold, manual suspension | Block new execution; preserve audit records; review recovery separately |
| `ended` | Paid coverage expired or confirmed immediate termination | Preview/read access; a new payment starts a new funded period |

`cancel_at_period_end=true` is a flag, not immediate loss of access. Reactivation clears that flag only before paid coverage ends and only after provider acknowledgement. Late provider events cannot restore expired coverage unless they correspond to an actual paid invoice. Grace time, if introduced, must be a separate explicitly bounded entitlement, not inferred from `past_due`.

### Lifecycle rules

1. **Checkout:** server resolves the versioned plan and tenant; creates a local pending checkout with a unique idempotency key; requests provider checkout; returns a short-lived URL. Validate return URLs against a server allowlist. Return page polls local status; it never marks an account paid.
2. **Renewal:** verified payment extends paid coverage and grants the applicable allowance exactly once. Payment failure blocks new reservations. Provider retries and settlement recovery reconcile to the same invoice and grant identities.
3. **Upgrade:** server computes an expiring preview tied to current subscription revision, effective date, currency, tax/proration quote, and new plan version. User accepts that quote. Apply upgraded entitlements only after required payment succeeds. Preserve current usage. Grant only `max(0, new_period_allowance - old_period_allowance)` for the current window; no new full allowance. Quote and show this policy. Repeated upgrades compare against already granted allowance; downgrade/upgrade cycling cannot mint credits.
4. **Downgrade:** schedule for the next paid period; keep current entitlements until then. Validate pending automation settings against the next plan and notify what will pause. Cancellation of a pending change is idempotent and version-checked.
5. **Cancellation:** default end-of-period cancellation. Stop future renewal after provider acknowledgement; existing paid access remains. A user may separately stop automation immediately. Monetary refunds are a distinct support operation and do not automatically imply quota refunds.
6. **Past due/recovery:** payment update portal restores paid access only after a verified settlement. Preserve consumption for the existing quota window; do not reset allowance on recovery.
7. **Refund/dispute:** reconcile provider financial changes to paid coverage and risk state. Retain consumed usage and submission history. Never subtract historical confirmed applications to make accounting appear unused.

## Application quota and asynchronous execution

An application credit represents one unique confirmed submission to one employer requisition by one candidate. Review a duplicate policy for different resume versions or reposted jobs; default to requiring explicit review before a repeat. Use stable employer/requisition identifiers where available and a normalized fingerprint where absent. A fingerprint is a heuristic and cannot prove all duplicates.

Maintain an append-only usage ledger and a transactionally updated quota balance. For each funded window, `available = granted - committed - reserved`, which must never be negative. Separate AI/search budgets from application credits: a failed submission may release its application credit while still consuming model/compute budgets. Reserve compute allowance before expensive work as well.

| Application execution state | Quota effect | Allowed next action |
|---|---|---|
| `draft` / `awaiting_review` | None | Validate user approval and all required answers |
| `queued_reserved` | Atomically reserve one credit | Dispatch through durable outbox |
| `running_pre_submit` | Hold reservation | Prepare; cancel safely before submission boundary |
| `submission_in_flight` | Hold; record external attempt identity | Await evidence; do not replay blindly |
| `submitted_confirmed` | Commit reservation once | Store confirmation and timestamp |
| `failed_confirmed` / `cancelled_pre_submit` | Release reservation once | Retry only under a new permitted attempt policy |
| `outcome_unknown` | Hold reservation pending reconciliation | Inspect employer confirmation/history or request user review; no automatic duplicate submission |

Submission boundary means the action that can create the employer-side application. Persist `submission_in_flight`, the attempt UUID and job identity before that action. If a worker dies after an external success but before saving it, the next worker reconciles first. Browser-based forms usually provide no idempotency guarantee: exactly-once external submission cannot be promised. Internally, reservation, commit and refund are exactly-once ledger effects using unique constraints.

Unknown outcomes must remain visible with an owner, last evidence, next retry time and configurable resolution SLA. Never expire/release an unknown reservation solely because a worker lease timed out. If support grants a courtesy credit, record it as a separate adjustment; keep the unknown submission blocked from automatic replay. A later confirmation commits its original held credit, with the courtesy adjustment still auditable.

### Transaction and concurrency contract

Within one database transaction:

1. Lock the subscription entitlement/window balance and check paid coverage, account/automation state, daily cap, feature permission and available balance.
2. Resolve the application intent idempotency key and reject an incompatible payload for an existing key.
3. Enforce duplicate application protection and reserve one credit; insert a reservation and append ledger event.
4. Persist execution intent and outbox message, then commit. A separate publisher delivers messages at least once.

Workers use leases with fencing tokens so a superseded worker cannot mutate current state. A lease protects local execution ownership; it cannot revoke an external form request already in flight. Every terminal transition uses compare-and-swap on execution revision and unique `(reservation_id, effect_type)` keys. Worker retries do not create new reservations. Reserve at dispatch, not weeks before planned execution; allow only a short pre-submit TTL for work known not to have crossed the submission boundary.

At a quota rollover, old reservations remain attached to their original window. They neither disappear nor consume the new window. Stop undispatched expired reservations and release them; reconcile running attempts. Recheck entitlement immediately before crossing the submission boundary: cancellation of automation, suspension or lost coverage stops work that has not yet submitted. Already in-flight work may complete and must be recorded and charged against its existing reservation. Communicate this limit in pause/cancel UI.

## Webhooks and reconciliation

- Verify the provider's signature over the unmodified request body, using a secret from protected configuration; enforce timestamp/replay policy according to the eventual provider contract. Restrict body size. Never log secrets or raw sensitive payment data.
- Store a verified event envelope durably with a unique `(provider, event_id)` before acknowledging. Store a payload hash, receipt time, provider event time, processing state and retry count. Use a separate worker; acknowledge durable receipt rather than performing slow execution inside the HTTP request.
- Bind events to server-established provider account/customer/subscription mappings. Reject cross-tenant associations and unknown merchant accounts. Never accept tenant ownership solely from arbitrary webhook metadata.
- Duplicate events are successful no-ops. Out-of-order events trigger retrieval/reconciliation of authoritative provider state; an old cancellation cannot override a newer reactivation, and an old paid event cannot restore a disputed subscription accidentally.
- Serialize subscription changes or use optimistic revisions. Payment grants use unique provider invoice/line identity and entitlement-window keys. A provider fetch alone does not grant duplicate credits.
- Run scheduled reconciliation of open checkouts, past-due accounts, pending plan changes, paid coverage, recent invoices, and unprocessed/dead-letter events. Alert on drift, overdue webhook processing and unknown application outcomes. Reconciliation is required even when webhooks appear reliable.
- Use an outbox for entitlement-change notifications and a dead-letter queue for repeatedly failing work. Retry transient errors with backoff/jitter; surface permanent mismatches to an operator. Reprocessing must preserve the original event identity.

## Minimal data model

All user-owned records carry `tenant_id`; all queries authorize tenant access. Use UUID primary keys, UTC timestamps, integer minor-unit monetary fields, explicit ISO currency, revision fields and immutable audit events.

| Entity | Required fields and constraints |
|---|---|
| `plan_version` | plan key, version, display fields, price/currency, intervals, limits, features, active-from/to; unique plan/version |
| `billing_customer` | tenant, provider, merchant scope, external customer ID; unique provider/merchant/customer |
| `subscription` | tenant, customer, plan version, provider subscription ID, normalized/raw state, paid-through, anchor, cancellation flag, automation pause, revision |
| `subscription_change` | old/new version, kind, effective time, quote hash/expiry, provider change ID, status; one live conflicting change per subscription |
| `checkout_attempt` | tenant, plan, request key/hash, provider session ID, status, expiry; unique tenant/request key |
| `invoice` / `payment` | provider identities, amount/currency, coverage, settlement/refund/dispute states; unique provider identities |
| `quota_window` | subscription, metric, start/end, granted/reserved/committed, funding identity; unique subscription/metric/start |
| `usage_reservation` | window, application intent, quantity, state, attempt ID, timestamps, pre-submit expiry, revision; one live reservation per intent |
| `usage_ledger` | window, reservation, effect, signed deltas, reason, source event ID, actor; unique semantic effect; immutable |
| `application_intent` / `execution_attempt` | candidate/job identity, consent/profile revision, state, worker fence, outcome evidence reference, submission boundary time |
| `webhook_inbox` / `outbox` | unique source ID, payload hash, event type, processing status, retry schedule, sanitized error |
| `billing_audit` | actor, tenant, action, before/after references, reason, correlation ID; access restricted |

Resume contents and full employer answers belong in separately protected application/profile storage, not billing ledgers or provider metadata. Hosted checkout should keep raw card details outside the platform. Export/deletion workflows preserve only the billing/audit records required by the chosen retention policy and applicable obligations; implementation must define the actual jurisdiction-specific policy before launch.

## Proposed API contracts

These routes are reconstruction design choices, not a claim that Tsenta implements these request bodies. Authentication and server-side tenant derivation apply to every user endpoint. Mutation endpoints require `Idempotency-Key`; payload mismatch returns `409 idempotency_conflict`. Return a correlation ID on all errors.

| Endpoint | Request → response / rules |
|---|---|
| `GET /v1/plans` | Locale/currency filter → active versioned plans, explicit quotas and interval policy |
| `GET /v1/subscription` | → state, plan version, paid-through, cancellation/pause flags, pending change, revision, allowed actions |
| `GET /v1/usage` | → each window's grant/reserve/commit/available, reset time, AI budget status, pending unknown count |
| `POST /v1/billing/checkout` | `{plan_version_id, return_route}` → `{checkout_id, url, expires_at}`; server maps provider products |
| `POST /v1/billing/portal` | `{return_route}` → short-lived portal URL scoped to authenticated billing owner |
| `POST /v1/subscription/change-preview` | `{target_plan_version_id, expected_revision}` → `{quote_id, charge_now_minor, currency, effective_at, allowance_delta, expires_at}` |
| `POST /v1/subscription/change` | `{quote_id, expected_revision}` → `{change_id, state, action_url?}`; no paid entitlement before settlement |
| `DELETE /v1/subscription/pending-change` | expected revision → final change status; idempotent cancellation |
| `POST /v1/subscription/cancel` | `{effective:"period_end", expected_revision}` → confirmed cancellation flag and paid-through |
| `POST /v1/subscription/reactivate` | expected revision → state after provider acknowledgement |
| `PATCH /v1/automation` | `{paused, expected_revision}` → pause state, running/in-flight count; charges continue |
| `POST /v1/applications/{id}/submit` | `{profile_revision, approval_revision}` → `202 {execution_id, state, reservation_id}` or explicit gating error |
| `GET /v1/executions/{id}` | → state, outcome evidence summary, quota disposition, next action |
| `POST /v1/webhooks/{provider}` | Provider signed raw payload → durable inbox acknowledgement; no normal user authentication |

Gating errors: `payment_required`, `quota_exhausted`, `daily_limit_reached`, `automation_paused`, `approval_required`, `duplicate_application`, `stale_profile`, `stale_subscription_revision`, `outcome_requires_review`. Use `403` for authorization failures, `409` for state conflicts and duplicates, `422` for invalid input, and `429` for rate limits. Do not expose other tenants' IDs, usage, provider errors, or existence through error responses.

## Required UI behavior

Pricing distinguishes payment frequency from quota reset frequency; annual checkout shows total due and renewal terms. Subscription settings show paid-through, next charge, pending changes, cancellation action and automation pause separately. Usage shows confirmed, held/pending, remaining and reset date. Submit screens explain whether approval is required and which credit will be reserved. Unknown outcomes show “Submission outcome needs confirmation,” not “failed” with a blind Retry button. Financial charge history and application usage history are separate. Provider-managed subscriptions expose the appropriate management destination and unavailable actions explicitly.

## Verification plan before release

These are required future tests, not tests executed by this research task.

1. Concurrent requests for the last credit produce one reservation and one accepted intent; balances never go negative.
2. Repeated idempotency keys return the original result; changed payloads fail; cross-tenant reuse cannot disclose results.
3. Crash after reservation/before queue publish recovers via outbox; duplicated queue delivery cannot submit twice locally.
4. Crash immediately before/after the submission boundary produces reconciliation, not blind resubmission; stale workers cannot finalize newer attempts.
5. Verified submission commits once; definitive pre-submit failure releases once; duplicate success/failure callbacks cannot both win.
6. Unknown outcomes keep credits held through lease expiry and period rollover; courtesy credits are separately audited.
7. Duplicate/late/reordered payment events produce one funded window; invalid signatures/replays never grant access.
8. Forged browser success URLs, plan prices and customer IDs cannot create entitlements or cross tenant boundaries.
9. Annual subscribers receive monthly allowances only within funded coverage; leap-year/month-end/timezone boundaries are deterministic.
10. Upgrade payment failure retains old entitlements; repeated upgrade cycles cannot reset usage; downgrade takes effect once at the correct boundary.
11. Cancel/reactivate does not reset usage; end-of-term cancellation retains paid access; past-due recovery restores existing consumption.
12. Pause blocks new submissions, identifies already-in-flight work and does not falsely claim billing is paused.
13. Reconciliation repairs missed webhooks, expires abandoned checkouts and flags mismatched provider/local states without duplicate grants.
14. Property-based ledger tests preserve balance invariants across randomized reserves/commits/releases/grants; adversarial concurrency tests verify transaction locking.
15. End-to-end provider sandbox scenarios cover checkout, renewal, payment failure, recovery, change, cancellation, refund and dispute before enabling real billing.

## Unit economics and launch decision

Choose prices after measuring representative successful, failed and unknown application attempts across supported job sites. A quota of confirmed successes alone does not bound costs if retries and job scans are unbounded.

Let `R` be collected subscription revenue excluding tax and net of refunds/credits; `F` payment processing cost; `A` confirmed applications; `T` total attempts including failures; `c_attempt` average browser/compute cost per attempt; `c_AI` measured AI spend across parsing/tailoring/answers; `c_discovery` search/ingestion cost; `c_support` allocated support cost; and `c_storage` storage/egress cost.

`Contribution = R - F - T*c_attempt - c_AI - c_discovery - c_support - c_storage`

`Contribution margin = Contribution / R` when `R > 0`.

For planning, estimate `T = A / p_success` only when the observed success probability is representative and nonzero. Model p50 and p95 usage, retries, concurrency and support demand rather than relying only on average utilization. Annual cash collection is not twelve months of immediate profit: reserve enough to serve all paid coverage. Track cost per confirmed application, cost per attempted application, unknown-outcome rate, retry amplification, refund rate, and quota utilization by plan. Use per-account hard resource budgets and global spend circuit breakers; show a clear paused state when a budget blocks execution.

Launch gates: select provider and supported jurisdictions/currencies; decide actual price and limits; validate provider event semantics; implement and test the ledger and reconciliation; verify external submission evidence; finalize cancellation/refund and data retention policies; complete sandbox billing qualification. Public client code alone establishes none of those gates.
