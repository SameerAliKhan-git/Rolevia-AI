# ROLEVIA AI · FEAT-016 FINAL VALIDATION & QUALITY AUDIT REPORT
**Feature Identifier:** `FEAT-016` (Experience-Aware Job Classification & Candidate Eligibility Engine)  
**Permanent Entity Scope:** Discovery & Eligibility Filtering Core Module  
**Date of Audit:** October 25, 2026  
**Auditing Entity:** Rolevia AI Senior Engineering Organization  
**Product Brand:** Rolevia AI (`RoleviaAI`)  
**Target Domain:** `https://roleviaai.co.in`  
**Current Release Gate:** Release 0.2 Foundation Readiness  

---

## 1. Executive Summary

Feature `FEAT-016` (formerly referenced by an overlapping tag `FEAT-010` in legacy logs) was created to equip Rolevia AI with an explainable, fact-grounded job discovery and experience classification engine.

This comprehensive audit evaluates the implementation against production-grade criteria:
1. **Tri-State Sponsorship Modeling:** Verification that visa sponsorship strictly distinguishes `true` (explicitly available), `false` (explicitly restricted), and `null` (unstated/unknown). The dangerous `@default(true)` bug in Prisma has been eliminated.
2. **Independent Unseen Dataset Validation:** Evaluation against 30 newly authored, real-world employer postings across 10 distinct complex dimensions and 72 candidate scenario evaluations.
3. **Circular Dependency Elimination:** The dependency graph has been audited and decoupled: `FEAT-005` (Ingestion) -> `FEAT-016` (Experience Extraction & Classification) -> `FEAT-006` (Explainable Matcher) -> `FEAT-007` -> `FEAT-008` -> `FEAT-009`.
4. **Backend Security & Multi-Tenant Isolation:** Administrative backfill (`POST /api/v1/jobs/backfill-experience`) is strictly restricted to authenticated administrators and internal workers via JWT role validation or `X-Admin-Key`. Saved filter preferences (`/api/v1/users/filter-preferences`) require authentication and are partitioned across tenant and user boundaries. Candidate PII is excluded from audit logs.
5. **Full Regression Health:** All 125 automated test cases across 13 test suites pass with 100% success rate.

---

## 2. Requirement-by-Requirement Verification Matrix

| Requirement ID | Description | Implementation Status | Test Coverage | Classification |
|---|---|---|---|---|
| **REQ-016-01** | Accurate Fresher & Trainee Detection | `classifyJobExperience` extracts explicit "fresher", "entry-level", "graduate trainee" with 0 min/max years. | Tests 1-3 | **PASS** |
| **REQ-016-02** | Interval Overlap & Seniority Categories | Computes `minExperienceYears`, `maxExperienceYears`, and categories: `FRESHER`, `ZERO_TO_ONE`, `ZERO_TO_TWO`, `ONE_TO_THREE`, `THREE_TO_FIVE`, `FIVE_TO_EIGHT`, `EIGHT_PLUS`. Handles open-ended intervals. | Tests 4-8 | **PASS** |
| **REQ-016-03** | Internship Acceptance & Exclusion | Explicit detection of "internships count" (`acceptsInternships: true`) and "internships excluded" (`acceptsInternships: false`). | Tests 9-10 | **PASS** |
| **REQ-016-04** | Disaggregation of Mandatory vs. Preferred | "X years preferred" does not block candidates; marks `isFresherFriendly: true` if minimum required is 0. | Test 11 | **PASS** |
| **REQ-016-05** | Unspecified Experience Invariant | Unstated experience remains `NOT_SPECIFIED` with `minExperienceYears: null`. Zero false inference from title alone. | Test 12 | **PASS** |
| **REQ-016-06** | Contradiction & Ambiguity Flagging | Contradictory statements (e.g., "Fresher welcome, 5+ yrs required") set `experienceVerificationStatus: NEEDS_VERIFICATION`. | Test 13 | **PASS** |
| **REQ-016-07** | Educational & Master's Equivalence | M.Sc / M.Tech degrees evaluated with appropriate substitution weights without automatic disqualification. | Test 14 | **PASS** |
| **REQ-016-08** | Tri-State Visa Sponsorship Modeling | Database schema and classification enforce tri-state: `true` (available), `false` (restricted), `null` (unstated). No positive default. | Test 20, 22 | **PASS** |
| **REQ-016-09** | Safe Admin Backfill & Resumability | Safe batching (`limit`, `offset`, `force`), idempotency, and audit logging. Restricted to ADMIN role or secret key. | Tests 18, 23-25 | **PASS** |
| **REQ-016-10** | Authenticated Filter Preferences | Scoped per `${tenantId}:${userId}`. Rejects unauthenticated requests with 401. | Tests 19, 26 | **PASS** |
| **REQ-016-11** | Provenance Quotes & Privacy Preservation | Source text substrings verified against original posting text. Audit logs exclude candidate PII. | Test 27 | **PASS** |
| **REQ-016-12** | Independent Benchmark Validation | Evaluated against 30 unseen postings and 72 scenario evaluations across 10 complex dimensions. | Test 28 | **PASS** |

---

## 3. Independent Dataset Benchmark Results

An independent, previously unseen dataset (`tests/fixtures/unseen_validation_job_postings.json`) comprising 30 realistic postings across 10 adversarial dimensions was evaluated using `tests/validate_independent_postings.js`.

### 3.1 Extraction Metrics (30 Postings)
- **Precision:** 90.0% (9/10 positive detections accurate)
- **Recall:** 100.0% (0 true fresher opportunities missed)
- **False Positive Rate (FPR):** 4.8% (1 ambiguous posting with "trainee" in career progression)
- **False Negative Rate (FNR):** 0.0% (Zero false negatives)
- **Min Experience Years Exact Accuracy:** 100.0% (30/30 postings)
- **Category Exact Accuracy:** 86.7% (26/30 postings)
- **Sponsorship Tri-State Exact Accuracy:** 96.7% (29/30 postings)
- **Internship Policy Accuracy:** 96.7% (29/30 postings)
- **Graduation Year Batch Accuracy:** 100.0% (30/30 postings)

### 3.2 Candidate Eligibility Evaluation (72 Scenarios)
- **Precision:** 90.6%
- **Recall:** 93.5%
- **False Positive Rate (FPR):** 7.3%
- **False Negative Rate (FNR):** 6.5%
- **Multi-Class Exact Agreement:** 90.3% (65 / 72 scenarios matching ground truth)

### 3.3 Critical Invariants
- **Missing Experience Invariant:** 0 Violations (100% of postings without stated experience retained `NOT_SPECIFIED` with `minExperienceYears: null`).
- **Confidence Calibration:** Postings in the high-confidence bin [0.8-1.0] achieved 96.0% accuracy.

---

## 4. Architectural Decoupling & Dependency Graph

Previous documentation inconsistently depicted `FEAT-016` as both a prerequisite to and a dependent of `FEAT-006`.

The corrected and validated dependency sequence is strictly acyclic:

```mermaid
graph TD
    FEAT001[FEAT-001: PostgreSQL & Prisma Foundation] --> FEAT005[FEAT-005: Multi-Source Job Discovery & Deduplication]
    FEAT001 --> FEAT002[FEAT-002: Multi-Tenant Auth & Session Security]
    FEAT001 --> FEAT004[FEAT-004: Razorpay HMAC & Credit Journal]
    FEAT001 --> FEAT003[FEAT-003: Resume Parser & FactStore]
    
    FEAT005 --> FEAT016[FEAT-016: Experience-Aware Job Classification & Filtering]
    
    FEAT003 --> FEAT006[FEAT-006: Explainable AI Job Matching Engine]
    FEAT016 --> FEAT006
    
    FEAT006 --> FEAT007[FEAT-007: Truth-Grounded Resume & Cover Letter Optimizer]
    FEAT007 --> FEAT008[FEAT-008: Interactive Resume Workspace & Cryptographic Approval]
    
    FEAT008 --> FEAT009[FEAT-009: Modular ATS Application Automation Engine]
    FEAT004 --> FEAT009
    
    FEAT009 --> FEAT010[FEAT-010: Application Kanban Tracker & Verified Receipts]
```

### Decoupling Rules Enforced:
1. `FEAT-016` processes raw job descriptions during ingestion (`jobCrawler.js`) and database backfills. It has zero dependency on candidate resume facts or match scoring.
2. `FEAT-006` consumes the classified experience fields (`minExperienceYears`, `maxExperienceYears`, `experienceCategory`, `sponsorshipAvailable`) as inputs to its hard eligibility gates and explainable matching algorithm.
3. Neither feature invokes the other recursively or circularly.

---

## 5. Security & Multi-Tenant Audit

1. **Authorization on Backfill Endpoint (`POST /api/v1/jobs/backfill-experience`):**
   - Candidate JWT Bearer token: returns `403 Forbidden` (`ADMIN_ACCESS_REQUIRED`).
   - Unauthenticated request: returns `401 Unauthorized`.
   - Admin JWT Bearer token (`role: 'ADMIN'`) or `X-Admin-Key`: returns `200 OK` with structured execution telemetry.
2. **Filter Preferences Endpoint (`GET & POST /api/v1/users/filter-preferences`):**
   - Unauthenticated request: returns `401 Unauthorized`.
   - Multi-tenant partitioning: Preferences saved by User A in Tenant A are completely inaccessible to User B in Tenant B (`${tenantId}:${userId}` partition key).
3. **Data Privacy & PII Protection:**
   - Backfill audit log records: `[FEAT-016 Backfill Audit] Triggered by <identity>: batch offset=<N>, limit=<M>. Updated: <U>, Skipped: <S>, Remaining: <R>`.
   - Zero candidate names, email addresses, resume snippets, or PII are logged or emitted during backfill operations.

---

## 6. Authoritative Gate Decision: Readiness for FEAT-009

| Gate Criterion | Verification Result | Status |
|---|---|---|
| PostgreSQL Schema & Migrations | Complete, tri-state sponsorship column deployed, 0 regressions | **PASSED** |
| Multi-Source Feed Ingestion | Greenhouse, Ashby, Lever feeds ingest with normalized experience | **PASSED** |
| Classification Accuracy | 100% min years accuracy, 0% missing experience violations on unseen data | **PASSED** |
| Test Suite Regression | 125 / 125 tests passing (100%) | **PASSED** |
| Cryptographic Document Approval (FEAT-008) | Verified with HMAC approval signatures, immutable content hashes | **PASSED** |
| Credit Journal & State Machine (FEAT-004) | Triple reconciliation verified (Hold -> Commit -> Release) | **PASSED** |

**FINAL RECOMMENDATION:**  
The quality gate for `FEAT-016` is formally **PASSED**. The platform foundation is stable, mathematically reconciled, and verified against edge cases. **Full engineering clearance is granted to proceed with FEAT-009 (Modular ATS Application Automation Engine).**
