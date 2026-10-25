# ROLEVIA AI — NEXT ENGINEERING MILESTONE (RELEASE 0.3)
**Target Milestone:** Release 0.3 — Recruiter Communications, Browser Companion & Long-Tail ATS Coverage  
**Planning Date:** October 2026  
**Product:** Rolevia AI (`RoleviaAI`)  
**Domain:** https://roleviaai.co.in  
**Engineering Lead:** Principal Software Architect (Google Antigravity)

---

## 1. Release 0.3 Objective & Strategic Focus

With the successful staging acceptance and security hardening of Release 0.2 (Modular ATS Automation, Candidate Authorization, and Application Tracking), Rolevia AI has established an authentic, zero-fraud automation foundation.

The primary objective of **Release 0.3** is closing key competitive parity gaps with Tsenta AI while extending our core architectural differentiators: **truth-grounded candidate intelligence, verifiable submission receipts, and accessible multi-currency pricing**.

---

## 2. Priority Epic Breakdown

### Epic 1: Recruiter Email Ingestion & Autonomous AI Inbox (`AGENT-011`)
- **Objective:** Connect candidate email accounts to autonomously track incoming recruiter communications and interview invitations.
- **Key Deliverables:**
  1. **Secure IMAP & OAuth2 Connector:** OAuth2 integration for Google Workspace (Gmail) and Microsoft 365 (Outlook), plus encrypted IMAP/SMTP credentials storage.
  2. **Recruiter Communication Parser:** LLM-assisted email classifier extracting:
     - Sender identity and hiring organization.
     - Intent classification (`INTERVIEW_INVITATION`, `TECHNICAL_ASSESSMENT`, `STATUS_UPDATE`, `REJECTION`).
     - Interview calendar details (dates, times, video call links).
  3. **Automated Tracker State Transitions:** Update application record from `APPLIED` to `INTERVIEW_SCHEDULED` or `REJECTED` upon verified recruiter email matching.
  4. **AI Inbox Response Drafter:** Draft professional, context-aware interview acceptance and rescheduling emails for candidate review.

### Epic 2: Rolevia AI Chrome Browser Companion (Manifest V3)
- **Objective:** Allow candidates to trigger Rolevia AI's truth-grounded application workflows directly on LinkedIn, Indeed, and external career sites.
- **Key Deliverables:**
  1. **Manifest V3 Extension Architecture:** Secure background service worker communicating with `https://roleviaai.co.in/api/v1` via authenticated JWT.
  2. **In-Page Overlay Trigger:** Non-intrusive floating widget on supported job listings showing match score and missing skill analysis.
  3. **Client-Side Form Autofill Assist:** One-click autofill for job portals where headless cloud automation is restricted, placing full submission control in the candidate's browser.
  4. **Receipt Capture Bridge:** Captures DOM confirmation state directly from candidate's browser session and registers verified receipt with the central tracker.

### Epic 3: Dynamic LLM Screening Question Agent (`AGENT-006`)
- **Objective:** Autonomously generate truthful, tailored responses to complex open-ended application questions.
- **Key Deliverables:**
  1. **Structured Question Classification:** Differentiate factual fields (experience, education) from behavioral questions ("Why Acme Corp?"), technical questions ("Describe your experience with distributed queues"), and sensitive attestations.
  2. **FactStore-Grounded Generation:** Enforce strict citation of verified accomplishments from `candidateProfile.facts`. Never invent metrics or employer tenure.
  3. **Human Escalation Policy:** Strictly escalate unknown answers, salary requirements, visa sponsorship, disability disclosures, and legal attestations to candidate via `NEEDS_USER_ACTION`.

### Epic 4: Expanded ATS Platform Coverage
- **Objective:** Broaden automated portal coverage to cover 85%+ of technology job openings.
- **Key Deliverables:**
  1. **BambooHR Adapter:** Native Playwright adapter for `*.bamboohr.com` career portals.
  2. **SmartRecruiters Adapter:** Native Playwright adapter for `jobs.smartrecruiters.com` portals.
  3. **Workday Assisted Workflow:** Step-by-step human-in-the-loop navigation helper that guides candidate through Workday login and document attachment.

---

## 3. Production Launch Prerequisites (Gated)

Prior to enabling live employer submissions or real payment transactions in production:
1. **Domain Verification:** Formal DNS verification of `roleviaai.co.in`.
2. **Production Razorpay Activation:** Replace sandbox keys with verified production merchant keys.
3. **Explicit Candidate Live-Submission Gate:** High-friction confirmation modal explicitly requiring candidate authorization before live employer dispatch.
4. **Project Owner Signoff:** Explicit written signoff from the project owner.
