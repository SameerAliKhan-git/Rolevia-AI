# Rolevia AI — Production Failure Recovery & SRE Runbook

**Product:** Rolevia AI ([roleviaai.co.in](https://roleviaai.co.in))  
**Target Availability:** 99.95% Monthly Uptime  
**Scale Target:** 1,000,000 Simultaneously Connected Users  
**Document Purpose:** Standard Operating Procedures (SOP) for automated self-healing and SRE incident response during component failures.  
**Date:** October 26, 2026  

---

## 1. Incident Severity Definitions

- **SEV-1 (Critical Outage)**: Primary database unavailable, complete application submission outage, payment ledger corruption risk, or uncontained security breach. Page SRE on-call immediately; RTO < 15 min.
- **SEV-2 (Degraded Performance)**: Third-party LLM outage, ATS browser worker backlog (> 1,000 jobs), Redis node failover, or API p95 latency > 500 ms. Response time < 30 min.
- **SEV-3 (Minor / Isolated)**: Single ATS adapter failure (e.g. Lever DOM update), background job crawler failure, or minor UI rendering defect. Handled during business hours.

---

## 2. Automated Self-Healing Runbooks

### Runbook 1: Playwright Worker Process SIGKILL / Unclean Exit
- **Symptom**: Worker process dies due to host OOM killer or container restart while an application is in `SUBMISSION_IN_FLIGHT`.
- **Automated Self-Healing**:
  1. The lock in `submission_attempt_locks` remains in `IN_FLIGHT`.
  2. Competing workers attempting the same requisition are blocked by PostgreSQL unique constraint `unique_candidate_active_requisition`.
  3. Periodic cron executes `backend/db/migrationManager.js:reconcileOrphanedSubmissionLocks({ timeoutMinutes: 15 })`.
  4. Stale locks (> 15m) are updated to `ORPHANED_QUARANTINED`.
  5. The corresponding `Application` record is updated to `OUTCOME_UNKNOWN` quarantine with a descriptive reason.
  6. An audit event `LOCK_RECONCILIATION_ORPHAN_CLEARED` is recorded in `ApplicationEvent`.
- **Manual SRE Action (if needed)**:
  - Check container memory metrics; scale worker RAM allocation if OOM is recurrent.
  - Review quarantined applications; trigger manual candidate confirmation email if employer confirmation is ambiguous.

---

### Runbook 2: PostgreSQL Primary Failover & Replication Lag
- **Symptom**: Primary database host fails health checks or AWS RDS / GCP Cloud SQL initiates automated Multi-AZ failover.
- **Automated Self-Healing**:
  1. PgBouncer pauses inbound client transactions without dropping client TCP sockets (`PAUSE` mode).
  2. Standby replica is promoted to primary within 30-60 seconds.
  3. PgBouncer reconnects to the newly promoted primary and resumes paused client transactions (`RESUME` mode).
  4. API instances resume normal read/write traffic without requiring process restarts.
- **Manual SRE Action**:
  - Run verification query: `SELECT * FROM "_rolevia_migrations";`
  - Verify replication lag on secondary replicas: `SELECT pg_last_wal_replay_lsn();`

---

### Runbook 3: Redis Cluster Node Outage / Memory Eviction
- **Symptom**: Redis node crashes or memory reaches 90% threshold.
- **Automated Self-Healing**:
  1. Redis Sentinel detects master failure (ping timeout > 3,000 ms) and promotes replica to master.
  2. BullMQ clients automatically reconnect to new master using sentinel address resolution.
  3. In-flight jobs not acknowledged within `lockDuration` (30s) are automatically re-queued for delivery.
  4. Non-essential search caches evicted according to `allkeys-lru` policy.
- **Manual SRE Action**:
  - Check BullMQ stalled job counter: `await queue.getFailedCount()`.
  - Replay failed jobs from DLQ if necessary: `await dlq.retryAll()`.

---

### Runbook 4: Third-Party LLM Provider Outage or 429 Throttling
- **Symptom**: Primary provider (Groq Cloud) returns HTTP 500, 503, or 429 rate limit errors.
- **Automated Self-Healing**:
  1. `llmGateway.js` circuit breaker records 5 consecutive failures and trips circuit to `OPEN`.
  2. Subsequent candidate requests are immediately routed to secondary provider (Google Gemini 1.5 Pro) with 0 network latency delay.
  3. If Gemini also fails, traffic fails over to emergency fallback (OpenAI GPT-4o-mini).
  4. Circuit breaker enters `HALF-OPEN` after 30 seconds, probing Groq with a single health request.
- **Manual SRE Action**:
  - Monitor token burn rate on fallback providers in CloudWatch / Datadog.
  - Verify candidate FactStore grounding metrics remain at 100%.

---

### Runbook 5: Duplicate Queue Message Delivery
- **Symptom**: Redis network partition causes BullMQ to deliver the same submission job twice to two different workers.
- **Automated Self-Healing**:
  1. Worker 1 acquires database lock in `submission_attempt_locks`.
  2. Worker 2 attempts `INSERT INTO submission_attempt_locks` for the same `(tenant_id, user_id, requisition_key)`.
  3. PostgreSQL rejects Worker 2 with unique constraint violation (`23505`).
  4. Worker 2 catches the constraint exception, logs `DUPLICATE_APPLICATION_PREVENTED`, and exits cleanly without launching a browser or touching the employer's portal.
- **Manual SRE Action**:
  - Zero action required; database invariant prevents duplicate application by design.

---

### Runbook 6: Orphaned Lock Reconciliation Procedure
- **Command to Execute**:
  ```bash
  node -e "const { reconcileOrphanedSubmissionLocks } = require('./backend/db/migrationManager'); reconcileOrphanedSubmissionLocks({ timeoutMinutes: 15 }).then(console.log).catch(console.error);"
  ```
- **Expected Output**:
  `[LOCK RECONCILIATION] Reconciled N orphaned submission lock(s) into OUTCOME_UNKNOWN quarantine.`
- **Post-Execution Audit**:
  Confirm that no unlocked applications are resubmitted without explicit candidate approval.
