# ADR-002: PostgreSQL-Enforced Submission Locks and Idempotency Invariants

**Status:** ACCEPTED  
**Date:** October 26, 2026  
**Context:** Competing distributed workers or accidental duplicate queue delivery can lead to duplicate job applications submitted to real employer ATS portals. Relying strictly on in-memory or application-level locks fails across multi-process or multi-server deployments.

## Decision
Enforce submission uniqueness and concurrency control directly in PostgreSQL using a dedicated `submission_attempt_locks` table with a unique constraint:
`@@unique([tenantId, userId, requisitionKey], map: "unique_candidate_active_requisition")`

## Rationale
1. **Mathematical Impossibility of Race Conditions**: PostgreSQL's unique b-tree index guarantees atomic insertion. Two competing workers attempting to submit for the same candidate and requisition simultaneously will result in one winning the lock and the second being rejected with PostgreSQL error code `23505`.
2. **Re-entrant by Same Attempt**: The SQL insert uses:
   `ON CONFLICT (tenant_id, user_id, requisition_key) DO UPDATE SET updated_at = CURRENT_TIMESTAMP WHERE submission_attempt_locks.application_id = EXCLUDED.application_id;`
   allowing legitimate retries by the same application while blocking competing applications.
3. **Automated Orphan Reconciliation**: In-flight locks held by crashed workers (> 15m) are safely transitioned to `ORPHANED_QUARANTINED` via `reconcileOrphanedSubmissionLocks()`, quarantining the application in `OUTCOME_UNKNOWN` without risking duplicate submissions.

## Consequences
- Guaranteed zero duplicate employer applications across distributed workers.
- Migration version-controlled in `prisma/migrations/20261026000000_submission_attempt_locks/`.
- Tested and verified across 8 automated tests in `tests/test_database_migration_integrity.js`.
