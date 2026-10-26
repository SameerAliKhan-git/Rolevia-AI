# Rolevia AI — Reliability Engineering Standards & Fault-Tolerance Architecture

**Product:** Rolevia AI ([roleviaai.co.in](https://roleviaai.co.in))  
**Target Availability:** 99.95% Monthly Uptime  
**Scale Target:** 1,000,000 Simultaneously Connected Users  
**Engineering Discipline:** Site Reliability Engineering & Distributed Fault Tolerance  
**Date:** October 26, 2026  

---

## 1. Core Engineering Principles (SOLID, DRY, KISS)

Every component across Rolevia AI must adhere strictly to software engineering best practices:

1. **Single Responsibility Principle (SRP)**:
   - Crawler modules (`jobCrawler.js`) ONLY handle ingestion, normalization, and deduplication.
   - Matching modules (`jobMatcher.js`, `experienceEngine.js`) ONLY compute explainable eligibility.
   - Automation modules (`atsAutomation.js`) ONLY interact with employer form DOMs.
   - Accounting modules (`billing.js`) ONLY execute double-entry credit ledger transitions.
2. **Open/Closed Principle (OCP)**:
   - ATS adapters inherit from an abstract `BaseATSAdapter` contract, allowing new providers (SmartRecruiters, BambooHR) to be added without modifying existing Greenhouse or Lever adapters.
   - LLM providers inherit from `BaseLLMProvider` within `llmGateway.js`.
3. **Liskov Substitution & Interface Segregation**:
   - Every ATS adapter implements `detect()`, `extractFields()`, `fillForm()`, `verifySubmission()`, and `handleUnknownOutcome()`.
4. **Dependency Inversion (DIP)**:
   - High-level business logic (e.g. `applicationGraph.js`) depends on abstract state contracts and repository interfaces, not concrete SQL drivers or external HTTP clients.
5. **KISS & DRY**:
   - The shortest working diff wins. Never add unnecessary wrappers, synthetic microservices, or premature abstractions before measured workload bottlenecks justify them.

---

## 2. Distributed Fault-Tolerance Patterns

### 2.1 Circuit Breakers
Implemented for all external third-party calls (Groq Cloud, Gemini, OpenAI, employer ATS domains, Razorpay):
- **States**: `CLOSED` (Normal), `OPEN` (Tripped - fast-fail without network request), `HALF-OPEN` (Probing recovery).
- **Threshold**: 5 consecutive 5xx errors or network timeouts trips the circuit for 30 seconds.
- **Fallback**:
  - LLM Gateway: Tripping primary provider (Groq) immediately routes traffic to secondary provider (Gemini).
  - Employer ATS: Tripping employer domain immediately puts the job application into `OUTCOME_UNKNOWN` or `FAILED_CONFIRMED` escalation without hammering the employer server.

### 2.2 Exponential Backoff with Jitter
All network retries calculate delay using Full Jitter to avoid synchronized thundering herd spikes:
$$\text{Delay} = \text{random}(0, \min(T_{\max}, T_{\text{base}} \times 2^{\text{attempt}}))$$
- Base delay: 500 ms, Max delay: 10,000 ms, Max retries: 3.

### 2.3 Bulkhead Isolation
- Playwright browser workers run in isolated container pools with fixed CPU/RAM limits. A browser crash or out-of-memory (OOM) error CANNOT destabilize the stateless API servers or credit ledger.
- Redis queues are partitioned by priority so background crawlers cannot starve high-priority candidate submission workflows.

### 2.4 Admission Control & Backpressure
- When PostgreSQL connection pools reach 85% capacity or BullMQ queue depth exceeds 10,000 pending jobs, API gateways return HTTP 429 / "Server Under Heavy Load — Request Queued", preventing cascading collapse.

### 2.5 Dead-Letter Queues (DLQ) & Manual Reconciliation
- Any task failing 3 consecutive attempts is moved to the DLQ (`rolevia-dlq-failed-submissions`).
- Tasks in DLQ trigger SRE alerts and require either an automated reconciliation run or human candidate review.

---

## 3. Database Idempotency & Transactional Guarantees

1. **Strict Idempotency Keys**:
   - Payments: Razorpay webhook `eventId` recorded in `ProcessedWebhookEvent`. Duplicate webhooks return HTTP 200 immediately without adding credits.
   - Applications: Atomic lock acquired via `submission_attempt_locks` with unique index `unique_candidate_active_requisition` on `(tenant_id, user_id, requisition_key)`.
2. **Never Overwrite Authoritative Records**:
   - LangGraph checkpoints and Redis cache states are ephemeral; the PostgreSQL database remains the single source of truth for all candidate applications, credit balances, and submission receipts.
3. **ACID Ledger Invariant**:
   - Credit operations execute inside `prisma.$transaction`:
     $$\text{Available} + \text{Reserved} + \text{Consumed} = \text{Total Granted}$$

---

## 4. Health, Readiness & Liveness Probes

Every service pod exposes standard Kubernetes health endpoints:
- `GET /health/liveness`: Checks process event loop responsiveness (fails if event loop lag > 500ms).
- `GET /health/readiness`: Verifies active connection to PostgreSQL primary, Redis cluster, and local memory health.
- `GET /health/deep`: Executes test query on read replicas and evaluates third-party LLM circuit breaker status.
