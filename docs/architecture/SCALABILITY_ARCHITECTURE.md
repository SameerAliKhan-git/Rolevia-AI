# Rolevia AI — Hyperscale Scalability Architecture (1M Concurrent Users)

**Product:** Rolevia AI ([roleviaai.co.in](https://roleviaai.co.in))  
**Target Workload:** 1,000,000 Simultaneously Connected Users  
**System Concurrency Model:** Multi-Tier Asynchronous Bulkhead Architecture  
**Engineering Directive:** Zero Single-Process Bottlenecks, Bounded Resource Pools, Distributed Resiliency  
**Date:** October 26, 2026  

---

## 1. Executive Summary & Distinction of Workload Dimensions

Building an architecture to support **1,000,000 simultaneously connected users** requires a clear, non-negotiable architectural distinction between different types of concurrency:

| Concurrency Dimension | Peak Volume at 1M Scale | Resource Profile | Technology Stack |
| :--- | :--- | :--- | :--- |
| **Simultaneously Connected Users** | 1,000,000 users | Low-footprint network sockets, TLS sessions | Anycast CDN, Envoy Load Balancer, SSE Gateway |
| **Active Requests Per Second (RPS)** | 15,000 - 25,000 RPS | CPU, Event Loop, I/O bandwidth | Stateless Node.js API cluster (100-150 pods) |
| **Simultaneous Job Searches** | 5,000 queries/sec | Database read throughput, query cache | PostgreSQL Read Replicas + Redis query cache |
| **Queued AI Workflows** | 2,000 - 5,000 jobs in flight | Redis queue memory, worker state | BullMQ + Redis Cluster with priority scheduling |
| **Active LLM Inferences** | 200 - 500 concurrent prompts | External provider RPM/TPM quotas | Asynchronous LLM Gateway with provider pooling |
| **Active Browser Automation (Playwright)** | 50 - 100 concurrent workers | High CPU (2 vCPU/worker), High RAM (2GB/pod) | Isolated, autoscaled headless browser runner pool |

**Critical Architectural Invariant**: Never attempt to run 1,000,000 simultaneous headless browser sessions or synchronous LLM calls. The system decouples candidate connectivity from automation tasks via durable message queues and admission control.

---

## 2. Multi-Tier Scaling Strategy

### 2.1 Layer 1: Global Edge & CDN (Cloudflare / Fastly)
- **Static Assets & SPA**: HTML, CSS, JavaScript bundles, SVG logos, and fonts cached at edge points of presence (PoPs) globally with aggressive cache headers (`stale-while-revalidate`).
- **TLS Termination & HTTP/3**: Edge termination reduces TCP handshake overhead; WebSocket/SSE connection multiplexing.
- **DDoS & Rate Limiting**: WAF rules block bot scrapers, brute-force auth attempts, and volumetric network attacks before hitting origin servers.

### 2.2 Layer 2: Stateless API Service Cluster
- **Horizontal Pod Autoscaling (HPA)**: Kubernetes cluster automatically scales Node.js API pods based on target CPU utilization (65%) and request queue depth.
- **Zero Shared Memory**: Pods store zero session state in local memory. JWT tokens are verified statelessly via cryptographic public keys; session revocations are verified against Redis with a sub-millisecond cache lookup.
- **Event Loop Protection**: Expensive CPU operations (PDF parsing, token counting, cryptographic hashing) are offloaded to background worker threads or worker services so the main HTTP event loop never blocks.

### 2.3 Layer 3: Connection Multiplexing & Redis Backplane
- **Redis Cluster**: Sharded Redis 7.2 cluster with sentinel failover.
  - Shard 1-2: Rate limits, distributed locks, session blacklist.
  - Shard 3-4: BullMQ queues and delayed jobs.
  - Shard 5-6: Real-time SSE event publishing and user notifications.
- **Real-Time SSE Gateway**: A dedicated lightweight Go or Node.js cluster maintains persistent candidate SSE connections, consuming candidate-specific events from Redis Pub/Sub and pushing live updates (e.g. `JOB_MATCHED`, `OPTIMIZATION_READY`, `ACTION_REQUIRED`) with minimal memory footprint (~4KB per connected socket).

### 2.4 Layer 4: PostgreSQL Hyperscale Data Tier
- **Connection Pooling via PgBouncer**:
  - Direct connection limit: PostgreSQL configured for 500 backend connections.
  - PgBouncer deployed in transaction-pooling mode fronting the primary and replicas, supporting up to 50,000 client connections with zero connection exhaustion errors.
- **Read/Write Splitting**:
  - Primary Instance (Multi-AZ): Handles transactional writes (`User`, `Application`, `CreditJournal`, `SubmissionAttemptLock`).
  - Read Replicas (2-4 instances): Serve read-heavy operations (`Job` discovery, filter queries, dashboard stats).
- **Partitioning & Pruning**:
  - `submission_attempt_locks`: Partitioned by month or hash-partitioned by `tenant_id`.
  - `ApplicationEvent`: Range partitioned by quarter; historical records (> 1 year) archived to cold storage (S3/GCS parquet).

### 2.5 Layer 5: Durable Worker Queues & Backpressure (BullMQ)
- **Admission Control**: When queue depth exceeds safe worker capacity (e.g. > 10,000 pending ATS submissions), the system signals backpressure to the API layer, rejecting or queuing non-essential requests gracefully with HTTP 429 / "Queued for Processing" states.
- **Workload Prioritization**:
  - Priority 1: Candidate manual actions (Approval review, document editing).
  - Priority 2: In-flight ATS submissions awaiting confirmation.
  - Priority 3: Asynchronous resume bullet optimization.
  - Priority 4: Background job crawler ingestion.

### 2.6 Layer 6: Isolated Playwright Browser Worker Pool
- **Containerized Sandboxes**: Playwright workers run in ephemeral container environments with hard resource limits (`2 vCPU`, `2GB RAM`, `shm-size=1gb`).
- **Max Concurrency Limit**: Bounded to a maximum of 100 simultaneous browser processes cluster-wide.
- **SIGKILL & Crash Recovery**: If a worker crashes mid-submission, the lock transitions to `ORPHANED_QUARANTINED` via `reconcileOrphanedSubmissionLocks`, the application moves to `OUTCOME_UNKNOWN`, and the candidate is notified without any duplicate employer submission.

---

## 3. Scalability Verification Milestones

| Stage | Concurrent Connected Users | Target RPS | API p95 Latency | Database CPU | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Milestone A** | 10,000 | 250 RPS | < 180 ms | < 25% | **Scheduled R0.4** |
| **Milestone B** | 50,000 | 1,250 RPS | < 220 ms | < 35% | **Scheduled R0.4** |
| **Milestone C** | 100,000 | 2,500 RPS | < 250 ms | < 45% | **Scheduled R0.5** |
| **Milestone D** | 250,000 | 6,250 RPS | < 280 ms | < 55% | **Scheduled R0.5** |
| **Milestone E** | 500,000 | 12,500 RPS | < 300 ms | < 65% | **Scheduled R1.0** |
| **Milestone F** | 1,000,000 | 25,000 RPS | < 300 ms | < 70% | **Production Target** |

*Note: Rolevia AI will not be marketed as supporting 1,000,000 concurrent users until Milestone F is validated via reproducible k6/Locust load tests.*
