# Rolevia AI · ATS Submission Idempotency & Recovery Report

**Document Date:** October 26, 2026  
**Product:** Rolevia AI (`https://roleviaai.co.in`)  
**Primary Competitor Benchmark:** Tsenta AI (`https://tsenta.com`)  
**Components:** `backend/workflows/idempotency.js`, `backend/atsAutomation.js`, `prisma/schema.prisma`  
**Test Harness:** `tests/test_fault_injection_idempotency_suite.js` (7/7 Passing)  

---

## 1. Executive Summary & Critical Audit Resolution

The previous technical audit identified a critical vulnerability in the ATS submission identity format:
> *"Critical — ATS submission identity includes a timestamp. The latest report defines the attempt key as `ats-sub:{tenantId}:{userId}:{applicationId}:try-{n}:{hash}:{ts}`. An attempt identifier containing a new timestamp can be unique without being idempotent. If the same operation is retried using a newly generated timestamp, it may receive a different identity. Recommendation: Persist a submission-attempt ID before dispatch and reuse it across retries of that same attempt. Maintain a separate database uniqueness constraint for candidate, employer, and requisition."*

### Key Architecture Fixes Implemented & Verified:
1. **Dynamic Timestamp Stripping:** Completely removed dynamic timestamps from `generateAtsSubmissionAttemptKey`. Keys are derived purely deterministically from tenant, user, application ID, monotonic attempt counter, and approved document SHA-256 hash.
2. **Pre-Dispatch Database Persistence:** The exact submission attempt ID is written to the PostgreSQL `ApplicationEvent` audit ledger (`SUBMISSION_ATTEMPT_INITIALIZED`) *before* launching Playwright, acquiring network sockets, or dispatching worker threads.
3. **Candidate-Employer-Requisition Deduplication:** Enforced strict requisition-level deduplication via `generateCandidateRequisitionDuplicateKey`. Submitting a duplicate application to the same job requisition is blocked, even if the candidate modifies their resume text or generates new diff versions.
4. **Atomic Concurrency Locking:** Active states (`RUNNING_PRE_SUBMIT`, `SUBMISSION_IN_FLIGHT`) reject competing worker invocations with `CONCURRENT_EXECUTION_BLOCKED`.
5. **Quarantine Invariant:** Applications in `OUTCOME_UNKNOWN` strictly reject automatic retries until manually reconciled, preventing duplicate employer applications.

---

## 2. Orthogonal Execution Identity Domains

Rolevia AI partitions execution identity across six distinct, isolated domains:

| Domain | Identity Key Format | Purpose & Invariant |
| :--- | :--- | :--- |
| **1. LangGraph Thread** | `wf:thread:{tenantId}:{userId}:{applicationId}` | Graph state partition. Completely isolates checkpoint memory across candidate accounts and tenants. |
| **2. Graph Node Execution** | `wf:node:{threadId}:{stage}:{nodeIteration}` | Node-level idempotency preventing duplicate re-runs of inner graph steps. |
| **3. Razorpay Payment Order** | `order_rolevia_{tenantId}_{userId}_{timestamp}_{nonce}` | Financial payment transaction key. Invariant to retried webhooks. |
| **4. Application Credit Hold** | `crd:hold:{tenantId}:{userId}:{applicationId}:{requisitionId}` | Transactional credit balance hold. Holds exactly 1 credit for in-flight LIVE submissions; 0 credits in DRY_RUN. |
| **5. ATS Submission Attempt (Fixed)** | `${tenantId}:${userId}:${applicationId}:ats_attempt_${attemptNumber}:${documentHash.slice(0, 16)}` | **Durable Submission Attempt Identity.** Invariant to retry timing. Reused across network drops. |
| **6. Requisition Uniqueness** | `dup:req:{tenantId}:{userId}:{jobRequisitionHash}` | Prevents submitting multiple applications to the exact same employer job requisition across resume versions. |

---

## 3. Detailed Verification Results (`test_fault_injection_idempotency_suite.js`)

All 7 fault-injection and crash-consistency scenarios were independently executed and passed against live PostgreSQL 16:

### Test 1: Attempt Identity Invariance to Timing Drift
- **Scenario:** Generated attempt keys for identical operations 5 seconds apart.
- **Result:** `key1 === key2`. Produced identical string: `${tenantId}:${userId}:${appId}:ats_attempt_1:${docHash.slice(0, 16)}`. Zero timestamp variance.

### Test 2: Database Persistence Prior to Browser Execution
- **Scenario:** Initialized application workflow in `DRY_RUN` mode. Checked PostgreSQL audit ledger.
- **Result:** Found `SUBMISSION_ATTEMPT_INITIALIZED` event in `ApplicationEvent` table with exact payload before any browser navigation.

### Test 3: Pre-Submit Worker Kill (Crash Consistency & Credit Hold Safe)
- **Scenario:** Worker injected with fatal SIGKILL / exception during `RUNNING_PRE_SUBMIT` immediately prior to form submission.
- **Result:** Worker transition caught cleanly; credit hold safely released or preserved in ledger; balance non-negative invariant verified (`reservedCredits >= 0`). No submission registered with employer.

### Test 4: Post-Submit Interruption Quarantine & Auto-Resubmit Block
- **Scenario:** Browser interrupted immediately after clicking submit on employer portal (500 error / network drop).
- **Result:** Application transitioned to `OUTCOME_UNKNOWN`. Subsequent automated worker dispatch thrown: `APPLICATION_QUARANTINED: Automatic resubmission blocked while outcome is unknown. Manual reconciliation required.`

### Test 5: Requisition Uniqueness Across Document Edits
- **Scenario:** Application #1 submitted confirmed for requisition `req-hash-1`. Candidate creates Application #2 with completely rewritten resume bullets and attempts submission to the same requisition.
- **Result:** Second dispatch blocked with `DUPLICATE_APPLICATION_PREVENTED: Application for requisition already submitted or in flight`.

### Test 6: In-Flight Concurrency Lock
- **Scenario:** Two worker threads race to execute the same application while state is in `RUNNING_PRE_SUBMIT`.
- **Result:** Second worker rejected with `CONCURRENT_EXECUTION_BLOCKED: Application execution is already in flight.`

### Test 7: Side-Effect Immunity from State Checkpoint Mutation
- **Scenario:** Adversarial candidate directly mutates LangGraph checkpoint state to inject a forged receipt (`FORGED-CONF-99999`) and bypass human approval.
- **Result:** Node submit checks PostgreSQL database ground truth and cryptographic HMAC signature. Database application status strictly rejects forged graph receipt.

---

## 4. Architectural Summary

| Threat / Failure Mode | Prior State (Release 0.2) | Hardened State (Release 0.3 Validated) |
| :--- | :--- | :--- |
| **Worker retry timing** | Produced new key containing `Date.now()` | Strictly deterministic based on attempt counter and document hash |
| **Worker crash before submit** | Attempt ID lost | Persisted in `ApplicationEvent` before browser launches |
| **Duplicate submissions** | Allowed if resume text changed | Blocked by requisition hash duplicate identity guard |
| **Racing worker threads** | Potential double-click on employer form | Atomic state transition lock rejects competing threads |
| **Ambiguous ATS outcome** | Risk of automated duplicate submit | Quarantined in `OUTCOME_UNKNOWN`; automated retry permanently blocked |
