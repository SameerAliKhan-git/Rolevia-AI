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
| **BTN-004** | **Playwright Browser Compute** | ~100 concurrent headless browser contexts per cluster node before CPU/RAM thrashing | Node CPU > 85%, RAM > 90% | Container OOM kills, stuck form filling | Dedicated Fargate / GKE node pool with hard concurrency semaphore (capped at 100 concurrent browsers cluster-wide); excess jobs queued in BullMQ |
| **BTN-005** | **Redis Queue & Cache Memory** | Available RAM (e.g. 64GB / node) exhausted by job payloads or cached diffs | `redis_used_memory_bytes` > 80% | Out-of-memory key evictions, dropped jobs | Store bulky artifacts (PDFs, screenshots) in S3/GCS; Redis stores only lightweight references and metadata; `allkeys-lru` eviction policy |
| **BTN-006** | **Third-Party LLM Provider Quotas** | Groq / Gemini / OpenAI RPM (Requests/min) & TPM (Tokens/min) limits | HTTP 429 responses from provider API | Job optimization stalled for candidates | Multi-model fallback pool (Groq -> Gemini -> OpenAI); token bucket rate limiters; circuit breakers |
| **BTN-007** | **Persistent Real-Time SSE Connections** | File descriptor / socket limits on single host (65,535 sockets) | `rolevia_active_sse_connections` > 40,000 / pod | Socket drops, missed real-time notifications | Horizontal SSE gateway pods behind Envoy load balancer; Redis Pub/Sub cluster backplane |
| **BTN-008** | **Database Table Growth (`ApplicationEvent`)** | Table size exceeding 500M rows (> 100GB) causing slow index updates | Table size metrics, Vacuum duration | Slower write throughput on application events | Range partitioning by calendar quarter; automated cold archive of records > 1 year old to parquet data lake |
