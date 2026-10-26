# Rolevia AI — Observability Architecture, Telemetry & SLO Framework

**Product:** Rolevia AI ([roleviaai.co.in](https://roleviaai.co.in))  
**Observability Standard:** OpenTelemetry (OTel) Distributed Tracing & Metrics  
**Target Availability:** 99.95% Monthly Uptime (Error Budget: 21.9 minutes/month)  
**Scale Target:** 1,000,000 Simultaneously Connected Users  
**Date:** October 26, 2026  

---

## 1. Service Level Objectives (SLOs) & Error Budgets

To ensure high availability and predictable user experience at scale, Rolevia AI establishes formal, measurable SLOs:

| Service Boundary | Service Level Indicator (SLI) | Target SLO | Monthly Error Budget | Alerting Threshold |
| :--- | :--- | :--- | :--- | :--- |
| **API Availability** | Percentage of non-5xx HTTP requests | **99.95%** | 21.9 min downtime | 2% error budget burn in 1 hour |
| **Lightweight API Latency** | Time to respond to `GET /api/v1/jobs` | **p95 < 300 ms** | 5% of requests > 300ms | p95 > 400 ms for 5 min |
| **Interactive API Latency** | Time to respond to `GET /api/v1/resumes/diff` | **p95 < 800 ms** | 5% of requests > 800ms | p95 > 1,200 ms for 5 min |
| **Application Integrity** | Duplicate confirmed employer applications | **0 (Zero)** | 0 (Zero tolerance) | **Any duplicate immediately trips SEV-1** |
| **Payment Ledger Integrity** | Unreconciled balance discrepancies | **0 (Zero)** | 0 (Zero tolerance) | **Any mismatch immediately trips SEV-1** |
| **Database Pool Health** | PgBouncer client connection queue wait time | **p99 < 50 ms** | 1% of queries > 50ms wait | Wait time > 100 ms for 3 min |
| **Queue Health** | BullMQ submission job processing delay | **p95 < 8.0s** | 5% delayed > 8.0s | Queue lag > 30s or depth > 5,000 |

---

## 2. OpenTelemetry (OTel) Distributed Tracing Architecture

Every user action carries a unique W3C trace context (`traceparent` header) propagating through all backend services:

```
[Candidate Browser]
       │
       ▼ (traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01)
[Stateless API Gateway]
  ├── Span: auth.validate_jwt (0.8 ms)
  ├── Span: tenant.enforce_isolation (0.2 ms)
  ├── Span: queue.enqueue_submission (2.1 ms)
       │
       ▼ (trace context forwarded in BullMQ job metadata)
[ATS Automation Worker]
  ├── Span: db.acquire_submission_lock (1.4 ms)
  ├── Span: browser.launch_context (180.2 ms)
  ├── Span: ats.navigate_portal (850.5 ms)
  ├── Span: ats.fill_form_fields (320.1 ms)
  ├── Span: db.record_application_event (2.2 ms)
```

### Trace Span Attributes:
- `rolevia.tenant_id`: Scoped tenant identifier.
- `rolevia.user_id`: Obfuscated candidate identifier.
- `rolevia.application_id`: Unique application lifecycle ID.
- `rolevia.requisition_hash`: Normalized requisition SHA-256 hash.
- `rolevia.ats_provider`: Detected ATS platform (`GREENHOUSE`, `ASHBY`, `LEVER`).
- `rolevia.dry_run`: Boolean indicating staging dry-run barrier state.

---

## 3. Metrics & Prometheus Instrumentations

The system exposes a Prometheus scrape endpoint (`GET /metrics` on internal port 9090):

1. **HTTP Metrics**:
   - `rolevia_http_requests_total{method, route, status, tenant}`
   - `rolevia_http_request_duration_seconds{route, le}`
2. **Database & Connection Pool Metrics**:
   - `rolevia_pg_pool_active_connections`
   - `rolevia_pg_pool_idle_connections`
   - `rolevia_pg_pool_waiting_queries`
   - `rolevia_db_query_duration_seconds{query_name, le}`
3. **Queue & Worker Metrics**:
   - `rolevia_queue_jobs_waiting{queue_name}`
   - `rolevia_queue_jobs_active{queue_name}`
   - `rolevia_queue_jobs_failed_total{queue_name}`
   - `rolevia_active_playwright_browsers`
4. **AI Gateway Metrics**:
   - `rolevia_llm_requests_total{provider, model, status}`
   - `rolevia_llm_tokens_consumed_total{provider, model, type="prompt|completion"}`
   - `rolevia_llm_latency_seconds{provider, model, le}`
   - `rolevia_llm_circuit_breaker_tripped_total{provider}`
5. **Business & Safety Metrics**:
   - `rolevia_applications_submitted_total{ats, status}`
   - `rolevia_duplicate_prevented_total`
   - `rolevia_orphaned_locks_reconciled_total`
   - `rolevia_credit_ledger_mismatches_total` (Must stay 0)

---

## 4. Structured JSON Logging Standard

Every log entry is formatted as a single-line JSON string sent to `stdout` for ingestion by Fluentbit / Datadog / Grafana Loki:

```json
{
  "timestamp": "2026-10-26T10:07:00.124Z",
  "level": "INFO",
  "service": "rolevia-api",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "tenant_id": "tenant-corp-123",
  "user_id": "user-cand-456",
  "action": "APPLICATION_SUBMISSION_ATTEMPT_LOCKED",
  "details": {
    "application_id": "app-789",
    "requisition_key": "req-hash-abc",
    "lock_status": "IN_FLIGHT",
    "execution_time_ms": 1.4
  }
}
```

> **Security Rule**: PII (candidate email, phone, physical address, full resume plaintext, credit card numbers, passwords) is strictly redacted before writing to log streams.
