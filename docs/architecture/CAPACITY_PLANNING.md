# Rolevia AI — Hyperscale Capacity Planning & Workload Models (10k to 1M Scale)

**Product:** Rolevia AI ([roleviaai.co.in](https://roleviaai.co.in))  
**Purpose:** Concrete engineering capacity forecasts, resource sizing, and SLO boundaries across six scaling stages.  
**Target Availability:** 99.95% Monthly Uptime  
**Date:** October 26, 2026  

---

## 1. Workload Modeling Assumptions

To ground capacity forecasts in realistic candidate behavior rather than abstract numbers:

1. **User Activity Distribution at Any Given Second**:
   - **Connected / Idle**: 85% of users (Socket/SSE connected, viewing dashboard or reading job details).
   - **Active Navigation / Searching**: 12% of users (Paging jobs, filtering by experience, viewing diffs).
   - **Document Generation (AI)**: 2.5% of users (Triggering resume or cover letter tailoring).
   - **Form Application (Playwright)**: 0.5% of users (Submitting application via automated browser).
2. **Read vs. Write Ratio**: 85% reads (Job search, profile, diff view) to 15% writes (Status changes, credit journal, applications, approvals).
3. **Hardware Units**:
   - API Pods: 2 vCPU, 4GB RAM (Kubernetes pods).
   - Database Primary: High-memory PostgreSQL (AWS RDS db.r6g or GCP Cloud SQL).
   - Redis Nodes: Redis 7.2 Memory-optimized nodes.
   - Playwright Worker Pods: 2 vCPU, 2GB RAM, capped at 1 browser context per container.

---

## 2. Multi-Stage Workload Capacity Matrix

| Metric / Resource | 10k Users (Stage 1) | 50k Users (Stage 2) | 100k Users (Stage 3) | 250k Users (Stage 4) | 500k Users (Stage 5) | 1M Users (Stage 6) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Simultaneously Connected** | 10,000 | 50,000 | 100,000 | 250,000 | 500,000 | **1,000,000** |
| **Requests / Second (RPS)** | 250 RPS | 1,250 RPS | 2,500 RPS | 6,250 RPS | 12,500 RPS | **25,000 RPS** |
| **API Latency (p50)** | 25 ms | 35 ms | 45 ms | 55 ms | 65 ms | **75 ms** |
| **API Latency (p95)** | 120 ms | 150 ms | 180 ms | 220 ms | 260 ms | **295 ms (< 300ms)** |
| **API Latency (p99)** | 350 ms | 450 ms | 550 ms | 700 ms | 850 ms | **950 ms (< 1.0s)** |
| **Node.js API Pod Count** | 4 pods | 12 pods | 25 pods | 60 pods | 120 pods | **240 pods** |
| **PostgreSQL Primary Specs** | 4 vCPU / 16GB | 8 vCPU / 32GB | 16 vCPU / 64GB | 32 vCPU / 128GB | 64 vCPU / 256GB | **96 vCPU / 384GB** |
| **PostgreSQL Read Replicas** | 1 replica | 2 replicas | 2 replicas | 4 replicas | 6 replicas | **8 replicas** |
| **DB Direct Connections (PgBouncer)** | 150 | 250 | 350 | 450 | 500 | **500 (Pooled 25k)** |
| **DB CPU Utilization (Avg)** | 18% | 24% | 32% | 45% | 58% | **65%** |
| **Redis Cluster Memory / Nodes** | 8GB (3 nodes) | 16GB (3 nodes) | 32GB (6 nodes) | 64GB (6 nodes) | 128GB (9 nodes) | **256GB (12 nodes)** |
| **Redis Cache Hit Ratio** | 92% | 94% | 95% | 96% | 96.5% | **97.2%** |
| **BullMQ Queue In-Flight Depth** | 50 jobs | 250 jobs | 500 jobs | 1,250 jobs | 2,500 jobs | **5,000 jobs** |
| **Queue Processing Delay (p95)** | < 1.5s | < 2.0s | < 3.0s | < 4.5s | < 6.0s | **< 8.0s** |
| **Active Playwright Workers** | 5 workers | 15 workers | 25 workers | 50 workers | 75 workers | **100 workers (max)** |
| **LLM Inference Rate** | 2.5 req/s | 12.5 req/s | 25 req/s | 62.5 req/s | 125 req/s | **250 req/s** |
| **LLM Provider Token Cost / Day** | $18.50 | $92.50 | $185.00 | $462.50 | $925.00 | **$1,850.00** |
| **System Error Rate (5xx)** | < 0.01% | < 0.02% | < 0.03% | < 0.04% | < 0.05% | **< 0.05%** |
| **Recovery Time Objective (RTO)** | < 2 min | < 3 min | < 5 min | < 5 min | < 10 min | **< 15 min** |
| **Recovery Point Objective (RPO)** | 0 (Sync WAL) | 0 (Sync WAL) | 0 (Sync WAL) | 0 (Sync WAL) | 0 (Sync WAL) | **0 (Sync WAL)** |
| **Estimated Infrastructure Cost / Mo** | $1,850 | $4,900 | $9,200 | $21,500 | $42,000 | **$78,500** |

---

## 3. Bottleneck Analysis & Scale-Up Triggers

1. **Database Connection Saturation**:
   - *Risk*: Node.js instances attempting 10,000 direct database connections will exhaust PostgreSQL connection memory.
   - *Mitigation*: Mandatory PgBouncer transaction-pooling layer fronting all database access; direct connections limited to 500.
2. **Redis Memory Exhaustion**:
   - *Risk*: Unbounded cached search queries or job postings causing OOM eviction.
   - *Mitigation*: Strict TTLs (15 minutes for search feeds, 1 hour for job postings) with `allkeys-lru` eviction policy.
3. **Playwright Browser Compute Spike**:
   - *Risk*: Uncapped browser contexts causing CPU starvation and node crashes.
   - *Mitigation*: Global concurrency semaphore capped at 100 simultaneous browser processes cluster-wide. Remaining requests queue in BullMQ with candidate visibility.
4. **Third-Party LLM Throttling (429)**:
   - *Risk*: Provider rate limits blocking candidate resume tailoring.
   - *Mitigation*: Multi-model routing pool across Groq Cloud, Google Gemini, and OpenAI with automated circuit breakers and local caching of verified candidate facts.
