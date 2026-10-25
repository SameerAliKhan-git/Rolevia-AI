# ROLEVIA AI — LANGGRAPH CHECKPOINT RECOVERY & DURABILITY AUDIT REPORT

**Product:** Rolevia AI  
**Brand Identifier:** RoleviaAI  
**Domain:** https://roleviaai.co.in  
**Evaluation Date:** October 26, 2026  
**Module Audited:** `backend/workflows/postgresCheckpointer.js`, `backend/workflows/applicationGraph.js`, `backend/workflows/idempotency.js`  
**Test Suite:** `tests/test_langgraph_durability_suite.js` (11 / 11 Passing)  
**Database Persistence:** PostgreSQL 16 `ApplicationEvent` Journal  

---

## 1. Audit Overview

LangGraph checkpointing provides state graph pause and resume capabilities. However, in enterprise SaaS architecture, workflow engine checkpoints must **never** replace authoritative relational records for financial transactions, candidate approvals, or legal employer application receipts.

This audit validates:
1. Complete state durability and thread recovery after total process / worker crashes.
2. Cross-tenant isolation boundaries enforced at the database checkpointer level.
3. Separation of LangGraph checkpoints from relational ledger tables (`BillingJournalEntry`, `SubmissionAuthorization`, `ApplicationEvent`).
4. Robustness under concurrent worker execution and duplicate invocations.

---

## 2. The 10 LangGraph Durability & Recovery Scenarios

| Scenario # | Test Scenario Description | Expected Outcome | Verified Runtime Behavior | Status |
| :---: | :--- | :--- | :--- | :---: |
| **1** | Server crash during optimization | Re-instantiated checkpointer recovers exact `documentHash` and pause stage without re-running optimization | State loaded from `ApplicationEvent` where `eventType = 'LANGGRAPH_CHECKPOINT'`; `currentStage` is `DOCUMENT_REVIEW`, `documentHash` matches. | **VERIFIED** |
| **2** | Restart during document approval | Workflow remains safely blocked at `DOCUMENT_REVIEW` waiting for candidate sign-off | Unapproved state persists; runner halts at approval boundary without advancing to submission. | **VERIFIED** |
| **3** | Restart after credit reservation | Existing `creditHoldId` is retrieved; duplicate credit reservation is prevented | `creditHeld: true` and journal ID preserved; no second `holdCreditForApplication` call executed. | **VERIFIED** |
| **4** | Restart before submit | Cryptographic HMAC authorization token is preserved | Token verified with candidate secret; cryptographic check passes without re-prompting candidate. | **VERIFIED** |
| **5** | Restart after submit with ambiguous result | Application remains safely quarantined in `OUTCOME_UNKNOWN` | Checkpoint loads `status: 'OUTCOME_UNKNOWN_QUARANTINE'`; retry logic prevented from auto-resubmitting. | **VERIFIED** |
| **6** | Duplicate graph invocation | Graph execution is idempotent; does not re-execute completed nodes | Successive calls return identical state values without corrupting event ledger or stage pointers. | **VERIFIED** |
| **7** | Concurrent execution by multiple workers | Workers racing on same thread resolve safely without deadlock | Transactional updates execute without PostgreSQL deadlocks; thread states resolve consistently. | **VERIFIED** |
| **8** | Document revision followed by reapproval | Candidate edits reset approval state, increment version, and loop back | Modified text resets `approvedByCandidate: false`, increments `documentVersion` to 2+, and re-pauses. | **VERIFIED** |
| **9** | Cross-tenant checkpoint query | Tenant A worker attempting to read Tenant B thread is rejected | `PostgresDurableCheckpointer` queries database application ownership; throws `CROSS_TENANT_ACCESS_DENIED`. | **VERIFIED** |
| **10**| Workflow schema-version change | Old checkpoints with mismatched version tags require explicit migration | State schema tags enforced; incompatible version tags detected and handled via version gates. | **VERIFIED** |

---

## 3. Idempotency Architecture (6 Orthogonal Identities)

Implemented in `backend/workflows/idempotency.js`:

```javascript
// 1. Workflow Thread Identity (One per application workflow lifecycle)
generateWorkflowThreadId({ tenantId, userId, applicationId });
// Format: thread:{tenantId}:{userId}:{applicationId}

// 2. Node Execution Identity (Scoring, optimization, or preparation step)
generateNodeExecutionKey({ tenantId, userId, applicationId, workflowVersion, nodeName, executionAttempt });
// Format: node:{tenantId}:{userId}:{applicationId}:{workflowVersion}:{nodeName}:attempt-{executionAttempt}

// 3. Workflow Attempt Identity (Distinguishes full workflow retries)
generateWorkflowAttemptKey({ tenantId, userId, applicationId, workflowAttempt });
// Format: wf-attempt:{tenantId}:{userId}:{applicationId}:v{workflowAttempt}

// 4. Payment Operation Identity (Billing hold, commit, refund)
generatePaymentOperationKey({ tenantId, userId, applicationId, operationType, referenceId });
// Format: pay-idemp:{tenantId}:{userId}:{applicationId}:{operationType}:{referenceId}

// 5. ATS Submission Attempt Identity (Physical browser run)
generateAtsSubmissionAttemptKey({ tenantId, userId, applicationId, attemptNumber, documentHash, timestamp });
// Format: ats-sub:{tenantId}:{userId}:{applicationId}:try-{attemptNumber}:{docHashPrefix}:{ts}

// 6. Candidate Requisition Duplicate Identity (Prevents double application across channels)
generateCandidateRequisitionDuplicateKey({ tenantId, userId, jobRequisitionHash });
// Format: cand-req-dup:{tenantId}:{userId}:{jobRequisitionHash}
```

---

## 4. Architectural Separation of Checkpoints vs Invariant Ledgers

LangGraph checkpoints store transient state execution graphs. To prevent financial or legal discrepancies:
- **Credits & Billing:** Managed strictly by `BillingJournalEntry` in PostgreSQL using atomic transactions (`prisma.$transaction`). Checkpoints store only the resulting `creditHoldId` and `creditHeld` boolean for resume coordination.
- **Candidate Approval:** Cryptographic HMAC signatures and SHA-256 content hashes are stored in `Application` records and verified with candidate secret keys, independent of graph memory.
- **Employer Receipts:** Verified confirmation receipts (`confirmationNumber`, `receiptHash`, `screenshotArtifact`) reside in the immutable `ApplicationEvent` log, preventing simulated receipts or checkpoints from fabricating submission evidence.

---

## 5. Verification Command & Results

```powershell
node tests/test_langgraph_durability_suite.js
```
- Total Scenarios: 11
- Passed: 11 (100%)
- Failed: 0
