# ADR-002: PostgreSQL-Enforced Submission Locks and Idempotency Invariants

**Status:** ACCEPTED  
**Date:** October 26, 2026 (Reconciled with External Side-Effect Realities)  
**Context:** Competing distributed workers or duplicate queue delivery can dispatch concurrent browser tasks for the same candidate and job requisition. Relying strictly on in-memory or application-level locks fails across multi-process and multi-server deployments. Furthermore, external third-party employer ATS platforms do not support two-phase commit (2PC) or distributed transactions.

## Decision
1. **At-Most-One Internal Execution Lock**: Enforce submission concurrency control directly in PostgreSQL using a dedicated `submission_attempt_locks` table with a unique constraint:
   `@@unique([tenantId, userId, requisitionKey], map: "unique_candidate_active_requisition")`
2. **Re-entrant Attempt Key Semantics**:
   `ON CONFLICT (tenant_id, user_id, requisition_key) DO UPDATE SET updated_at = CURRENT_TIMESTAMP WHERE submission_attempt_locks.application_id = EXCLUDED.application_id;`
   allowing legitimate retries by the same application while blocking competing applications with PostgreSQL constraint violation code `23505`.
3. **Ambiguous Outcome Quarantine**: Because external networks cannot guarantee exactly-once side effects, any submission interrupted by network timeout, browser crash, or ambiguous confirmation is placed in `OUTCOME_UNKNOWN` quarantine and requires candidate verification or reconciliation before any retry is permitted.
4. **Authoritative Migration & Rollback Policy**:
   Prisma migrations in `prisma/migrations/` serve as the single source of truth for schema evolution. Production deployments strictly require **forward-only, data-preserving additive migrations**. Destructive schema rollbacks (`DROP TABLE ... CASCADE`) are prohibited in production to prevent audit and lock history loss.

## Rationale
- Prevents race conditions across distributed worker processes before launching browser contexts.
- Respects the boundary between internal database guarantees and external ATS side effects.
- Preserves audit trails and candidate application history during deployment operations.

## Consequences
- Verified via `tests/test_database_migration_integrity.js` (8/8 tests passing) and `tests/test_multiprocess_worker_crash.js` (3/3 tests passing).
- Zero duplicate internal dispatch across parallel workers.
