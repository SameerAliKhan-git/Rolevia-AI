# Tsenta public workflows and cross-surface evidence

Inspected 2026-10-24. This report records publicly retrievable pages and developer-authored store descriptions. Public presence was observed; authenticated operation, actual submissions, OAuth, installed apps, purchases, and matching accuracy were **not tested**. Marketing examples are not runtime receipts. Store release notes document claimed changes, not independent verification.

## Public discovery and job details

The [jobs directory](https://tsenta.com/jobs) exposes title/company and location inputs; seniority, workplace, employment type, age, and visa-sponsorship filters; pagination and clear-all. Cards show company, role, location, skills, age, and sometimes compensation. The retrieved page displayed 8,528,340 jobs; that is a displayed counter, not a validated unique active-job total. Two adjacent cards had identical Liburdi co-op titles; their underlying equivalence was not checked.

A [sample public detail](https://tsenta.com/jobs/diverse-concepts-dishwasher-e5f9051e-e390-4744-9b3f-7d64b300f867) showed role/company/location, workplace and employment type, skill tags, description, requirements, employer website, and dashboard auto-apply CTA. Its role metadata said Mid Level while its experience summary said Not specified. Its date rendered `Posted-3282 days ago`; the directory called it Just now. These are directly observed content inconsistencies, not a backend diagnosis.

## Messaging

[Messaging](https://tsenta.com/messaging) advertises an iMessage/WhatsApp conversational entry point for discovery, tailoring, and applying. Login and signup are present. The retrieved text had Text to Apply and WhatsApp labels but did not establish a phone number, deep link behavior, conversation schema, authentication binding, delivery reliability, or actual application execution. Treat the flow as publicly advertised and still requiring controlled runtime testing.

## MCP / agent clients

[MCP setup](https://tsenta.com/mcp) publicly identifies the remote HTTP endpoint `https://api.autojobs.me/api/v1/mcp` and tabs for Claude Code, Claude Desktop/Web, Cursor, and Codex CLI. Its default instructions show:

```sh
claude mcp add --transport http tsenta https://api.autojobs.me/api/v1/mcp
claude mcp list
```

The documented authorization flow uses Google sign-in, an approval page, a locally held short-lived token, and refresh. Discovery, tailoring, and submission are advertised. No tool catalog, parameter schemas, scopes, rate limits, or real response payloads were obtained here. The endpoint name is observed; backend ownership/topology beyond that hostname is not established.

The [official integration article](https://tsenta.com/blog/connect-ai-job-search-agent-to-claude-chatgpt-2026) requires a completed candidate profile, work authorization/preferences, and uploaded résumé. It distinguishes its tested setup guides for Claude/Cursor/Codex from less documented ChatGPT setup. It says unsupported custom employer portals will not auto-submit, completion time varies, failed/skipped submissions receive credit refunds, and monthly allowances do not roll over. These constraints are useful reconstruction requirements but remain provider claims. The homepage's CLI language does not establish a separate distributable Tsenta CLI package; the concrete public example is an MCP connection from a third-party CLI.

## Mobile

[Mobile product page](https://tsenta.com/mobile) describes shared web/mobile accounts; swipe-to-apply; multiple résumé profiles; cloud execution after the app closes; configurable manual review versus Auto Apply; and application/recruiter status with submitted-field receipts. This supports a shared asynchronous backend interpretation, but does not reveal internal architecture.

The developer's [Apple listing](https://apps.apple.com/us/app/tsenta/id6760728258) exposes additional functionality through release history: saved/skipped jobs and skip recovery; pasted job URLs; bulk approval; draggable tracker stages; résumé document download/diffs, font/template/alignment and one-page controls; conversational résumé editing; recruiter discovery and drafted outreach; memory, public portfolio, referrals, and support chat. Version 1.5.10 (October 9) claims account deletion with typed confirmation, a scheduled date, and restoration by sign-in during a 30-day window; it removes the onboarding guide. Earlier notes say Gmail connection happens on the website. These features may have changed since the noted releases and need current UI validation.

The [Google Play listing](https://play.google.com/store/apps/details?id=com.tsenta.tsenta&hl=en_US) advertises one-tap/bulk applications, live viewing and pause, multiple profiles, history and weekly stats. Its developer reply on September 25 acknowledges room for improvement in résumé fidelity, editing, tailoring, speed, and review. This is a dated developer acknowledgment, not a measured defect rate or proof those problems remain.

## Browser extension

The [Chrome listing](https://chromewebstore.google.com/detail/tsenta/momaobilceffibifldnhndcehhdjgaob) describes detecting supported postings on LinkedIn, Indeed, Glassdoor, HiringCafe, company career sites, and 15+ ATSes, then adding a job to a cloud application queue. Users first configure their dashboard profile. Processing continues after the browser closes; review or full automation is selectable. Listing version 3.1.12 is dated October 13, 2026. Its privacy link uses the older `dashboard.autojobs.me` hostname. No extension package or permissions manifest was inspected in this subtask.

## Review controls and AI functions

[Changelog](https://tsenta.com/changelog) has two retrieved entries: June 30 introduction and July 1 Review Before Submit. The latter describes a pre-final-submit pause exposing answers, résumé, and cover letter, with inline work/education edits and explicit approval. It names Greenhouse, Workday, Ashby, Lever, Oracle, and SmartRecruiters and preserves auto-approve as an option. The sparse website changelog should not be mistaken for the complete change history given the richer mobile release notes.

[AI disclosure](https://tsenta.com/ai-disclosure) documents four stages: find, prepare, apply, track. It claims résumé-based matching, ATS-oriented scoring, per-role document generation, free-text answers grounded in prior submissions, diff approval, login and uploads, headless execution/replay, recruiter routing, and web/email/push/message notifications. Its headline says 30+ ATSes while another phrase names four plus 47 others, with 51 platform names enumerated. The exact effective coverage and per-platform capabilities remain unverified.

## Discrepancies to preserve in any reconstruction specification

| Topic | Public evidence | Correct interpretation |
|---|---|---|
| Extension execution | Homepage suggests immediate form autofill; Chrome description describes cloud queue submission | Implement only after deciding and testing the actual intended execution model |
| Free/paid quotas | Website: 25 lifetime free, 600/1,500/4,500 per cycle; Play: daily free and unlimited Pro | Store description may be stale; do not encode unlimited from that text |
| Channel prices | Website: $19/$39/$99; Apple IAP: $19.99/$39.99/$99.99 | Represent channel-specific offers; no billing was tested |
| Privacy labels | Apple declares no collection; Play declares personal-info collection | Labels differ; assess actual consent/data flow separately |
| Review requirement | AI disclosure implies all changes shown; mobile and changelog allow auto-approval | Model review as configurable, not universally mandatory |
| Supported ATS count | Website/disclosure use 30+, four plus 47, and extension uses 15+ detection | Distinguish discovery detection, submission adapters, and quality-qualified support |
| Posting age | Directory Just now versus sample detail negative thousands of days | Validate timestamps/units and unknown-date handling |

Sources for comparisons: [homepage](https://tsenta.com/), [Apple listing](https://apps.apple.com/us/app/tsenta/id6760728258), [Google Play listing](https://play.google.com/store/apps/details?id=com.tsenta.tsenta&hl=en_US), [Chrome listing](https://chromewebstore.google.com/detail/tsenta/momaobilceffibifldnhndcehhdjgaob), [AI disclosure](https://tsenta.com/ai-disclosure).

## Unverified boundaries

No account was created, email connected, OAuth granted, message sent, software installed, plan purchased, or application submitted. No internal algorithms, private datasets, credentials, ATS adapter implementation, CAPTCHA treatment, applicant-ranking guarantees, or full server contracts were recovered. Follow-up should use a consenting test account, synthetic candidate data, and controlled employer forms; real applications require explicit user authorization.
