# ROLEVIA AI vs TSENTA AI — COMPETITIVE FEATURE MATRIX & GAP AUDIT

**Product:** Rolevia AI (`RoleviaAI`)  
**Domain:** https://roleviaai.co.in  
**Principal Benchmark:** Tsenta AI (https://tsenta.com)  
**Baseline Release:** Release 0.2 Application Intelligence & Automation  
**Audit Date:** October 2026  
**Auditor:** Principal Software Architect & Competitive Intelligence Analyst (Google Antigravity)

---

## 1. Methodology & Evidence Classification Framework

In accordance with Rolevia AI engineering instructions, every feature and architectural capability is strictly categorized using four evidential standards:

- **OBSERVED:** Directly verified through publicly accessible product behavior, DOM structure, network inspection, browser extension inspection, public documentation, or authenticated sandbox workflows.
- **INFERRED:** A technical explanation consistent with observed competitor behavior, API design, or payload structure, but not verified via proprietary source code.
- **UNVERIFIED:** A marketing claim, third-party assertion, or self-reported metric lacking independent empirical verification.
- **PROPOSED:** An original Rolevia AI feature, architectural design, or security invariant independently engineered to differentiate our platform.

---

## 2. Comprehensive 11-Dimension Feature Matrix

| # | Dimension | Tsenta AI Capability & Observable Evidence | Classification | Rolevia AI Equivalent & Implementation Status | Classification | Gap Severity & Engineering Differentiation Opportunity |
| :--- | :--- | :--- | :---: | :--- | :---: | :--- |
| **1** | **Autonomous Job Discovery** | Ingests from multi-portal ATS feeds; claims 8.5M+ postings. Observable defects: Stale job postings ("Posted 3282 days ago"), duplicate requisitions from multi-board scrapers. | **OBSERVED** | **FEAT-005:** Canonical URL SHA-256 requisition hashing, multi-tenant ingestion (Greenhouse, Ashby, Lever), active HTTP health verification, auto-purge of closed listings. | **PROPOSED / IMPLEMENTED** | **Rolevia Advantage:** Freshness guarantee and strict deduplication prevents wasting credits on ghost/expired requisitions. |
| **2** | **Application Agents** | Cloud automation + Chrome extension (Manifest V3 v3.1.12). Dispatches form submissions via headless workers or client-side DOM injection. | **OBSERVED** | **FEAT-009:** Modular ATS Automation Engine (`backend/atsAutomation.js`) powered by headless Playwright, dual-mode execution (`DRY_RUN` staging vs `LIVE` candidate-authorized). | **PROPOSED / IMPLEMENTED** | **Rolevia Advantage:** Fully auditable execution receipts with high-resolution DOM screenshot telemetry at every phase. |
| **3** | **Candidate Preferences & Policies** | Job search filters for title, location, salary, remote/hybrid. Daily application velocity slider (10–150 apps/day). Blacklist for companies. | **OBSERVED** | **FEAT-016:** Multi-factor experience engine (fresher, 0-1y, 1-3y, 3-5y, 5-8y, 8y+), graduation year constraints, degree equivalence, company blacklist, daily velocity limit. | **PROPOSED / IMPLEMENTED** | **Rolevia Advantage:** Fine-grained experience-aware matching prevents applying for senior roles when candidate is an entry-level graduate. |
| **4** | **Screening-Question Handling** | Autofills standard biographical fields. Uses generic LLM heuristic for open questions. Lacks transparent provenance citation. | **INFERRED** | **FEAT-003 / FEAT-007:** Verified Candidate FactStore (`candidateProfile.facts`). Heuristic label resolution maps known facts; unknown fields escalate to `NEEDS_USER_ACTION`. | **PROPOSED / IMPLEMENTED** | **Rolevia Advantage:** Zero hallucination policy; unverified claims or sensitive attestations (visa, compensation, disability) are never guessed. |
| **5** | **ATS Coverage** | Recognizes ~55 ATS patterns in extension bundle (Greenhouse, Lever, Ashby, Workday, BambooHR, SmartRecruiters, Jobvite, Taleo, iCIMS, etc.). | **OBSERVED** | **FEAT-009:** Deep, reliable support for Greenhouse, Ashby, and Lever. Workday multi-step portals cleanly classified as `UNSUPPORTED` with automatic candidate escalation. | **PROPOSED / IMPLEMENTED** | **Parity Gap:** Tsenta covers wider array of long-tail ATS portals. Rolevia plans Release 0.3 expansion to Workday, BambooHR, and SmartRecruiters. |
| **6** | **Application Verification** | Relies on HTTP 200 or page load state. Does not guarantee authentic receipt extraction. Does not surface machine-verifiable receipts. | **INFERRED** | **FEAT-009 / FEAT-010:** 4-tier receipt taxonomy (`DRY_RUN_DIAGNOSTIC`, `FORM_COMPLETION`, `ATTEMPT`, `CONFIRMED`). Zero synthetic confirmation numbers; `OUTCOME_UNKNOWN` quarantine. | **PROPOSED / IMPLEMENTED** | **Major Rolevia Advantage:** Verifiable cryptographic receipts protect candidate against ghost submissions. |
| **7** | **Recruiter Email Integration** | Syncs candidate Gmail/IMAP inbox to detect recruiter responses, interview invitations, and rejection notices in an "AI Inbox". | **OBSERVED** | **FEAT-010 UI Prototype:** AI Inbox tab renders recruiter messages, sentiment tags, and interview detection. Backend IMAP/OAuth synchronization scheduled for Release 0.3. | **PROPOSED / IN PROGRESS** | **Tsenta Advantage Currently:** Tsenta has live email parsing. Rolevia currently has UI & mock inbox; backend IMAP worker is highest priority in `NEXT_MILESTONE.md`. |
| **8** | **Automation Scheduling** | Scheduled background sweeps submit applications within user-defined daily limits (e.g. 50/day). | **OBSERVED** | **FEAT-009 / FEAT-004:** Daily velocity controls, concurrency locks (`status: PENDING`), pre-submission credit reservation (`APPLICATION_HOLD`), and batch scheduling logic. | **PROPOSED / IMPLEMENTED** | **Parity:** Comparable background dispatch mechanics with stronger double-deduction prevention in Rolevia. |
| **9** | **User Notifications** | Real-time push notifications, email digests of submitted applications, and recruiter interview alerts. | **OBSERVED** | **FEAT-010:** Server-Sent Events (SSE) real-time streaming terminal (`/api/v1/applications/stream`), live status indicators, modal event timelines. | **PROPOSED / IMPLEMENTED** | **Rolevia Advantage:** Live SSE stream shows real-time DOM interaction steps (navigating, mapping, attaching, validating) with sub-second latency. |
| **10** | **Analytics & Intelligence** | Application conversion funnel, interview rates, response timeline, active vs archived view. | **OBSERVED** | **FEAT-010:** 5-column Kanban board, live metrics (Applications Sent, Interview Rate, Verification Rate), document diff viewer, ATS diagnostic inspector. | **PROPOSED / IMPLEMENTED** | **Parity:** Rich Claymorphic visualization of application pipeline with clear distinction between diagnostic vs confirmed receipts. |
| **11** | **Subscription & Credits** | USD-only pricing ($19/mo Starter, $39/mo Growth, $99/mo Power) via Dodo Payments / RevenueCat. Soft credit pools. | **OBSERVED** | **FEAT-004:** Multi-currency Razorpay integration (₹499/₹1,499/₹2,999 INR + USD/EUR), double-entry transaction journal with mathematical invariant reconciliation. | **PROPOSED / IMPLEMENTED** | **Rolevia Advantage:** Affordable localized pricing for Indian & emerging market job seekers + uncompromised financial auditability. |

---

## 3. Resume Tailoring Mode Comparison

A critical architectural and ethical contrast exists between Tsenta AI and Rolevia AI in document optimization:

| Dimension | Tsenta AI Implementation | Rolevia AI Implementation |
| :--- | :--- | :--- |
| **Available Modes** | 3 Modes: `off`, `honest`, `aggressive` (observed in client bundle). | Single Standard: **Truth-Grounded Verified Optimization (`FEAT-007`)**. |
| **Hallucination Risk** | In `aggressive` mode, LLM rewrites bullets to match job keywords even if unsupported by background, creating severe interview disqualification risks. | **Zero Unsupported Claims:** Every bullet point maps back to a verified fact ID in the candidate's FactStore. Unsupported claims trigger validation rejections. |
| **Candidate Control** | Diff modal shows changes; users can accept or reject whole documents. | **FEAT-008 Interactive Workspace:** Bullet-level accept/reject, inline editing, verified source evidence inspector, and HMAC cryptographic approval. |
| **Approval Invalidation** | Modifying resume after approval does not invalidate submission token. | Editing any approved text immediately recalculates document hash and invalidates submission token (`DOCUMENT_HASH_MISMATCH`). |

---

## 4. Prioritized Feature Gap Roadmap (Release 0.3)

Based on this competitive audit, the top technical gaps to close in Release 0.3 are:

1. **Recruiter Email Ingestion Agent (`AGENT-011`):**
   - Implement OAuth2 & IMAP worker to ingest incoming emails from recruiters.
   - Extract interview requests, technical assessment links, and rejections.
   - Automatically update application tracker state from `APPLIED` to `INTERVIEW_SCHEDULED` or `REJECTED`.
2. **Browser Extension Companion (Chrome Manifest V3):**
   - Provide a companion extension allowing candidates to apply directly while browsing LinkedIn, Indeed, or company sites using Rolevia AI credentials.
3. **Dynamic LLM Screening Question Mapper (`AGENT-006`):**
   - Integrate structured LLM fallback for open-ended essay questions (e.g., "Why do you want to work here?"), strictly referencing verified FactStore achievements.
4. **Expanded ATS Adapters:**
   - Add native adapters for BambooHR and SmartRecruiters.
   - Implement candidate-assisted workflow for Workday logins.
