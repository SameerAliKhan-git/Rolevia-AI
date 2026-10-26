# Rolevia AI — Scalability Architecture & Progressive Scaling Strategy (10k to 1M Users)

**Product:** Rolevia AI ([roleviaai.co.in](https://roleviaai.co.in))  
**Initial Launch Target:** 10,000 Simultaneously Connected Users (~250 RPS)  
**Progressive Scaling Roadmap:** 10k (Launch) → 50k (Growth) → 100k (Expansion) → 250k → 500k → 1,000,000 (Hyperscale Horizon)  
**System Concurrency Model:** Stateless Modular Monolith + Decoupled Asynchronous Worker Pools  
**Core Architectural Directive:** "Build for 10,000 users today, design for one million tomorrow, and pay for additional capacity only when measured demand justifies it."  
**Date:** October 26, 2026  

---

## 1. Executive Summary & Distinction of Workload Dimensions

Building an architecture to serve **10,000 simultaneously connected candidates at launch**—while preserving an incremental engineering path to **1,000,000 users**—requires a strict mathematical distinction between different types of concurrency:

| Concurrency Dimension | 10k Launch Baseline | 1M Long-Term Horizon | Resource Profile | Technology Stack |
| :--- | :--- | :--- | :--- | :--- |
| **Simultaneously Connected Users** | 10,000 users | 1,000,000 users | Low-footprint network sockets, TLS sessions | Anycast CDN, Cloud Load Balancer, SSE Gateway |
| **Active Requests Per Second (RPS)** | ~250 RPS | 15,000 - 25,000 RPS | CPU, Event Loop, I/O bandwidth | Stateless Node.js API cluster (4-6 pods @ 10k; 120+ @ 1M) |
| **Simultaneous Job Searches** | ~100 queries/sec | 5,000 - 8,000 queries/sec | Database read IOPS, query cache | PostgreSQL Read Replicas + Cache Redis (`allkeys-lru`) |
| **Queued AI Workflows** | 20 - 50 jobs in flight | 2,000 - 5,000 jobs in flight | Redis queue memory, worker state | BullMQ + Queue Redis (`noeviction`, AOF) |
| **Active LLM Inferences** | 2.5 - 5 req/s ($\lambda_{ai}$) | 200 - 500 req/s | External provider RPM/TPM quotas | Asynchronous LLM Gateway (`llmGateway.js`) with fallback |
| **Active Browser Automation (Playwright)**| 20 - 30 concurrent workers | 100 concurrent workers (max cap) | High CPU (2 vCPU), High RAM (2GB/pod) | Isolated, autoscaled headless browser runner pool |

### Workload Queueing Mathematics (Little's Law: $L = \lambda W$):
- **10k Launch Scale**:
  - Application submission arrival rate: $\lambda_{app} \approx 0.5 - 1.0\text{ jobs/s}$.
  - Average browser task duration: $W_s \approx 25 - 30\text{ seconds}$.
  - Concurrent in-flight workers required: $L = \lambda W = (0.8\text{ jobs/s}) \times 30\text{s} = 24\text{ concurrent workers}$.
  - Sizing a pool of **25 - 30 Playwright workers** handles the entire 10k user baseline with near-zero queue wait times ($W_q < 2\text{s}$).
- **1M Hyperscale Surge Analysis**:
  - If a flash traffic surge enqueues 5,000 applications simultaneously and Playwright workers are capped at 100 (throughput = $100 / 30\text{s} = 3.33\text{ jobs/s}$), the backlog will take approximately **25 minutes** to drain ($5,000 / 3.33 = 1,500\text{s}$).
  - This is completely safe and cost-effective, provided jobs are queued durably in BullMQ, candidates receive live SSE queue status updates, and no duplicate submissions occur.

---

## 2. Multi-Tier Progressive Scaling Strategy

### 2.1 Layer 1: Global Edge & CDN (Cloudflare)
- **Static Assets & SPA**: HTML, CSS, JavaScript bundles, SVG logos, and fonts cached at edge PoPs globally with cache headers (`stale-while-revalidate`).
- **TLS Termination & HTTP/3**: Edge termination reduces TCP handshake latency; WebSocket/SSE connection multiplexing.
- **WAF & Rate Limiting**: Edge rules block scrapers, brute-force auth attacks, and volumetric DDoS before hitting API origin servers.

### 2.2 Layer 2: Stateless API Service Cluster
- **Stateless Modular Monolith**: Core REST APIs run in stateless Node.js containers. At launch, 4–6 pods (2 vCPU, 4GB RAM) comfortably handle 250 RPS at < 25% CPU utilization.
- **Horizontal Scaling**: Scales automatically via Horizontal Pod Autoscaler (HPA) or AWS ECS Target Tracking based on CPU utilization (65%) and request queue depth.
- **Event Loop Protection**: Expensive operations (PDF parsing, crypto hashing, token counting) run in background worker threads or worker services, keeping the main HTTP event loop lag < 10ms.

### 2.3 Layer 3: Connection Multiplexing & Redis Infrastructure Split
To comply with official BullMQ production requirements and prevent queue data loss:
- **Dedicated Queue Redis 7.2** (`maxmemory-policy=noeviction`, `appendonly yes`):
  - Strictly dedicated to BullMQ job queues, delayed job ZSets, and distributed locks.
  - Zero arbitrary key eviction: Redis returns an error rather than silently evicting queue keys or lock state.
- **Dedicated Cache Redis 7.2** (`maxmemory-policy=allkeys-lru`):
  - Used for job search results, filter facets, user session tokens, and rate limit counters.
  - Keys have strict TTLs (15 min for search, 1 hr for job feeds) and can be safely evicted under memory pressure.
- **Real-Time SSE Gateway**: Maintains persistent candidate SSE connections, pushing live updates (`JOB_MATCHED`, `OPTIMIZATION_READY`, `ACTION_REQUIRED`) with ~4KB memory footprint per socket.

### 2.4 Layer 4: PostgreSQL High-Reliability Data Tier
- **PgBouncer Connection Pooling**:
  - Direct connection limit: PostgreSQL configured for 150 direct backend connections at launch (scaling to 500 at hyperscale).
  - PgBouncer deployed in transaction-pooling mode fronting primary and replicas, supporting up to 5,000 client connections at launch with zero connection exhaustion errors.
- **Read/Write Splitting**:
  - Primary (Multi-AZ): Handles transactional writes (`User`, `Application`, `CreditJournal`, `submission_attempt_locks`).
  - Read Replica (1 at launch, scaling to 4-8 at hyperscale): Serves read-heavy operations (`Job` discovery, search queries, dashboard stats).
- **Authoritative Forward-Only Migrations**:
  - Prisma Migrate is the sole authoritative production migration mechanism.
  - Schema changes in production are strictly forward-only and additive (`ALTER TABLE ... ADD COLUMN`). Destructive drops are prohibited.

### 2.5 Layer 5: Durable Worker Queues & Backpressure (BullMQ)
- **Admission Control**: When queue depth exceeds safe thresholds, the system signals backpressure, returning HTTP 429 or "Queued for Processing" states.
- **Workload Prioritization**:
  - Priority 1: Candidate manual actions (Approval review, document editing).
  - Priority 2: In-flight ATS submissions awaiting confirmation.
  - Priority 3: Asynchronous resume bullet optimization.
  - Priority 4: Background job crawler ingestion.

### 2.6 Layer 6: Isolated Playwright Browser Worker Pool
- **Containerized Sandboxes**: Playwright workers run in ephemeral container environments with hard resource limits (`2 vCPU`, `2GB RAM`, `shm-size=1gb`).
- **Bounded Concurrency**: Sized to 25–30 workers for 10k launch; hard cap of 100 workers cluster-wide at hyperscale.
- **SIGKILL & Crash Recovery**: If a worker crashes mid-submission, `reconcileOrphanedSubmissionLocks` transitions the lock to `ORPHANED_QUARANTINED`, moves the application to `OUTCOME_UNKNOWN`, and alerts the candidate without any duplicate employer submission.

---

## 3. Scalability Verification Milestones

| Stage | Target Scale | Target RPS | API p95 Latency | Database CPU | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Milestone 1 (Initial Launch Target)** | **10,000 Users** | **250 RPS** | **< 180 ms** | **< 20%** | **Current Release 0.4 Acceptance Gate** |
| **Milestone 2 (Growth)** | 50,000 Users | 1,250 RPS | < 220 ms | < 30% | On-Demand Expansion |
| **Milestone 3 (Expansion)** | 100,000 Users | 2,500 RPS | < 250 ms | < 40% | On-Demand Expansion |
| **Milestone 4 (Scale)** | 250,000 Users | 6,250 RPS | < 280 ms | < 50% | On-Demand Expansion |
| **Milestone 5 (High Scale)** | 500,000 Users | 12,500 RPS | < 300 ms | < 60% | On-Demand Expansion |
| **Milestone 6 (Hyperscale Horizon)** | 1,000,000 Users | 25,000 RPS | < 300 ms | < 70% | Long-Term Target |

*Note: Rolevia AI will be deployed and validated for 10,000 concurrent users at launch. Higher capacity stages will be activated only when validated by real user growth and empirical load testing.*

