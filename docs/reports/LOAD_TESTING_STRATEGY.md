# Rolevia AI — Load Testing Strategy & Progressive Acceptance Gates

**Product:** Rolevia AI ([roleviaai.co.in](https://roleviaai.co.in))  
**Primary Launch Acceptance Target:** 10,000 Simultaneously Connected Users (~250 RPS)  
**Progressive Horizon:** 10k (Launch) → 50k → 100k → 250k → 500k → 1,000,000 Users  
**Benchmark Suite:** `tests/load/` (Distributed k6 & Locust Scenarios)  
**Date:** October 26, 2026  
**Document Link:** See also execution report in [`LOAD_TESTING_REPORT.md`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/docs/reports/LOAD_TESTING_REPORT.md)  

---

## 1. Core Testing Philosophy

In accordance with Rolevia AI's revised engineering strategy:
- **Build for 10,000 users today, design for one million tomorrow.**
- Avoid unverified claims of hyperscale capacity without reproducible operational evidence.
- Initial production readiness requires passing the **10,000 user / 250 RPS benchmark** under realistic traffic patterns.
- Stress and soak tests must never target production employer ATS endpoints; all automation testing runs against sandboxed ATS fixtures in `DRY_RUN` mode.

---

## 2. Progressive Load Testing Phases & Acceptance Gates

### Phase 1: 10,000 Concurrency (250 RPS) — PRIMARY LAUNCH GATE
- **Target Release:** Release 0.4 Launch Gate.
- **Test Workload**:
  - 10,000 persistent simulated candidate connections (SSE multiplexing).
  - 250 requests per second mixed API traffic:
    - `GET /api/v1/jobs` (40% of traffic, ~100 RPS)
    - `GET /api/v1/jobs/recommendations` (25% of traffic, ~62.5 RPS)
    - `GET /api/v1/resumes/diff` (15% of traffic, ~37.5 RPS)
    - `POST /api/v1/applications/approve` (10% of traffic, ~25 RPS)
    - `GET /api/v1/applications` (10% of traffic, ~25 RPS)
- **Key Verifications**:
  - PgBouncer transaction-pooling handles backend connections without pool exhaustion.
  - Cache Redis (`allkeys-lru`) serves search query cache with > 90% hit ratio.
  - Queue Redis (`noeviction`, AOF) maintains BullMQ queues with p95 processing delay < 2.0s.
  - API response latency: p50 < 30ms, p95 < 180ms, p99 < 500ms.
  - System error rate (5xx) < 0.01%.

### Phase 2: 50,000 Concurrency (1,250 RPS) — Growth Stage
- **Focus:** Read replica query offload, BullMQ worker queue processing latency (p95 < 2.5s).

### Phase 3: 100,000 Concurrency (2,500 RPS) — Expansion Stage
- **Focus:** Multi-node Redis cluster sharding, multi-model LLM circuit breaker failover under 429 rate limit pressure.

### Phase 4: 250,000 Concurrency (6,250 RPS) — Scale Stage
- **Focus:** SSE real-time socket multiplexing, horizontal pod autoscaling under step traffic bursts.

### Phase 5: 500,000 Concurrency (12,500 RPS) — High-Scale Stage
- **Focus:** Playwright browser container autoscaling, database table partitioning under 10M rows.

### Phase 6: 1,000,000 Concurrency (25,000 RPS) — Hyperscale Horizon
- **Focus:** Multi-AZ failover, 24-hour soak test stability, RPO=0 / RTO < 15 min under simulated node loss.

---

## 3. Mandatory Quality Acceptance Gates

No release may be certified for production deployment without satisfying all criteria:
- **Zero Duplicate Applications**: 0 race-condition submissions under parallel worker execution (`unique_candidate_active_requisition`).
- **Zero Ledger Discrepancies**: Credit ledger invariant `Available + Reserved + Consumed === Total Granted` holds 100%.
- **Zero Uncontained Crashes**: Worker SIGKILL recovers cleanly to `OUTCOME_UNKNOWN` quarantine.
- **API Latency Compliance**: Lightweight API p95 < 300ms, p99 < 1,000ms.
- **Availability Compliance**: 99.95% non-5xx uptime under continuous load.
- **Queue Durability**: Zero lost jobs during worker crashes or Redis reconnection events.
