# FEATURE BACKLOG: Rolevia AI Production Feature Inventory
**Product**: Rolevia AI (Brand Identifier: `RoleviaAI`)  
**Intended Domain**: `https://roleviaai.co.in` (with `rolevia.co.in` routing)  
**Date**: October 24, 2026  
**Auditor**: Principal Technical Program Manager & Product Lead  
**Status**: Final Verified Production Feature Inventory  

---

## 1. Feature Backlog Overview & Strict Dependency Matrix

Every feature is tracked with a permanent identifier (`FEAT-XXX`), component owner, strict prerequisites, development requirements, test specifications, and completion criteria:

| Feature ID | Priority | Feature Name | Component Owner | Target Release | Prerequisites (Strict Dependencies) |
|---|---|---|---|---|---|
| **FEAT-001** | **P0** | PostgreSQL & Prisma ORM Relational Migration | Database / Backend | Release 0.1 | None |
| **FEAT-002** | **P0** | Multi-Tenant JWT Authentication & Session Security | Backend / Security | Release 0.1 | FEAT-001 |
| **FEAT-003** | **P0** | Dynamic PDF Resume Parser & Candidate Fact Store | Backend / AI | Release 0.1 | FEAT-001, FEAT-002 |
| **FEAT-004** | **P0** | Cryptographic Razorpay HMAC & Credit Journal | Backend / Billing | Release 0.1 | FEAT-001, FEAT-002 |
| **FEAT-005** | **P0** | Continuous Job Ingestion & Deduplication Crawler | Workers / Ingestion | Release 0.1 | FEAT-001 |
| **FEAT-006** | **P1** | Explainable AI Job Matching & Hard Eligibility Engine | AI / Search | Release 0.2 | FEAT-003, FEAT-005 |
| **FEAT-007** | **P1** | Truth-Grounded Per-Job Resume & Cover Letter Optimizer | AI / Tailoring | Release 0.2 | FEAT-003, FEAT-006 |
| **FEAT-008** | **P1** | Interactive Resume Diff Approval & Pre-Submit Review Modal | Frontend / UX | Release 0.2 | FEAT-007 |
| **FEAT-009** | **P1** | Authorized Playwright ATS Runner (Greenhouse/Ashby/Workday) | Automation / Workers | Release 0.2 | FEAT-001, FEAT-004, FEAT-008 |
| **FEAT-010** | **P1** | Persistent Application Kanban Tracker & Verified Receipts | Frontend / Backend | Release 0.2 | FEAT-001, FEAT-009 |
| **FEAT-011** | **P2** | Recruiter Email Ingestion & Stage Classifier (Gmail OAuth2) | Backend / AI | Release 0.3 | FEAT-001, FEAT-010 |
| **FEAT-012** | **P2** | Manifest V3 Chrome Extension (Job Queue Importer) | Frontend / Extension | Release 0.3 | FEAT-002, FEAT-005 |
| **FEAT-013** | **P2** | Model Context Protocol (MCP) Server for Claude & Cursor | Backend / Agents | Release 0.3 | FEAT-002, FEAT-006, FEAT-009 |
| **FEAT-014** | **P3** | Career Intelligence, Skill Gap Analysis & Interview Prep | AI / Analytics | Release 0.4 | FEAT-006, FEAT-010 |
| **FEAT-015** | **P3** | Purchasing Power Parity (PPP) Multi-Currency Billing Engine | Billing / Growth | Release 0.4 | FEAT-004 |
| **FEAT-016** | **P0** | Experience-Aware Job Classification & Eligibility Engine | AI / Search | Release 0.1 | FEAT-005, FEAT-006 |

---

## 2. Detailed Feature Specifications

### FEAT-001: PostgreSQL & Prisma ORM Relational Migration
- **Target**: Release 0.1
- **Prerequisites**: None
- **Development Requirements**:
  1. Author Prisma schema with models: `User`, `ResumeProfile`, `CandidateSkill`, `Job`, `Application`, `Subscription`, `Invoice`, `CreditJournal`, `ProcessedWebhookEvent`.
  2. Implement seed script migrating candidate credentials and verified jobs.
  3. Support connection pooling and atomic transactions (`prisma.$transaction`).
- **Completion Criteria**: Complete removal of `fs.writeFileSync` flat-file persistence; all data reads and writes executed via Prisma.

---

### FEAT-002: Multi-Tenant JWT Authentication & Session Security
- **Target**: Release 0.1
- **Prerequisites**: `FEAT-001`
- **Development Requirements**:
  1. Endpoints: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
  2. Password hashing using `bcrypt` (cost factor 12).
  3. Short-lived JWT access tokens (15m) + secure refresh tokens in HTTP-only `SameSite=Strict` cookies.
  4. Authentication middleware gating candidate routes.
- **Completion Criteria**: Verified signup, login, and tenant data isolation.

---

### FEAT-003: Dynamic PDF Resume Parser & Candidate Fact Store
- **Target**: Release 0.1
- **Prerequisites**: `FEAT-001`, `FEAT-002`
- **Development Requirements**:
  1. Extract text from uploaded PDF resumes using `pdf-parse` / `unpdf`.
  2. Structured extraction prompt via Gemini 1.5 Pro / Claude 3.5 Sonnet returning validated Zod schema.
  3. Store parsed facts into `ResumeProfile` and `CandidateSkill` bound to the authenticated `User.id`.
- **Completion Criteria**: Uploading any valid PDF resume dynamically populates the candidate's profile and skills.

---

### FEAT-004: Cryptographic Razorpay HMAC & Transactional Credit Journal
- **Target**: Release 0.1
- **Prerequisites**: `FEAT-001`, `FEAT-002`
- **Development Requirements**:
  1. Timing-safe HMAC-SHA256 signature verification over `orderId + "|" + paymentId`.
  2. Webhook listener verifying `x-razorpay-signature` and recording in `ProcessedWebhookEvent`.
  3. Transactional Credit Journal: `SUBSCRIPTION_GRANT`, `APPLICATION_HOLD`, `APPLICATION_COMMIT`, `APPLICATION_RELEASE`, `COURTESY_ADJUSTMENT`.
- **Completion Criteria**: Zero unverified subscription activations; atomic double-entry credit ledger.

---

### FEAT-005: Continuous Job Ingestion & Deduplication Crawler
- **Target**: Release 0.1
- **Prerequisites**: `FEAT-001`
- **Development Requirements**:
  1. Continuous crawler across Greenhouse, Ashby, and Workday employer portals.
  2. Hash-based deduplication: `SHA256(company + normalizedTitle + externalReqId)`.
  3. Scheduled 30-minute health check auto-purging dead HTTP 404/410 postings.
- **Completion Criteria**: Active feed of fresh, verified, live employer jobs without duplicate requisitions.

---

### FEAT-006: Explainable AI Job Matching & Hard Eligibility Engine
- **Target**: Release 0.2
- **Prerequisites**: `FEAT-003`, `FEAT-005`
- **Development Requirements**:
  1. Vector embedding similarity between candidate facts and target job descriptions.
  2. Hard constraint evaluator (graduation year, required degree level, visa sponsorship).
  3. Explicit skill gap breakdown on job cards.
- **Completion Criteria**: Explainable match scores reflecting true candidate eligibility.

---

### FEAT-007: Truth-Grounded Per-Job Resume & Cover Letter Optimizer
- **Target**: Release 0.2
- **Prerequisites**: `FEAT-003`, `FEAT-006`
- **Development Requirements**:
  1. LLM prompting in `honest` mode reframing candidate experience without fabricating history.
  2. Deterministic post-processor checking all generated terms against the Fact Store.
- **Completion Criteria**: ATS-aligned bullet diffs and customized cover letters grounded in verified facts.

---

### FEAT-008: Interactive Resume Diff Approval & Pre-Submit Review Modal
- **Target**: Release 0.2
- **Prerequisites**: `FEAT-007`
- **Development Requirements**:
  1. Editable diff modal (`#diff-modal`) allowing candidates to edit or reject proposed bullet changes.
  2. Candidate approval gate required before browser automation dispatch.
- **Completion Criteria**: Candidate edits directly persist into the submitted resume version.

---

### FEAT-009: Authorized Playwright ATS Runner (Greenhouse/Ashby/Workday)
- **Target**: Release 0.2
- **Prerequisites**: `FEAT-001`, `FEAT-004`, `FEAT-008`
- **Development Requirements**:
  1. Headless Playwright browser automation pool with dedicated Greenhouse, Ashby, and Workday adapters.
  2. Standard browser contexts without illegal stealth hacking.
  3. Interactive MFA or CAPTCHA triggers `NEEDS_USER_ACTION` event for user-assisted completion.
  4. Quarantines unverified outcomes in `OUTCOME_UNKNOWN` to prevent duplicate submissions.
- **Completion Criteria**: Reliable form fill and document upload on supported ATS boards with screenshot receipts.

---

### FEAT-010: Persistent Kanban Tracker & Verified Receipts
- **Target**: Release 0.2
- **Prerequisites**: `FEAT-001`, `FEAT-009`
- **Development Requirements**:
  1. Drag-and-drop Kanban tracker synced to database status.
  2. Downloadable verified submission receipts with confirmation tokens and live URLs.
- **Completion Criteria**: Persistent tracking of all submitted applications.

---

### FEAT-016: Experience-Aware Job Classification & Eligibility Engine
- **Target**: Release 0.1 Foundation & Release 0.2 Matching Integration
- **Prerequisites**: `FEAT-005`, `FEAT-006`
- **Development Requirements**:
  1. Truth-grounded experience extraction from job descriptions with interval parsing, provenance snippets, and confidence scoring.
  2. Disaggregation of overall career experience vs skill-specific experience requirements (e.g. 5+ yrs overall vs 2+ yrs Python).
  3. Fresher eligibility modeling, internship acceptance/exclusion detection, graduation batch filtering, and M.Sc degree equivalence.
  4. Tri-state eligibility evaluation (`ELIGIBLE`, `INELIGIBLE`, `NEEDS_VERIFICATION`) with missing requirements invariant (`NEEDS_VERIFICATION`, never assumed fresher).
  5. Dual discovery views (`view=all` vs `view=eligible`), clay-neumorphic filter bar, and secure backfill API with pagination and admin authentication.
- **Completion Criteria**: 100% empirical precision & recall on benchmark fixture, 0% fresher FPR, and all automated engine tests passing.

