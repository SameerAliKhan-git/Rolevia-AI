# ROLEVIA AI — RELEASE 0.3 MASTER IMPLEMENTATION PLAN
**Target Milestone:** Release 0.3 — Agent Ecosystem & Browser Companion  
**Baseline Commit:** `062dfeda021990f9a263f293efc8099f357dab65` (169/169 Tests Passing)  
**Date:** October 2026  
**Product:** Rolevia AI (`RoleviaAI`) · https://roleviaai.co.in  
**Principal Architect:** Google Antigravity Engineering Organization

---

## 1. Executive Summary & Baseline Verification

Before initiating Release 0.3 development, the existing Release 0.1 and 0.2 baseline was verified against the repository:
- **Verified Commit:** `062dfeda021990f9a263f293efc8099f357dab65` (clean working tree).
- **Harness Status:** All 17 test suites (169 / 169 assertions) passed with 100% success rate.
- **Security Boundaries:** Global dry-run default is preserved. Zero live employer applications are submitted; zero live credit cards are charged.
- **Architectural Integrity:** Candidate FactStore truth-grounding, double-entry credit ledger, and HMAC-SHA256 authorization invariants remain active and unbroken.

Release 0.3 establishes Rolevia AI's autonomous agent ecosystem to compete directly with Tsenta AI across recruiter communications, browser companion extension, intelligent screening questions, and expanded ATS platform reach.

---

## 2. Release 0.3 Epic Architecture

### Epic 1 — Recruiter Email Intelligence Agent (FEAT-011 / AGENT-011)
- **Goal:** Connect candidate mailboxes securely (Gmail OAuth2 / Microsoft Graph / IMAP) to monitor incoming communications, detect interview requests, assessments, and status updates, and automatically update the Application Tracker.
- **Security & Privacy Invariants:**
  1. Minimum necessary scopes (`https://www.googleapis.com/auth/gmail.readonly`, `Mail.Read`).
  2. Tokens encrypted at rest using AES-256-GCM with environment-managed master secret.
  3. Strict deduplication ledger preventing re-processing of messages.
  4. Explicit distinction between **Confirmed Recruiter Decisions** (matched via authentic employer domains/signatures) and **AI-Inferred Classifications**.
  5. **Zero Automatic Outgoing Replies:** Candidate must review and authorize any drafted reply.
  6. Candidate can disconnect mailbox at any time, immediately zeroing stored tokens.

### Epic 2 — Rolevia Chrome Extension (FEAT-012)
- **Goal:** Manifest V3 companion browser extension allowing candidates to trigger Rolevia AI's truth-grounded workflows directly while viewing job openings on LinkedIn, Indeed, and company portals.
- **Architecture:**
  1. `manifest.json`: Manifest V3 compliance with `activeTab`, `storage`, and `scripting` permissions.
  2. Background Service Worker: Connects to Rolevia REST API (`/api/v1/`) with authenticated JWT tokens.
  3. Content Script: Non-invasive DOM reader extracting requisition title, company, description, and canonical apply URL.
  4. Popup Interface: Displays instant skill and experience match scores, allows requesting a tailored resume, and initiates authorized application staging.
  5. Zero invasive DOM injection, zero background scraping without user action, and immediate human escalation for CAPTCHA/MFA.

### Epic 3 — Screening Question Agent (AGENT-006)
- **Goal:** Autonomous agent that analyzes job application screening questions and drafts truthful answers grounded strictly in the verified FactStore.
- **Taxonomy & Invariants:**
  1. `FACTUAL`: Education, work tenure, tools, programming languages — mapped directly from FactStore with source ID citations.
  2. `NARRATIVE`: "Why do you want to work here?", "Describe a project challenge" — drafted using verified achievements, strictly requiring candidate review and approval before submission.
  3. `LEGAL_ATTESTATION`: Background checks, drug screens, binding agreements — flagged for explicit candidate signoff.
  4. `SENSITIVE_DISCLOSURE`: Visa sponsorship, expected compensation, disability, demographics — **NEVER guessed or inferred**; automatically escalated to `NEEDS_USER_ACTION`.
  5. Refuses unsupported claims with structured validation errors.
  6. Stores candidate-approved reusable answers with per-application versioning.

### Epic 4 — Expanded ATS Adapters (BambooHR & SmartRecruiters)
- **Goal:** Broaden automated portal coverage to cover modern mid-market and enterprise technology portals.
- **Deliverables:**
  1. `BambooHRAdapter`: Support for `*.bamboohr.com/careers` and `*.bamboohr.com/jobs`.
  2. `SmartRecruitersAdapter`: Support for `jobs.smartrecruiters.com/*`.
  3. Form detection, multi-input field mapping, file upload verification, authentic confirmation parsing, and failure recovery.
  4. Local mock server fixtures in `tests/fixtures/mock_ats_server.js` verifying dry-run and live submit simulation.

### Epic 5 — Competitive Parity Review & Audit
- **Goal:** Continuous benchmarking against Tsenta AI.
- **Output:** Updated `COMPETITOR_FEATURE_MATRIX.md` with classification of capabilities (OBSERVED, INFERRED, IMPLEMENTED, TESTED, MISSING).

---

## 3. Milestone Execution Sequence

1. **Milestone 1 (FEAT-011):** Implement Recruiter Email Intelligence Agent (`backend/recruiterEmailIntelligence.js`, schema, server routes, unit & integration tests).
2. **Milestone 2 (AGENT-006):** Implement Screening Question Agent (`backend/screeningQuestionAgent.js`, FactStore grounder, sensitive gate, server routes, tests).
3. **Milestone 3 (Expanded ATS):** Implement BambooHR and SmartRecruiters adapters in `backend/atsAutomation.js` with local mock fixtures and test suite.
4. **Milestone 4 (FEAT-012):** Implement Manifest V3 Chrome Extension in `extension/` with popup UI, content scripts, background worker, and test suite.
5. **Milestone 5:** Final competitive review, unified test harness regression run, graphify update, and Release 0.3 signoff report.
