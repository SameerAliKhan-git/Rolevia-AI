# Rolevia AI — Capacity Planning, Workload Modeling & Sizing Strategy (10k to 1M Scale)

**Product:** Rolevia AI ([roleviaai.co.in](https://roleviaai.co.in))  
**Purpose:** Concrete engineering capacity forecasts, resource sizing, queueing models, and SLO boundaries across six scaling stages.  
**Initial Launch Target:** 10,000 Simultaneously Connected Users (~250 RPS)  
**Target Availability:** 99.95% Monthly Uptime  
**Date:** October 26, 2026  

---

## 1. Workload Modeling Assumptions & Queueing Mathematics

To ground capacity forecasts in realistic candidate behavior rather than abstract numbers:

1. **User Activity Distribution at Any Given Second**:
   - **Connected / Idle**: 85% of users (Socket/SSE connected, viewing dashboard or reading job details).
   - **Active Navigation / Searching**: 12% of users (Paging jobs, filtering by experience, viewing diffs).
   - **Document Generation (AI)**: 2.5% of users (Triggering resume or cover letter tailoring).
   - **Form Application (Playwright)**: 0.5% of users (Submitting application via automated browser).
2. **Read vs. Write Ratio**: 85% reads (Job search, profile, diff view) to 15% writes (Status changes, credit journal, applications, approvals).
3. **Queueing Mathematics (Little's Law: $L = \lambda W$)**:
   - At **10,000 connected users**:
     - $\lambda_{ai} \approx 2.5\text{ req/s}$, average LLM inference $W_{ai} \approx 1.2\text{s} \implies L_{ai} \approx 3\text{ concurrent requests}$. Handled smoothly by multi-model gateway.
     - $\lambda_{app} \approx 0.8\text{ jobs/s}$, average browser task $W_s \approx 25 - 30\text{s} \implies L_{app} \approx 24\text{ concurrent workers}$.
     - A dedicated pool of **25 - 30 Playwright container workers** processes the 10k launch workload with near-zero queue latency ($W_q < 2\text{s}$).
   - At **1,000,000 users** (long-term horizon):
     - If a surge enqueues 5,000 applications simultaneously and Playwright workers are capped at 100 (throughput = $100 / 30\text{s} = 3.33\text{ jobs/s}$), the backlog takes approximately **25 minutes** to drain ($5,000 / 3.33 = 1,500\text{s}$).
     - The system maintains durable queue persistence in Queue Redis with candidate status feedback, preventing system overload.
4. **Hardware Units**:
   - API Pods: 2 vCPU, 4GB RAM (Node.js stateless containers).
   - Database Primary: High-memory PostgreSQL (AWS RDS db.r6g or GCP Cloud SQL).
   - Queue Redis: Memory-optimized Redis 7.2 with `noeviction` and AOF enabled (`appendonly yes`).
   - Cache Redis: Memory-optimized Redis 7.2 with `allkeys-lru` eviction policy.
   - Playwright Worker Pods: 2 vCPU, 2GB RAM, capped at 1 browser context per container sandbox.

---

## 2. Multi-Stage Workload Capacity Matrix

| Metric / Resource | 10k Users (Launch Gate) | 50k Users (Growth) | 100k Users (Expansion) | 250k Users (Scale) | 500k Users (High Scale) | 1M Users (Hyperscale Horizon) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Simultaneously Connected** | **10,000** | 50,000 | 100,000 | 250,000 | 500,000 | **1,000,000** |
| **Requests / Second (RPS)** | **250 RPS** | 1,250 RPS | 2,500 RPS | 6,250 RPS | 12,500 RPS | **25,000 RPS** |
| **API Latency (p50)** | **25 ms** | 35 ms | 45 ms | 55 ms | 65 ms | **75 ms** |
| **API Latency (p95)** | **120 ms** | 150 ms | 180 ms | 220 ms | 260 ms | **295 ms (< 300ms)** |
| **API Latency (p99)** | **350 ms** | 450 ms | 550 ms | 700 ms | 850 ms | **950 ms (< 1.0s)** |
| **Node.js API Pod Count** | **4 - 6 pods** | 12 pods | 25 pods | 60 pods | 120 pods | **240 pods** |
| **PostgreSQL Primary Specs** | **4 vCPU / 16GB** | 8 vCPU / 32GB | 16 vCPU / 64GB | 32 vCPU / 128GB | 64 vCPU / 256GB | **96 vCPU / 384GB** |
| **PostgreSQL Read Replicas** | **1 replica** | 2 replicas | 2 replicas | 4 replicas | 6 replicas | **8 replicas** |
| **DB Direct Connections (PgBouncer)** | **150 (Pooled 2.5k)**| 250 | 350 | 450 | 500 | **500 (Pooled 25k)** |
| **DB CPU Utilization (Avg)** | **15%** | 24% | 32% | 45% | 58% | **65%** |
| **Queue Redis (noeviction, AOF)** | **4GB (1 node)** | 8GB (Multi-AZ) | 16GB (Cluster) | 32GB (Cluster) | 64GB (Cluster) | **128GB (Sharded Cluster)** |
| **Cache Redis (allkeys-lru)** | **4GB (1 node)** | 8GB (Multi-AZ) | 16GB (Cluster) | 32GB (Cluster) | 64GB (Cluster) | **128GB (Sharded Cluster)** |
| **Redis Cache Hit Ratio** | **92%** | 94% | 95% | 96% | 96.5% | **97.2%** |
| **BullMQ Queue In-Flight Depth** | **25 - 50 jobs** | 250 jobs | 500 jobs | 1,250 jobs | 2,500 jobs | **5,000 jobs** |
| **Queue Processing Delay (p95)** | **< 2.0s** | < 2.5s | < 3.5s | < 4.5s | < 6.0s | **< 8.0s** |
| **Active Playwright Workers** | **25 - 30 workers** | 40 workers | 60 workers | 80 workers | 90 workers | **100 workers (max cap)** |
| **LLM Inference Rate** | **2.5 req/s** | 12.5 req/s | 25 req/s | 62.5 req/s | 125 req/s | **250 req/s** |
| **LLM Provider Token Cost / Day** | **$18.50** | $92.50 | $185.00 | $462.50 | $925.00 | **$1,850.00** |
| **System Error Rate (5xx)** | **< 0.01%** | < 0.02% | < 0.03% | < 0.04% | < 0.05% | **< 0.05%** |
| **Recovery Time Objective (RTO)** | **< 2 min** | < 3 min | < 5 min | < 5 min | < 10 min | **< 15 min** |
| **Recovery Point Objective (RPO)** | **0 (Sync WAL)** | 0 (Sync WAL) | 0 (Sync WAL) | 0 (Sync WAL) | 0 (Sync WAL) | **0 (Sync WAL)** |
| **Estimated Infrastructure Cost / Mo** | **$1,850** | $4,900 | $9,200 | $21,500 | $42,000 | **$78,500** |

---

## 3. Bottleneck Analysis & Scale-Up Triggers

1. **Database Connection Saturation**:
   - *Risk*: Node.js instances attempting direct database connections will exhaust PostgreSQL connection memory.
   - *Mitigation*: Mandatory PgBouncer transaction-pooling layer fronting all database access; direct backend connections limited to 150 at launch (500 at hyperscale).
2. **Redis Memory Exhaustion vs Queue Durability**:
   - *Risk*: Using `allkeys-lru` on BullMQ queues can corrupt delayed job ZSets and lock keys; using `noeviction` on search cache can lead to OOM crashes.
   - *Mitigation*: Physically split Redis into dedicated **Queue Redis** (`maxmemory-policy=noeviction` + AOF) and **Cache Redis** (`maxmemory-policy=allkeys-lru`).
3. **Playwright Browser Compute Spike**:
   - *Risk*: Uncapped browser contexts causing CPU starvation and node crashes.
   - *Mitigation*: Concurrency semaphore sized to 25–30 workers for 10k launch; hard cap of 100 workers at hyperscale. Excess requests queue durably in BullMQ with real-time candidate queue position updates.
4. **Third-Party LLM Throttling (429)**:
   - *Risk*: Provider rate limits blocking candidate resume tailoring.
   - *Mitigation*: Multi-model routing pool across Groq (`llama-3.3-70b-versatile`), Google Gemini (`gemini-2.5-flash`, `gemini-2.5-pro`), and OpenAI (`gpt-4o-mini`) with automated circuit breakers and local caching of verified candidate facts.
