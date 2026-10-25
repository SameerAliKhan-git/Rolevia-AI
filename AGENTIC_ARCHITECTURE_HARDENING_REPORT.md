# ROLEVIA AI — AGENTIC ARCHITECTURE & LANGGRAPH.JS HARDENING REPORT

**Product:** Rolevia AI  
**Brand Identifier:** RoleviaAI  
**Domain:** https://roleviaai.co.in  
**Primary Accent:** `#e0601e`  
**Milestone:** Release 0.3 LangGraph & LLM Production Hardening  
**Baseline Git Commit:** `21714d2173930744f8530a9006a558211b0d9433`  
**Evaluation Date:** October 26, 2026  
**Node.js Runtime:** v26.8.1 (Windows x64)  
**Database Engine:** PostgreSQL 16 (Container: `rolevia-postgres` / Database: `rolevia_db`)  
**Master Automated Test Results:** 228 / 228 Passing (100% Pass Rate across 22 test suites)  

---

## 1. Executive Summary & Objective

In this milestone, Rolevia AI transitioned from an experimental LangGraph prototype to a hardened, durable, production-ready agentic orchestration layer competing with Tsenta AI (`https://tsenta.com`).

The objectives achieved in this hardening phase:
1. **Unsafe Defaults Elimination:** Eradicated silent assumptions in candidate profiles. Missing education, sponsorship requirements, work authorization, experience, and graduation dates strictly default to `UNKNOWN` (`null`), enforcing `NEEDS_VERIFICATION` pauses instead of hallucinated disqualifications or approvals.
2. **Durability & Fault Recovery:** Verified LangGraph checkpoint recovery across 10 mission-critical restart and concurrency scenarios using `PostgresDurableCheckpointer`.
3. **Orthogonal Idempotency Partitioning:** Separated 6 distinct identity domains across workflows, node executions, workflow attempts, payment operations, ATS submission attempts, and duplicate requisitions.
4. **Multi-Model LLM Gateway Hardening:** Implemented explicit operational modes (`MOCK`, `LIVE`, `UNAVAILABLE`), removed obsolete model tags, wired intra-provider fallbacks, enforced structured Zod schemas, added rate-limit/timeout protections, and scrubbed candidate PII and API keys from telemetry.
5. **Adversarial Benchmark & Evaluation:** Evaluated 10 synthetic adversarial test cases spanning metric hallucinations, organization fabrications, prompt injections, sensitive disclosures, grounded Q&A, and recruiter communication classification.
6. **Workflow-to-ATS End-to-End Integration:** Proved the complete 10-stage lifecycle (`DISCOVER` → `MATCH` → `OPTIMIZE` → `DOCUMENT_REVIEW` → `SUBMISSION_AUTHORIZATION` → `PREPARE_APPLICATION` → `HUMAN_REVIEW` → `SUBMIT` → `VERIFY` → `TRACK`) with controlled ATS adapters and dry-run diagnostics.

---

## 2. Capability Verification Matrix

| Capability ID | Description | Classification | Evidence & Test Suite |
| :--- | :--- | :--- | :--- |
| **CAP-WF-001** | Zero Unsafe Profile Defaults (Enforce `NEEDS_VERIFICATION`) | **VERIFIED** | `tests/test_agentic_workflow_suite.js` (Test 12-13) |
| **CAP-WF-002** | Contradiction Detection (Title vs Exp, Future Grad, F1 vs No Sponsor) | **VERIFIED** | `backend/workflows/applicationGraph.js` `nodeMatch` |
| **CAP-WF-003** | Multi-Tenant Checkpoint Isolation (`CROSS_TENANT_ACCESS_DENIED`) | **VERIFIED** | `tests/test_langgraph_durability_suite.js` (Scenario 9) |
| **CAP-WF-004** | State Recovery After Server Restart | **VERIFIED** | `tests/test_langgraph_durability_suite.js` (Scenario 1-5) |
| **CAP-WF-005** | Concurrent Worker Execution Without Deadlock | **VERIFIED** | `tests/test_langgraph_durability_suite.js` (Scenario 7) |
| **CAP-WF-006** | Document Revision Invalidation & Re-approval Loop | **VERIFIED** | `tests/test_langgraph_durability_suite.js` (Scenario 8) |
| **CAP-WF-007** | Schema Version Tagging & Migration Enforcement | **VERIFIED** | `tests/test_langgraph_durability_suite.js` (Scenario 10) |
| **CAP-ID-001** | 6-Tier Orthogonal Idempotency Architecture | **VERIFIED** | `backend/workflows/idempotency.js` |
| **CAP-GW-001** | Explicit Gateway Modes (`MOCK`, `LIVE`, `UNAVAILABLE`) | **VERIFIED** | `tests/test_llm_gateway_hardening_suite.js` (Test 1-2) |
| **CAP-GW-002** | Zero Silent Mock Fallback in LIVE Mode | **VERIFIED** | Throws `PROVIDER_UNAVAILABLE` on missing API key |
| **CAP-GW-003** | PII & Secret Scrubbing in Telemetry Logs | **VERIFIED** | `tests/test_llm_gateway_hardening_suite.js` (Test 3) |
| **CAP-GW-004** | Flagship to Instant Intra-Provider Fallback | **VERIFIED** | `tests/test_llm_gateway_hardening_suite.js` (Test 4) |
| **CAP-GW-005** | Structured Zod Schema Compliance | **VERIFIED** | `tests/test_llm_gateway_hardening_suite.js` (Test 14) |
| **CAP-GW-006** | Adversarial Prompt-Injection Resistance | **VERIFIED** | `tests/test_llm_gateway_hardening_suite.js` (Test 7) |
| **CAP-GW-007** | Sensitive Disclosure Escalation (Zero Guessing) | **VERIFIED** | `tests/test_llm_gateway_hardening_suite.js` (Test 8-10) |
| **CAP-GW-008** | Real LLM Live Outbound Calls | **BLOCKED** | API keys not provisioned in local runner |
| **CAP-ATS-001** | 10-Stage Controlled Workflow-to-ATS Execution | **VERIFIED** | `tests/test_workflow_ats_integration_suite.js` |
| **CAP-ATS-002** | Dry-Run Evidence Safeguard (Never Faked as Employer Confirmed) | **VERIFIED** | `tests/test_workflow_ats_integration_suite.js` (Step 9-10) |
| **CAP-ATS-003** | Ambiguous Outcome Quarantine (`OUTCOME_UNKNOWN`) | **VERIFIED** | `tests/test_workflow_ats_integration_suite.js` (Step 11) |
| **CAP-ATS-004** | Live Real Employer Submissions | **DISABLED** | Intentionally disabled per production safety rules |

---

## 3. Workflow State Contract & Architecture Details

### 3.1 Unsafe Defaults Removal
In `backend/workflows/applicationWorkflowTypes.js` and `backend/workflows/applicationGraph.js`:
- Candidate profile facts default strictly to `null`:
  - `skills`: `[]`
  - `experienceYears`: `null` (Unknown)
  - `educationLevel`: `null` (Unknown)
  - `needsSponsorship`: `null` (Unknown)
  - `workAuthorization`: `null` (Unknown)
  - `expectedSalary`: `null` (Unknown)
  - `graduationYear`: `null` (Unknown)
- `nodeMatch` identifies missing mandatory qualifications against employer job criteria. When mandatory criteria are unverified, `eligibilityStatus` is set to `NEEDS_VERIFICATION` rather than hallucinating an `INELIGIBLE` or `ELIGIBLE` status.
- Profiles exhibiting internal contradictions (e.g., Senior Lead Title with 0 years experience; Graduation Year in 2028 with 2+ years full-time experience; F-1 Visa claiming no sponsorship) trigger immediate `NEEDS_VERIFICATION` pauses and route to `node_human_review`.

### 3.2 10-Stage Workflow Routing
```
                   [START]
                      │
                      ▼
               [node_discover]
                      │
                      ▼
                [node_match] ────(ineligible)───► [END (Ineligible Stop)]
                      │
                      ├────(needs_verification)──► [node_human_review] ──(paused)──► [END]
                      │                                    ▲                  │
                      ▼ (eligible)                         │ (resume)         │ (candidate
               [node_optimize] ◄───────────────────────────┴──────────────────┘  resolves)
                      │       ▲
                      ▼       │ (edits_applied)
            [node_document_review] ───(await_approval)──► [END (Paused for Human)]
                      │ (approved)
                      ▼
         [node_submission_authorization] ───(not_authorized)──► [END]
                      │ (cryptographically authorized)
                      ▼
            [node_prepare_application]
                      │
                      ├────(needs_human: MFA / Workday / Unanswered)──► [node_human_review]
                      │
                      ▼ (ready_to_submit)
                 [node_submit]
                      │
                      ▼
                 [node_verify]
                      │
                      ▼
                 [node_track]
                      │
                      ▼
                    [END]
```

---

## 4. Master Automated Test Suite Execution

**Command:**
```powershell
node tests/run_all_tests.js
```

**Results:**
- **Suites Executed:** 22
- **Total Test Cases Executed:** 228
- **Total Passed:** 228 (100%)
- **Total Failed:** 0
- **Total Execution Time:** 141.2 seconds

**Breakdown by Gate:**
- FEAT-001 PostgreSQL Database & Multi-Tenancy: 7 / 0
- FEAT-002 Multi-Tenant Auth & Security: 10 / 0
- FEAT-003 Dynamic Resume Parsing & FactStore: 5 / 0
- FEAT-003 Multi-Layout Benchmark Evaluation: 13 / 0
- FEAT-004 Payment Security & Credit Ledger: 7 / 0
- FEAT-005 Job Ingestion & Freshness Scan: 7 / 0
- FEAT-006 Explainable AI Job Matching: 8 / 0
- FEAT-007 Truth-Grounded Optimizer: 9 / 0
- FEAT-008 Interactive Resume Optimization Workspace: 8 / 0
- FEAT-008 Final Security, Factual Accuracy & UX Verification: 10 / 0
- FEAT-016 Experience-Aware Job Classification & Eligibility: 28 / 0
- FEAT-009 Modular ATS Application Automation Engine: 8 / 0
- FEAT-010 Persistent Application Kanban Tracker: 7 / 0
- FEAT-009/010 Staging Security & Recovery Audit: 20 / 0
- FEAT-010 Browser UI & Kanban Playwright Suite: 9 / 0
- FEAT-011 Recruiter Email Intelligence: 11 / 0
- GATE-17 AGENTIC LangGraph.js Workflow Orchestration: 16 / 0
- GATE-18 GATEWAY Multi-Model Hardening & Eval: 15 / 0
- GATE-19 DURABILITY LangGraph Recovery & Idempotency: 11 / 0
- GATE-20 Workflow-to-ATS Integration: 6 / 0
- GATE-21 E2E Full Candidate User Journey: 8 / 0
- GATE-22 Negative-Path & Edge-Case Integration: 5 / 0

---

## 5. Acceptance Criteria Verification

- [x] Unsafe profile defaults removed and `NEEDS_VERIFICATION` enforced for missing mandatory facts.
- [x] Contradictory profile benchmark assertions verified.
- [x] LangGraph durability tested across 10 restart/concurrency scenarios with PostgreSQL checkpointer.
- [x] 6-tier orthogonal idempotency architecture implemented.
- [x] Multi-model gateway hardened with explicit modes (`MOCK`, `LIVE`, `UNAVAILABLE`) and zero silent mocks.
- [x] Adversarial evaluation dataset created and executed against gateway validation rules.
- [x] Workflow-to-ATS 10-stage integration verified with dry-run protection and quarantine checks.
- [x] Master test harness passing 100% (228/228).
