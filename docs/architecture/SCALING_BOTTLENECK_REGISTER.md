# Rolevia AI — Hyperscale Scaling Bottleneck Register

**Product:** Rolevia AI ([roleviaai.co.in](https://roleviaai.co.in))  
**Target Scale:** 1,000,000 Simultaneously Connected Users  
**Document Purpose:** Central register of technical scaling limits, saturation thresholds, detection metrics, and mitigation playbooks.  
**Date:** October 26, 2026  

---

## Bottleneck Summary Register

| ID | Component | Scaling Limit / Saturation Point | Detection Metric | Impact if Ignored | Mitigation Strategy & Architecture |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BTN-001** | **PostgreSQL Connection Pool** | ~500 direct backend connections max before memory exhaustion | `rolevia_pg_pool_active_connections` > 400 | Connection timeouts, cascading API 500 errors | PgBouncer in transaction mode fronting primary & replicas; max 500 DB connections handling up to 50k client requests |
| **BTN-002** | **PostgreSQL Read IOPS** | 80,000 IOPS on single database primary instance | Read latency > 25ms, Disk queue depth > 10 | Search and dashboard degradation | Read-replicas (up to 8 replicas) for job search queries; Redis 15-minute search cache |
| **BTN-003** | **Node.js Single-Threaded Event Loop** | Event loop delay > 100ms under CPU-intensive PDF parsing or crypto | `nodejs_eventloop_lag_seconds` > 0.05 | High p99 API latency, dropped HTTP requests | Offload PDF parsing, hash diffing, and token counting to worker threads or asynchronous worker pods |
| **BTN-004** | **Playwright Browser Compute** | Bounded concurrency (25-30 workers at 10k launch; 100 workers at hyperscale). At 30s service time, a 5,000-job surge takes ~25 min to drain | Active browser worker count, BullMQ queue backlog depth | Extended queue waiting times if arrival rate surges unchecked | Dedicated worker container pool with admission backpressure; candidate UI displays transparent queue position and estimated completion time |
| **BTN-005** | **Redis Queue vs Cache Memory** | Durable queue Redis memory exhaustion or eviction corruption | `redis_used_memory_bytes` > 80% on Queue Redis | Dropped jobs, corrupted delay sets, or broken locks if eviction is enabled | Strict infrastructure separation: Queue Redis deployed with `maxmemory-policy=noeviction` + AOF persistence; Cache Redis deployed independently with `allkeys-lru`; bulky artifacts stored in S3/GCS |
| **BTN-006** | **Third-Party LLM Provider Quotas** | Groq / Gemini / OpenAI RPM (Requests/min) & TPM (Tokens/min) limits | HTTP 429 responses from provider API | Job optimization stalled for candidates | Multi-model fallback pool (Groq -> Gemini -> OpenAI); token bucket rate limiters; circuit breakers |
| **BTN-007** | **Persistent Real-Time SSE Connections** | File descriptor / socket limits on single host (65,535 sockets) | `rolevia_active_sse_connections` > 40,000 / pod | Socket drops, missed real-time notifications | Horizontal SSE gateway pods behind Envoy load balancer; Redis Pub/Sub cluster backplane |
| **BTN-008** | **Database Table Growth (`ApplicationEvent`)** | Table size exceeding 500M rows (> 100GB) causing slow index updates | Table size metrics, Vacuum duration | Slower write throughput on application events | Range partitioning by calendar quarter; automated cold archive of records > 1 year old to parquet data lake |
