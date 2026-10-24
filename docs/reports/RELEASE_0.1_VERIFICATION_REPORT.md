# Rolevia AI · Release 0.1 Verification Report

**Product Working Brand**: Rolevia AI (`RoleviaAI`)  
**Intended Public Domain**: `https://roleviaai.co.in` (Domain configuration prepared; awaiting DNS registration)  
**Git Branch**: `release/0.1-core-foundation`  
**Execution Timestamp**: 2026-10-24T22:25:00+05:30  
**Test Suite Pass Rate**: **100% (26 passed / 0 failed / 12,859ms)**  

---

## 1. Executive Summary

Release 0.1 establishes the core architectural and security foundation of **Rolevia AI**. The platform has transitioned from a vulnerable prototype relying on an unindexed flat JSON document (`store.json`), plain text passwords, unverified payment decrements, and hardcoded candidate details into a production-grade **Modular Monolith** powered by:
1. **Prisma ORM & PostgreSQL-ready relational persistence** with strict foreign keys, cascades, and indexes.
2. **Multi-tenant authentication** featuring bcrypt (cost factor 10), cryptographically signed JWT Bearer tokens, HTTP-only cookie support, and strict tenant boundary isolation.
3. **Dynamic PDF parsing and candidate Fact Store** using `pdf-parse` to extract contact information, education, work experience, projects, and skills from binary documents into normalized relational tables.
4. **Cryptographic payment verification and a balanced transactional credit journal** preventing timing attacks via `crypto.timingSafeEqual`, defending against webhook replay attacks via idempotency tables, and implementing atomic hold/commit/release workflows.
5. **Continuous job ingestion, deduplication, and freshness monitoring** computing deterministic SHA-256 requisition hashes with tracking parameter stripping and performing 30-minute automated health sweeps.
6. **Centralized Brand Configuration** (`backend/config/brand.config.js` and `brand.config.js`) eliminating hardcoded domain names and brand strings across frontend and backend.

---

## 2. Implemented Features (Release 0.1 Scope)

| Feature ID | Feature Name | Description | Key Modules |
| :--- | :--- | :--- | :--- |
| **FEAT-001** | PostgreSQL & Prisma Migration | Full relational database schema replacing `store.json`. Models: `Tenant`, `User`, `CandidateProfile`, `FactStore`, `Job`, `Application`, `CreditJournal`, `ProcessedWebhookEvent`. | `prisma/schema.prisma`, `backend/db.js`, `prisma/seed.js` |
| **FEAT-002** | Secure Multi-Tenant Authentication | Bcrypt password hashing, JWT Bearer tokens with 7-day expiration, tenant boundary isolation, register/login/me/logout endpoints. | `backend/auth.js`, `backend/server.js` |
| **FEAT-003** | Dynamic Resume Parsing & Fact Store | Binary PDF text extraction via `pdf-parse`, regex and semantic entity parsing, ATS readiness scoring (98/100), and FactStore persistence. | `backend/resumeParser.js`, `backend/server.js` |
| **FEAT-004** | Secure Razorpay Verification & Credit Journal | Constant-time HMAC-SHA256 signature verification, webhook replay defense, atomic credit `APPLICATION_HOLD`, `APPLICATION_COMMIT`, `APPLICATION_RELEASE`, and `OUTCOME_UNKNOWN` quarantine. | `backend/billing.js`, `backend/server.js` |
| **FEAT-005** | Job Ingestion, Freshness & Deduplication | Deterministic SHA-256 requisition hashing with query parameter normalization, automated duplicate rejection, and 30-min live freshness verification. | `backend/jobCrawler.js`, `backend/server.js` |
| **BRAND-001** | Centralized Brand Configuration | Brand constants (`Rolevia AI`, `roleviaai.co.in`, tagline, descriptions) centralized in shared module; frontend UI and backend headers synchronized. | `backend/config/brand.config.js`, `brand.config.js`, `index.html`, `app.js` |

---

## 3. Modified & Created Files

### Created Files
- `backend/config/brand.config.js` — Centralized brand configuration module.
- `brand.config.js` — Client-side exposed brand configuration module.
- `backend/db.js` — Singleton Prisma client wrapper.
- `backend/auth.js` — Bcrypt hashing, JWT token management, and multi-tenant authorization middleware.
- `backend/resumeParser.js` — PDF binary parser, structured career fact extractor, and FactStore sync.
- `backend/billing.js` — Constant-time HMAC-SHA256 signature validator, replay detector, and credit journal engine.
- `backend/jobCrawler.js` — Canonical requisition hashing, deduplication filter, and HTTP health scanner.
- `prisma/schema.prisma` — Production relational schema defining 8 models and composite indexes.
- `prisma/seed.js` — Data migration script migrating `store.json` records to Prisma relational tables.
- `package.json` — Root dependency and lifecycle script manifest.
- `tests/test_feat001_db.js` — Automated database migration and relation test suite.
- `tests/test_feat002_auth.js` — Automated authentication, bcrypt, JWT, and tenant isolation test suite.
- `tests/test_feat003_resume.js` — Automated PDF extraction, ATS scoring, and FactStore test suite.
- `tests/test_feat004_billing.js` — Automated payment security, timing-safety, and credit journal test suite.
- `tests/test_feat005_crawler.js` — Automated requisition hashing, deduplication, and URL health test suite.
- `tests/run_all_tests.js` — Master test harness and release verification runner.
- `docs/reports/RELEASE_0.1_VERIFICATION_REPORT.md` — This release verification report.

### Modified Files
- `backend/server.js` — Integrated Prisma, Auth, ResumeParser, Billing, JobCrawler, and BrandConfig modules while preserving legacy API backwards compatibility.
- `index.html` — Updated title, meta description, top brand navigation, and modal dialogues to Rolevia AI; included `brand.config.js`.
- `app.js` — Replaced hardcoded brand strings, updated fallback SVG badges, integrated `BRAND` constants, and eliminated stealth claims in proxy configurations.
- `backend/database/store.json` — Synchronized Razorpay demo key and recruiter email templates to Rolevia AI.
- `.gitignore` — Added SQLite database artifacts (`*.db`, `*.db-journal`).

---

## 4. Database Migration Results

The initial database seed was executed against SQLite (`dev.db`) using `node prisma/seed.js`.

```
[Rolevia Migration] Starting Prisma database seed...
[Rolevia Migration] Tenant verified: Rolevia Primary Workspace (tenant-rolevia-default)
[Rolevia Migration] User seeded: Sameer Ali Khan <sammysameerkhan007@gmail.com> (Credits: 3497)
[Rolevia Migration] FactStore populated with 5 verified candidate facts.
[Rolevia Migration] CreditJournal initial grant record logged.
[Rolevia Migration] Seeded 12 jobs with SHA-256 requisition hashes.
[Rolevia Migration] Seeded 6 candidate applications.
[Rolevia Migration] Migration completed successfully.
```

### Relational Schema Summary:
- **Tenants**: 1 active tenant (`tenant-rolevia-default`, subdomain: `default`).
- **Users**: 1 active candidate user (`usr-sameer-01`) with bcrypt-hashed credentials and 3,497 credits.
- **Candidate Profiles**: 1 profile with 98/100 ATS readiness score.
- **Fact Store**: 5 structured facts (2 Education, 1 Work Experience, 2 Projects).
- **Jobs**: 12 active opportunities indexed with deterministic SHA-256 hashes (`requisitionHash`).
- **Applications**: 6 applications in relational storage.
- **Credit Journal**: Initial subscription grant recorded with balance invariants.

---

## 5. Automated Acceptance Test Results

All 5 test suites were executed sequentially using the master test harness `node tests/run_all_tests.js`.

### Test Execution Output:
```
================================================================
     ROLEVIA AI · RELEASE 0.1 ACCEPTANCE TEST HARNESS           
     Brand: RoleviaAI · Intended Domain: roleviaai.co.in        
================================================================

--- [TEST SUITE 1] FEAT-001: Relational Schema & Prisma Migration ---
✓ Model: Tenant verified with unique subdomain constraint
✓ Model: User verified with tenant relation and bcrypt hash
✓ Model: FactStore verified with 5 structured career entities
✓ Model: Job verified with 13 SHA-256 indexed requisitions
✓ Model: Application (9 records) & CreditJournal (6 entries) verified
>> [PASS] FEAT-001: All database models and constraints verified.

--- [TEST SUITE 2] FEAT-002: Multi-Tenant Authentication & JWT ---
✓ Bcrypt: Password hashing and comparison verified
✓ Validation: Passwords under 8 characters rejected
✓ Registration: New tenant user created with 50 credits & JWT token
✓ JWT: Signed token verified with valid claims and expiration
✓ Login: Validated credential check & rejection of invalid password
✓ Tenant Isolation: Cross-tenant access attempt strictly rejected
>> [PASS] FEAT-002: Multi-tenant authentication and security verified.

--- [TEST SUITE 3] FEAT-003: Dynamic Resume Parsing & FactStore ---
✓ Extraction: Extracted 6841 characters across 2 page(s)
✓ Entities: Extracted 22 skills, contact info, and verified social links
✓ Facts: Parsed 2 education entities and 1 experience entities
✓ Telemetry: ATS Readiness Score 99/100, word count: 870
✓ FactStore: Synchronized 5 verified career facts to Prisma database
>> [PASS] FEAT-003: Dynamic resume parsing and FactStore verified.

--- [TEST SUITE 4] FEAT-004: Payment Security & Credit Journal ---
✓ HMAC: Valid payment signature verified via timingSafeEqual
✓ Security: Forged and malformed signatures rejected without timing leaks
✓ Replay Defense: Duplicate webhook event flagged and handled idempotently
✓ Credit Journal: Atomic HOLD and COMMIT completed with balance consistency
✓ Credit Journal: Pre-submission failure refunded via APPLICATION_RELEASE
✓ Correction 1 & 2: OUTCOME_UNKNOWN quarantined safely without duplicate submission or invalid refund
>> [PASS] FEAT-004: Payment security and credit accounting verified.

--- [TEST SUITE 5] FEAT-005: Job Ingestion & Deduplication ---
✓ Normalization: Deterministic SHA-256 requisition hash verified with tracking param stripping
✓ Deduplication: Duplicate job posting caught by unique requisitionHash constraint
✓ Health Check: Dead external links (HTTP 404) correctly flagged
✓ Freshness Scan: Scanned 14 opportunities (12 verified live, 2 expired)
>> [PASS] FEAT-005: Job ingestion, freshness, and deduplication verified.

================================================================
                 RELEASE 0.1 TEST RESULTS                       
================================================================
  • FEAT-001 Database Migration            : 5 passed / 0 failed
  • FEAT-002 Authentication                : 6 passed / 0 failed
  • FEAT-003 Resume Parsing                : 5 passed / 0 failed
  • FEAT-004 Payment & Credit Accounting   : 6 passed / 0 failed
  • FEAT-005 Job Ingestion & Freshness     : 4 passed / 0 failed
----------------------------------------------------------------
  TOTAL TESTS EXECUTED : 26
  TOTAL PASSED         : 26 (100%)
  TOTAL FAILED         : 0
  EXECUTION DURATION   : 12859ms
================================================================

✅ RELEASE 0.1 GATES PASSED: All architectural criteria satisfied.
```

---

## 6. Live Server Verification

The updated Rolevia AI server daemon was verified live on `http://localhost:3000`:

```
Brand config: Rolevia AI RoleviaAI https://roleviaai.co.in
User endpoint: Sameer Ali Khan Credits: 3497
Jobs endpoint: 12 active jobs loaded
HTML Title verified: true (Rolevia AI · Your Career, Intelligently Accelerated)
HTML Release Badge verified: true (RELEASE 0.1)
```

---

## 7. Security Findings & Hardening Applied

1. **Timing Attack Protection**: Replaced standard string equality (`===`) with constant-time buffer comparison (`crypto.timingSafeEqual`) for all signature verifications.
2. **Webhook Replay Protection**: Webhook events are tracked in `ProcessedWebhookEvent` by unique `eventId`. Replayed requests are acknowledged with idempotent HTTP 200 without duplicate credit grants.
3. **Password Security**: Removed plain-text password risks by enforcing bcrypt hashing with standard work factor 10.
4. **Tenant Isolation**: All requests requiring authenticated access validate tenant boundary membership (`user.tenantId === token.tenantId`). Tampered tokens result in HTTP 401/403 rejections.
5. **No Stealth Claims**: Removed anti-detection/stealth bypass marketing from proxy settings, replacing them with authorized browser and clean residential IP options.

---

## 8. Known Limitations (Release 0.1 Boundary)

1. **Database Mode**: Local execution uses SQLite (`dev.db`). Production deployment requires pointing `DATABASE_URL` to a live PostgreSQL cluster and running `npx prisma migrate deploy`.
2. **Browser Automation Subagent**: The environment lacked pre-installed Playwright browser binaries; automated browser subagent operations timed out attempting to download binaries from Azure Edge. Frontend verification was completed via direct HTTP endpoint responses and DOM inspection.
3. **Out of Scope (Release 0.2+)**: Explainable job matching (`FEAT-006`), tailored resume generation (`FEAT-007`), diff approval workflows (`FEAT-008`), Playwright ATS submission runner (`FEAT-009`), and Kanban application tracking (`FEAT-010`) remain deferred to future approved releases per explicit user instructions.

---

## 9. Rollback Procedures

If issues arise with Release 0.1:
1. **Revert Git Branch**: Switch back to the previous stable commit or branch:
   ```bash
   git checkout main
   ```
2. **Revert Database**: Restore legacy `backend/database/store.json` from backup and purge `dev.db`:
   ```bash
   rm dev.db*
   ```
3. **Restart Server**:
   ```bash
   node backend/server.js
   ```

---

## 10. Conclusion & Gate Sign-Off

Release 0.1 has passed all 26 automated unit, integration, security, and migration acceptance tests with zero failures.

**Status**: **RELEASE 0.1 ACCEPTANCE GATES PASSED**  
**Action**: Work is halted at this boundary. **Release 0.2 will NOT proceed without explicit user approval.**
