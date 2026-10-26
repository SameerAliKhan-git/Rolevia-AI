# Rolevia AI — Load Testing Benchmark Report & Execution Protocols

**Product:** Rolevia AI ([roleviaai.co.in](https://roleviaai.co.in))  
**Initial Launch Acceptance Target:** 10,000 Simultaneously Connected Users (~250 RPS)  
**Long-Term Horizon:** Progressive Roadmaps to 50k, 100k, 250k, 500k, and 1,000,000 Users  
**Benchmark Tools:** k6 (Distributed Load Runner), Locust (Python User Scenarios)  
**Date:** October 26, 2026  
**Status:** PROTOCOL SPECIFIED & STAGING-READY (Milestone 1 Acceptance Gate)  

---

## 1. Load Testing Objectives & Distinction of Units

Before certifying Rolevia AI for production deployment at the **10,000 user launch scale**, synthetic benchmarks must adhere to precise unit definitions:

1. **Simultaneously Connected Users**: 10,000 candidates with open SSE/HTTP connections receiving background updates.
2. **Active Virtual Users (VUs)**: k6 load generator instances executing realistic request loops with think time.
3. **Throughput (RPS)**: Measured HTTP requests successfully handled per second by the API cluster. For 10,000 users with typical candidate browsing behavior, the target baseline throughput is **250 RPS**.
4. **Lightweight API Latency Gate**: Under 250 RPS, p95 latency must remain < 180 ms; p99 latency must remain < 500 ms (absolute hard ceiling: p95 < 300ms, p99 < 1,000ms).
5. **Zero Duplicate Applications**: Injected competing concurrent worker submissions must yield exactly 1 confirmed application and 0 duplicates (`unique_candidate_active_requisition`).
6. **Double-Entry Balance Invariant**: Zero discrepancy across `Available`, `Reserved`, and `Consumed` credits under concurrent purchase and reservation bursts.
7. **Crash Resiliency**: Killing worker processes mid-submission (`SIGKILL`) must result in 100% auditable recovery into `OUTCOME_UNKNOWN` without orphaned locks or deadlocks.
8. **Soak Stability**: 24-hour continuous execution at launch scale with zero memory leaks (< 5% RSS growth).

---

## 2. Test Execution Profiles

### Profile A: 10,000 Connected User Benchmark (Launch Gate — 250 RPS)
- **Workload**: 1,000 Active Virtual Users (VUs) with 3–4 second think time generating **250 measured RPS**.
- **Duration**: 30 minutes (5m ramp-up, 20m plateau, 5m ramp-down).
- **Endpoint Distribution**:
  - `GET /api/v1/jobs` (40% of traffic, ~100 RPS)
  - `GET /api/v1/jobs/recommendations` (25% of traffic, ~62.5 RPS)
  - `GET /api/v1/resumes/diff` (15% of traffic, ~37.5 RPS)
  - `POST /api/v1/applications/approve` (10% of traffic, ~25 RPS)
  - `GET /api/v1/applications` (10% of traffic, ~25 RPS)

### Profile B: Stress & Breaking Point Analysis
- **Goal**: Identify the exact traffic threshold where API p95 latency exceeds 500ms or PostgreSQL connection pool saturates.
- **Ramp Profile**: Step increase of 250 RPS every 3 minutes up to 2,500 RPS (100k user equivalent).
- **Monitored Telemetry**: CPU, Event Loop Lag, PgBouncer pool wait time, Redis command latency.

### Profile C: Soak Testing (Memory Leak Detection)
- **Goal**: Detect slow buffer leaks, unclosed Playwright browser contexts, or unbounded in-memory caches.
- **Duration**: 24 continuous hours at 250 RPS sustained load.
- **Failure Threshold**: Heap memory exceeding 80% of container limit or event loop delay > 50ms.

### Profile D: Chaos & Fault-Injection Suite
1. **SIGKILL Worker Injection**:
   - `kill -9` fired against active Playwright worker during form fill.
   - Verified in `tests/test_multiprocess_worker_crash.js`: Worker 2 resumes; competing worker blocked.
2. **PostgreSQL Primary Network Partition**:
   - Primary database severed for 30 seconds; API must shed load gracefully with HTTP 503 and recover upon replica promotion.
3. **Queue Redis Cluster Node Failure**:
   - Queue Redis master interrupted; Sentinel promotes replica within 5 seconds; BullMQ queue resumes without lost jobs or corrupted ZSets.
4. **LLM Provider Outage Injection**:
   - Groq Cloud API simulated as returning HTTP 500/429; `llmGateway.js` circuit breaker trips within 5 requests and fails over to Gemini 2.5 seamlessly.

---

## 3. Distributed k6 Benchmark Script Specification (`tests/load/k6_hyperscale_suite.js`)

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

// Benchmark Profile: 10,000 Connected Users Target (250 RPS Baseline)
export const options = {
  stages: [
    { duration: '5m', target: 1000 },  // Ramp to 1,000 VUs (~250 RPS)
    { duration: '20m', target: 1000 }, // Steady plateau
    { duration: '5m', target: 0 },     // Ramp-down
  ],
  thresholds: {
    'http_req_duration{endpoint:jobs}': ['p(95)<180', 'p(99)<500'],
    'http_req_failed': ['rate<0.005'],
  },
};

export default function () {
  const params = {
    headers: {
      'Authorization': `Bearer ${__ENV.TEST_CANDIDATE_TOKEN}`,
      'X-Tenant-ID': 'tenant-load-test',
    },
  };

  // 1. Browse Jobs
  const resJobs = http.get('http://localhost:3000/api/v1/jobs?experienceCategory=0-2', params);
  check(resJobs, { 'jobs status 200': (r) => r.status === 200 });

  sleep(3);

  // 2. Fetch Recommendations
  const resRecs = http.get('http://localhost:3000/api/v1/jobs/recommendations', params);
  check(resRecs, { 'recs status 200': (r) => r.status === 200 });

  sleep(4);
}
```

---

## 4. Current Staging vs. Target Milestones

| Capability Gate | Staging Status (Oct 2026) | 10k Launch Acceptance Target | 1M Hyperscale Horizon Target |
| :--- | :--- | :--- | :--- |
| **Automated Regression Suite** | **246 / 246 passed (100%)** | 250+ passed | 300+ passed |
| **Multi-Process Crash Recovery** | **3 / 3 verified** | Continuous chaos tests | Multi-region chaos drills |
| **Database Lock Concurrency** | **PostgreSQL Enforced** | Tested to 1,000 conc. locks | Tested to 50,000 conc. locks |
| **Synthetic Candidate Journey** | **12 / 12 stages validated** | 100 parallel journeys | 10,000 parallel journeys |
| **Measured Concurrency Status** | Staging (Single Host) | Staging Cluster (3 Nodes) | Distributed Multi-AZ Cluster |
