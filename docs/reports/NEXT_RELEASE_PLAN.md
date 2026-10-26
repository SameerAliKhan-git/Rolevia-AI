# ROLEVIA AI — RELEASE 0.4 DEPENDENCY-BASED IMPLEMENTATION PLAN & INTEGRITY GATES

**Product:** Rolevia AI (`RoleviaAI`)  
**Target Domain:** https://roleviaai.co.in  
**Primary Brand Accent:** `#e0601e`  
**Current Milestone State:** Release 0.4 Milestone 1: Database Migration Integrity & Hyperscale Architecture Accepted (246/246 Tests Passing Across 25 Suites)  
**Next Milestone:** Release 0.4 Milestone 2 — Real LLM Provider Integration & Manifest V3 Chrome Extension  
**Planning Date:** October 26, 2026  
**Auditor & Architect:** Principal Software Architect & Full-Stack Systems Lead (Google Antigravity)  
**Status:** **REVISED ENGINEERING PLAN APPROVED FOR STAGING IMPLEMENTATION**

---

## 1. Executive Summary & Critical Architectural Corrections

In accordance with project integrity reviews, the **Release 0.4 Engineering Plan** has been corrected across three fundamental architectural dimensions:

1. **Commercial LLM Unit Economics & Privacy (Correction 1):**
   Groq and Gemini free tiers are officially classified as **development and staging sandboxes**, not zero-cost production infrastructure. Commercial deployment requires sustainable paid-tier allocations (Groq On-Demand at $0.59 / $0.79 per 1M tokens; Gemini 1.5 Flash Paid at $0.075 / $0.30 per 1M tokens) to guarantee uptime SLAs and ensure that candidate resume data is **never used to train third-party foundation models**.
2. **Scoped Extension Security Architecture (Correction 2):**
   The Manifest V3 Chrome Extension (`FEAT-012`) is strictly forbidden from reading, storing, or sharing raw website JWT access tokens. Authentication will use a **scoped, revocable extension token** (`rolevia_ext_auth_*`) granting restricted permissions exclusively for job extraction and candidate-confirmed tab autofill.
3. **Decoupled Commercial Authorization Gates (Correction 3):**
   Neither Razorpay live payment capture nor live employer ATS submissions will be enabled as an automatic part of production deployment. Both remain **isolated, explicit approval gates** requiring separate project owner authorization.

---

## 2. Dependency-Based Implementation Sequence

```mermaid
graph TD
    subgraph Phase_1 [Phase 1: Intelligence & Provider Core]
        P1[1. Live LLM Gateway Verification - FEAT-018]
    end

    subgraph Phase_2 [Phase 2: Client Expansion]
        P2[2. Scoped Manifest V3 Chrome Extension - FEAT-012]
        P3[3. Long-Tail ATS Adapters - FEAT-009]
    end

    subgraph Phase_3 [Phase 3: Worker Scalability]
        P4[4. Distributed Redis & BullMQ Workers]
    end

    subgraph Phase_4 [Phase 4: Production Infrastructure]
        P5[5. Cloudflare DNS, SSL & Secret Vaulting]
    end

    subgraph Phase_5 [Phase 5: Gated Commercial Launch]
        Gate1{Owner Live Payment Gate}
        Gate2{Owner Live Submission Gate}
        Launch[Commercial Operation]
    end

    P1 --> P2
    P1 --> P3
    P2 --> P4
    P3 --> P4
    P4 --> P5
    P5 --> Gate1
    P5 --> Gate2
    Gate1 --> Launch
    Gate2 --> Launch
```

### Phase 1: Live LLM Gateway Verification (`FEAT-018`)
- **Prerequisites:** Valid paid commercial API keys injected in developer environment.
- **Deliverables:**
  1. Live network execution of `tests/test_live_llm_validation.js` against Groq On-Demand and Gemini 1.5 Flash Paid.
  2. Latency, token usage, and simulated per-application cost metrics recorded in audit logs.
  3. Automatic intra-provider fallback from Groq to Gemini under HTTP 429 rate limit conditions.
  4. Enterprise data confidentiality compliance check (confirming model training exclusions).

### Phase 2: Scoped Manifest V3 Chrome Extension (`FEAT-012`)
- **Prerequisites:** `FEAT-002` (Auth), `FEAT-005` (Job Ingestion).
- **Security Invariant:** Zero access to raw website cookies or root JWT tokens.
- **Deliverables:**
  1. `/api/v1/auth/extension-token`: Endpoint issuing short-lived, revocable extension tokens with scoped permissions (`jobs:import`, `profile:autofill_read`).
  2. In-page overlay widget on LinkedIn, Indeed, and Glassdoor displaying match score and missing skill warnings.
  3. Client-side form autofill helper mapping FactStore fields into third-party ATS inputs with explicit candidate confirmation.

### Phase 3: Long-Tail ATS Adapters & Assisted Navigation (`FEAT-009`)
- **Prerequisites:** `FEAT-009` baseline runner, `FEAT-017` LangGraph checkpointer.
- **Deliverables:**
  1. BambooHR native adapter (`*.bamboohr.com`).
  2. SmartRecruiters native adapter (`jobs.smartrecruiters.com`).
  3. Workday assisted-navigation helper modal guiding candidate through account creation and CAPTCHA challenges without fragile DOM hacking.

### Phase 4: Distributed Redis & BullMQ Worker Architecture
- **Prerequisites:** `FEAT-017` PostgreSQL Durable Checkpointer.
- **Deliverables:**
  1. Decouple Playwright browser jobs from the Express web server process.
  2. Dedicated BullMQ queues for high-priority resume optimization and background browser automation.
  3. Redis worker heartbeat monitoring and automatic worker crash reclamation.

### Phase 5: Production Infrastructure & Monitoring
- **Prerequisites:** Cloudflare account, domain control confirmation (`roleviaai.co.in`).
- **Deliverables:**
  1. Cloudflare DNS configuration with strict SSL (TLS 1.3, HSTS, HTTP/3).
  2. Centralized secrets management (cloud vaulting for database connection strings and OAuth credentials).
  3. Sentry error monitoring and OpenTelemetry performance tracing.

---

## 3. Explicit Launch Blockers & Quality Acceptance Criteria

| Workstream | Launch Blocker Condition | Quality Acceptance Criteria |
| :--- | :--- | :--- |
| **LLM Gateway** (`FEAT-018`) | Live API keys absent or unverified in network tests. | `tests/test_live_llm_validation.js` passes with 100% schema compliance and zero unsupported candidate claims. |
| **Data Privacy** | Model provider terms allow training on candidate resumes. | Commercial agreements verified ensuring zero prompt/resume retention for foundation model training. |
| **Extension Security** (`FEAT-012`) | Extension reads or exposes raw website JWT access tokens. | Extension uses scoped, revocable tokens (`rolevia_ext_auth_*`); candidate can revoke extension access in 1 click. |
| **Submission Idempotency** | Database race condition allows duplicate application submission. | PostgreSQL `submission_attempt_locks` table with unique constraint on `(tenant_id, user_id, requisition_key)` rejects competing workers. |
| **Commercial Billing** | Live merchant activation executed automatically without owner signoff. | Formal written signoff from project owner; sandbox test suite passes all double-entry ledger invariants. |
| **Employer Submissions** | Live applications dispatched without explicit candidate authorization. | High-friction candidate confirmation modal with SHA-256 document approval token enforced prior to any real submit dispatch. |

---

## 4. Rollback Strategy & Staging Boundaries

1. **Staging Isolation:** All ATS adapters continue to execute in `DRY_RUN` mode by default (`ROLEVIA_AUTOMATION_MODE=DRY_RUN`).
2. **Billing Isolation:** Razorpay operates under test credentials (`rzp_test_*`) with mock webhook verification.
3. **Process Isolation:** Worker crashes are quarantined at the queue level without affecting web API responsiveness.
4. **Instant Feature Toggles:** All new capabilities (Chrome Extension bridge, BambooHR adapter, SmartRecruiters adapter) are gated behind database feature flags.
