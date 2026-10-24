# Static API and contract analysis

Analysis date: 2026-10-24. Scope: downloaded public browser JavaScript only. The code was read as text; none of these files was executed and no API endpoint was invoked. Routes establish client expectations, not deployed server behavior, authorization guarantees, or successful application submission. Optional schemas and inactive client branches may represent historical or unreleased functionality.

## Evidence files

All files are under `evidence/public-assets/`, minified predominantly onto line 1. References below use exact filenames and searchable identifiers. [static-api-routes.json](static-api-routes.json) enumerates 120 literal route occurrences, including duplicate consumers, with zero-based character offsets into the corresponding decoded source. It excludes dynamically constructed routes and the direct `/auth/resend-verification` literal, so it is not a complete backend inventory.

| Evidence | Main content |
|---|---|
| `applicationsApi-qbeQj421.js` | Application states, receipts/traces, document review and application routes |
| `usersApi-D_wluQxc.js` | Candidate profile, preferences, auto-apply, memory, referrals, account and messaging routes |
| `subscriptionApi-D1butwwh.js` | Plan schemas, provider distinctions, billing lifecycle routes |
| `api-CZ-WWetN.js` | Redux Toolkit Query transport and cache setup |
| `contract-CBGzuKuo.js` | Path interpolation, response transformations, schema parser adapter |
| `schemas-B-MmcwHE.js` | General Zod validator implementation, not a standalone business schema catalog |
| `filter_config-D7ZTP36m.js` | Recommendation filtering, pagination merging, persistence and location/company options |
| `ats--6qonFW9.js` | ATS catalog and URL recognition/validation logic |
| `account_suspension-CxhRv-Kn.js` | Supporting imported API-origin constants; only focused static inspection here |

## Transport and response handling

`api-CZ-WWetN.js`, functions `Zi` and final `ea=Zi(...)`, configures `credentials: include`, Firebase `currentUser.getIdToken`, and `authorization: Bearer ...`. It adds `X-App-Platform`, `X-App-Source: web`, and a request ID from logging context. On an HTTP 401 it requests a forced token refresh and retries once if a token is available. Defaults retain unused query data 300 seconds, refetch after 30 seconds on mount/argument changes, and refetch on reconnect. These are frontend cache settings, not server cache guarantees.

The base URL is imported from `account_suspension-CxhRv-Kn.js`, which contains `https://api.autojobs.me/api/v1` and `https://api.tsenta.com/api/v1` plus fallback-related local-storage keys. The runtime-selected origin was not observed in this pass.

`contract-CBGzuKuo.js` substitutes encoded path parameters, throws for missing parameters, strips the leading `/api/v1` before combining with the transport base, uppercases methods, and passes query/body through. Some endpoint transforms unwrap `.data`; others call a passed Zod schema's `.parse`. Several subscription schema expressions are constructed but their endpoint transforms simply unwrap `.data`; schema presence alone does not prove response validation at that endpoint.

## Application state and data model

Source: `applicationsApi-qbeQj421.js`, initial `h`, `g`, `y`, and `k` declarations.

The status enum is `OPTIMIZING`, `OPTIMIZING_RESUME`, `OPTIMIZING_CL`, `PENDING_REVIEW`, `PENDING_RESUME_REVIEW`, `PENDING_CL_REVIEW`, `PENDING_SUBMIT_REVIEW`, `READY`, `RUNNING`, `COMPLETED`, `SKIPPED`, `FAILED`. Display groups collapse optimizing/running into In flight, all review states into Needs you, READY into Queued, and COMPLETED into Submitted. These mappings do not establish the permitted server transition graph. A review-related array excludes `PENDING_SUBMIT_REVIEW`; its use should be checked before assuming all review handling shares one branch.

Application detail fields include IDs for application/job/listing/profile; URL, company and ATS; status/error/status-message; reapply eligibility and linked reapplication; document settings; generated HTML/text cover letter; optimized profile/metadata; resume redo counter/instructions/support flags; PDF/DOCX-related URLs; timestamps; and linked emails with category, sender, thread, read state, match method/confidence. `executionTarget` is `ELECTRON | CLOUD | null`: this establishes a client contract for both targets, not an installed desktop product or currently active desktop execution.

Optimization and cover-letter modes are `off | honest | aggressive`. No algorithm or semantic definition of these modes is in this module. Profile payloads cover personal data, work authorization/preferences, background check, education, experience, projects, skills, certifications, optional DEI/coursework, styles, custom sections, order and hidden sections/header links.

Trace fields include `meta` (ATS, URL, job, duration/outcome/error), `answers`, submitted contact, application-account email and saved-password availability, timeline, derived missing fields, and `reviewChallenge.displayAnswers`. Answer entries carry field ID/label/kind/source/value, optional options/group/row, and LLM service/elapsed milliseconds/reason. Editable review fields can request location, school, company, skill, degree or discipline suggestions. This is a rich expected receipt/review contract, not proof the worker fills every field correctly.

## Application route contracts

Source: `applicationsApi-qbeQj421.js`; base below is `/api/v1`, and `A` means `/applications/{applicationId}`. Full literals and offsets are in the JSON inventory.

| Method/path | Visible request or behavior |
|---|---|
| GET `/applications/list` | `filter`, page default 1, limit default 50, optional query/source/sort; merges pages by application ID |
| GET `/applications/list/counts` | Optional query; all/submitted/in_flight/needs/failed/skipped counters |
| GET `/applications` | Page default 1, limit 20, optional sortBy/sortOrder; historical records and last-seven-days statistics |
| POST `/applications/search` | Query, searchField default all, page/limit, sortBy default createdAt and sortOrder desc |
| POST `/applications` | Forwards body; response includes applicationId, nullable jobId, URL/status, optional retry/reapply/intro flags; input schema not defined here |
| POST `A/approve` | Optional HTML and truthy forceNew; application ID accepts caller id alias |
| POST `/applications/skip-bulk` | applicationIds; single skip wraps one ID |
| POST `A/reapply` | Forwards remaining caller fields after removing applicationId |
| GET `A`, `A/detail` | Different detail contracts; do not conflate their response envelopes |
| GET `A/optimization-data` | Optimized profile, metadata, status and optional optimization flag |
| POST `A/regenerate-resume` | instructions, applyToFuture; redo availability represented in schemas |
| POST `A/skip-optimization` | No visible body |
| PUT `A/optimized-resume` | optimizedResumeData |
| GET `A/resume-url`, `A/resume-download-url` | Download accepts filename/format; preview requests inline=true |
| GET `A/cover-letter-data`, `A/cover-letter-download-url` | Download filename optional; preview uses inline=true |
| PUT `A/cover-letter` | coverLetterText and coverLetterHtml |
| POST `A/skip-cover-letter` | No visible body |
| GET `A/trace` | Structured answers/timeline/review challenge |
| GET `A/password` | Password response schema; called as an RTK mutation, likely to avoid ordinary query retention, but rationale unverified; never invoked here |
| POST `A/resume-submit` | decision plus edits, defaulting edits to an empty object; accepted decision values not specified here |
| POST `A/typeahead-suggest` | fieldId and query; label/value suggestions |
| PUT `/jobs/{jobId}/status` | status and metadata |
| GET `/cloud-executions/running` | Running execution discovery |
| GET `/tracked-applications/export` | Export endpoint; format not established |
| GET `/applications/rate-limit`, `/applications/count`, `/applications/stats` | Allowance, counts and statistics |

Signed résumé and cover-letter URL query caches default to zero retention after becoming unused. This limits cached URL lifetime in the client; actual signed URL expiry is unknown.

Allowance schema distinguishes free `{used,limit,remaining}`, monthly with cycle start/end, and packs `{used,lifetime,remaining}`, plus total and admin bypass. `limitExceeded` is computed as total equals zero without bypass. Legacy `dailyLimit` is derived from these buckets, not evidence of a daily reset. `resetsAt` uses monthly cycle end. A client admin-bypass field does not prove a bypass vulnerability; server enforcement was not tested.

## Candidate and account contracts

Source: `usersApi-D_wluQxc.js`, `T`, `U`, `W`, and initial schemas.

User schema includes Firebase UID/email, verification/onboarding flags, deletion date, acquisition source, FREE/PAID tier, extraction status (`pending | processing | completed | failed`) with start/error, profile-review flag, embeddings, cover-letter presence, messaging platform, trial end, support JWT, UI-version/onboarding markers, and timestamps. This supports asynchronous extraction and UI rollout state without identifying backend extraction models.

Profile routes support separate personal information, education/certifications/coursework, work experience/projects, skill categories, custom sections, work/preferences/DEI/background-check updates, and résumé style/order/hidden-content updates, often with optional `profileId`. Work authorization supports legacy scalar fields and a `workAuthorizations` collection. Validation helpers require authorization and sponsorship booleans; they do not determine legal eligibility.

Resume-profile CRUD uses `/users/{uid}/resume-profiles[/{profileId}]`; `set-default`, `resume`, `reimport`, and `resume/download-url` subroutes are present. Import uses multipart `resume` and `name`; upload/reimport use multipart `resume`. Other routes reupload the main résumé, retry extraction, mark reviewed, generate a PDF from HTML/filename, and return selected-profile downloads. Import MIME limits, document retention, and server sanitation are unknown.

Account and ancillary route groups, fully enumerated in the inventory:

- Firebase user creation; email-existence and password-reset requests; direct POST `/auth/resend-verification`; DELETE `/users/account` and POST `/users/account/restore`.
- GET/PUT email preferences, recommendation filters and type preferences; GET email history. Preferences expose daily/off job recommendations, on/off product updates, pause-until and timezone.
- Push-token registration/removal; acquisition and Meta attribution updates.
- Memories list/update/delete; proposals list/approve/reject. No automatic memory creation mechanism is visible here.
- Public-profile GET/PUT with `isPublic`.
- Referral submission, own referral data and vanity-code update, referral context; mobile offer-code lookup with productId/platform. Referral schema tracks invited, converted, earned credits and code customization; referral categories include user, influencer and campus ambassador.
- Cover-letter content GET/PUT; location autocomplete/details.
- Messaging OTP send/verify. Delivery implementation, challenge expiry and abuse controls are not visible.

## Auto Apply contracts and gates

Source: `usersApi-D_wluQxc.js`, schemas `M`, `N`, `P`, `F`, `I`, `z`, and auto-apply endpoints.

GET/PUT `/users/{uid}/auto-apply-config` and GET `/users/{uid}/auto-apply-runs` are defined. Configuration includes enabled state, filters, match-score threshold, daily maximum, optional per-company maximum, résumé-profile selection, optimization/cover-letter modes, last-run metadata, optional lanes, eligibility and company-profile assignments. Lanes have their own ID/profile, enabled state, filters, instructions, review-before-submit and score/mode controls.

Eligibility reasons explicitly include `NO_ACTIVE_SUBSCRIPTION` and `PLAN_TOO_LOW`. This contradicts a blanket interpretation of the public claim that every tier has identical features; actual entitlement decisions require a runtime check. Company-resume metrics include pinned-company count and per-company/profile applications over 30 days. Run metrics track considered, above-threshold, created, skippedWorkday, skippedDuplicates, company-pin reassignment and company cap/pin skips. `skippedWorkday` is only a metric name; it does not prove all Workday roles are excluded.

## Subscription model

Source: `subscriptionApi-D1butwwh.js`, declarations `l`, `u`, `d`, helper `f`, endpoint injection `p`.

Plan fields: id, name/displayName, nullable description, price and optional originalPrice, currency, interval (`WEEKLY | MONTHLY | QUARTERLY | YEARLY`), monthlyApps, trialDays, dodoProductId, active flag and timestamps. Subscription states declared are ACTIVE, ON_HOLD, PAUSED, CANCELLED, EXPIRED. Providers are DODO, REVENUECAT and ENTERPRISE. These client enums do not establish currently sold weekly plans or active enterprise accounts.

Provider UI text sends enterprise users to their organization administrator and RevenueCat users to App Store/Google Play management. No hardcoded plan prices appear in this module. GET plans/current and POST checkout/cancel/reactivate/pause/resume/portal are present. Plan preview/change/cancel-change routes support upgrade/downgrade; preview expects chargeNow, currency, effectiveAt and newPlan, and change returns kind/status/effectiveAt. Actual proration, refunds, payment webhook handling, trial policy and cancellation timing remain server-side unknowns. Pause/resume invalidate both subscription and application caches.

## Search, filters and ATS recognition

Source: `filter_config-D7ZTP36m.js`.

Recommendation queries include pagination, posting age, include/exclude text and scope, job/workplace/employment types, locations and serialized locationRules, alsoRemoteIn, included/excluded companies, sponsorship, auto-apply-only, intentWeight/searchId/profileId, graduation year/degrees/intern terms, role families, max experience, ATSes and sources. Multi-valued fields become repeated query parameters; score-count queries append rounded minScore. Source normalization keeps at most one of Naukri/Indeed, choosing the last selected, alongside other sources. Pagination merges/deduplicates by job ID. It does not deduplicate employers or equivalent postings with different IDs.

Defaults: seven-day recency, title+description scope, US country location, autoApplyOnly true. Persisted filters use local storage with migration keys; one migration applies the US default except for a sole Naukri source. The final feed query builder hardcodes autoApplyOnly true. Keyword include/exclude chips serialize with `|`. The choices include six-hour recency, seniority, workplace, employment type, 20 role families, and experience thresholds up to 15 years.

Routes: GET jobboard job details, recommendation sources/results/count, location options and company options; POST job-description fetch and per-job skip. Main filter module does not contain the recommendation model or ranking formula.

Source: `ats--6qonFW9.js`, `J` catalog, `Y=J.filter(...)`, recognizers and validator map `X`.

The catalog has **55 entries, 53 marked supported**, including Naukri/Indeed. Avature and Bullhorn are marked unsupported. This is a mixed platform catalog and a client flag count, not proof of 53 working ATS submission adapters. URL recognizers include host/path/query rules for selected platforms, some checking protocols and rejecting URL credentials; others use broader substring patterns. Examples: Taleo Business Edition requires org/rid, Paradox requires a job identifier, Personio checks tenant host and numeric job path, and Paycom checks specified host/path families. Recognition code does not contain actual form-fill or submit automation in this chunk.

## Limits and reconstruction guidance

The evidence supports a Firebase-authenticated, asynchronous application service with shared query APIs, typed review receipts, profile variants, scheduled multi-lane selection and provider-specific subscriptions. That architectural description is an inference from client contracts. It does not establish the server language, database, queue implementation, browser automation engine, LLM provider, credential encryption, authorization isolation, retention policy, webhook reliability or production success rate. The password route is sensitive functionality to design and test carefully; its presence alone is not evidence of an exposure.

Preserve status, entitlement, source-selection and review distinctions when creating a clean implementation. Use the route inventory as a comparison map, not a guarantee that a compatible server could be reconstructed completely from these files.
