# Rolevia AI — Enterprise System Architecture Specification

**Product:** Rolevia AI ([roleviaai.co.in](https://roleviaai.co.in))  
**Architectural Baseline:** Release 0.4 Enterprise Standard  
**Initial Production Target:** 10,000 Simultaneously Connected Users (~250 RPS)  
**Long-Term Scaling Horizon:** Progressive Scaling Path: 10k → 50k → 100k → 250k → 500k → 1,000,000 Users  
**Availability SLO:** 99.95% Monthly Uptime (Single-Region Multi-AZ Launch, Multi-Region Ready)  
**Primary Accent:** `#e0601e`  
**Benchmark Competitor:** Tsenta AI ([tsenta.com](https://tsenta.com))  

---

## 1. Architectural Vision & Revised Scalability Strategy

Rolevia AI is designed as a cloud-native, horizontally scalable, multi-tenant autonomous job application and career intelligence platform. Rather than prematurely deploying expensive hyperscale infrastructure (such as multi-region Kubernetes clusters or excessive database replicas) prior to product-market fit, Rolevia AI adheres to a strict engineering principle:

> **"Build for 10,000 users today, design for one million tomorrow, and pay for additional capacity only when measured demand justifies it."**

The architecture guarantees:

1. **High Availability (99.95% SLO)**: Zero single points of failure across critical database, cache, and API paths in Multi-AZ deployment.
2. **Stateless Modular Monolith**: Core API logic runs in stateless Node.js containers that scale horizontally behind a load balancer. Heavy AI reasoning and browser automation are strictly decoupled into independent asynchronous worker pools.
3. **Strict Data Protection & Multi-Tenancy**: Complete cryptographic and relational isolation across candidate accounts and corporate tenants.
4. **Factual Grounding & Anti-Hallucination**: Candidate FactStore enforcement preventing invented accomplishments, false credentials, or unapproved employer submissions.
5. **Submission Idempotency & Ambiguity Quarantine**: At-most-one internally authorized in-flight attempt per candidate/requisition enforced by PostgreSQL unique constraints. Ambiguous outcomes (worker SIGKILL, network partitions) are quarantined in `OUTCOME_UNKNOWN` and reconciled, preventing duplicate employer submissions.
6. **Infrastructure Failure-Domain Isolation**: Strict physical separation between durable queue persistence (BullMQ) and disposable cache infrastructure.

---

## 2. High-Level System Architecture Diagram

```
                              [ CDN & Global Anycast DNS ]
                               (Cloudflare / Fastly CDN)
                                           │
                                           ▼
                            [ Web Application Firewall (WAF) ]
                            [ Cloud Load Balancer (Envoy/ALB) ]
                                           │
                ┌──────────────────────────┴──────────────────────────┐
                ▼                                                     ▼
     [ Stateless API Cluster ]                             [ Real-Time SSE Gateway ]
  (Node.js / Express Instances)                          (Connection State Multiplexer)
  • Auth & Session Security                              • Job Ingestion Notifications
  • Tenant Authorization Middleware                      • ATS Application State Sync
  • Job Search & Feed Querying                           • Approval Escalation Alerts
  • FactStore Verification APIs                                       │
                │                                                     │
        ┌───────┴─────────────────────────────┬───────────────────────┤
        ▼                                     ▼                       ▼
 [ Cache Redis 7.2 ]                  [ Queue Redis 7.2 ]     [ PostgreSQL 16 Cluster ]
 (maxmemory: allkeys-lru)             (maxmemory: noeviction) (Authoritative Source of Record)
 • Search Query Cache                 • BullMQ Job Queues     • Primary (Write / ACID Master)
 • Feed Pagination Cache              • Delayed Job ZSets     • Read Replica (Search & Analytics)
 • Disposable Session Blacklist       • AOF Persistence (1s)  • PgBouncer Connection Pooler
                                              │               • Authoritative Prisma Migrations
                                              ▼                               ▲
                                ┌──────────────────────────┐                  │
                                │  Durable Job Queues      │                  │
                                │  (BullMQ + Backpressure) │                  │
                                └─────────────┬────────────┘                  │
                                              │                               │
       ┌──────────────────────────────────────┴───┬───────────────────────────┤
       ▼                                          ▼                           ▼
[ LangGraph AI Workers ]                [ ATS Automation Pool ]     [ Crawler & Feed Ingestion ]
(Orchestrated Workflows)                (Playwright Sandboxes)      (Ashby, Greenhouse, Lever)
• State Checkpointers (Postgres)        • Isolated Browser Contexts • Canonical Requisition Hasher
• Resume Fact Alignment                 • Form Mapping Engine       • Health Freshness Scanner
• Multi-Model Gateway (Groq/Gemini 2.5) • Database Submission Lock  • Deduplication Engine
• Structured Output Validator           • Quarantine Manager                   │
       │                                          │                            │
       ▼                                          ▼                            ▼
[ External LLM APIs ]                   [ Employer ATS Portals ]    [ Company Career Portals ]
(Groq / Gemini 2.5 / OpenAI)            (Greenhouse / Lever / Ashby)
```

---

## 3. Clean Architecture & Separation of Concerns

Rolevia AI enforces clean architecture boundaries to ensure code maintainability, testability, and decoupling from external vendors:

### 3.1 Domain Layer (`backend/domain/`)
- Pure business logic, entity models, and domain invariants.
- **Entities**: Candidate, ResumeFactStore, JobRequisition, ApplicationWorkflow, CreditLedger.
- Zero dependencies on frameworks, databases, or third-party SDKs.

### 3.2 Application / Use Case Layer (`backend/workflows/`, `backend/services/`)
- Orchestrates business workflows across domain entities.
- **LangGraph Application Graph** (`backend/workflows/applicationGraph.js`): Coordinates discovery, eligibility, document optimization, candidate authorization, and submission preparation.
- **Durable Checkpointing** (`backend/workflows/postgresCheckpointer.js`): Persists multi-step state graph transitions into PostgreSQL.
- **Credit Accounting Service** (`backend/billing.js`): Manages ACID transactions, balance checks, reservation holds, commits, and releases.

### 3.3 Infrastructure Layer (`backend/db/`, `backend/ai/`, `backend/queue/`)
- Concrete technical implementations of interfaces defined by the domain layer.
- **Database**: PostgreSQL 16 via Prisma ORM (`prisma/schema.prisma`) as single authoritative migration authority. Forward-only additive schema changes in production.
- **AI Gateway** (`backend/ai/llmGateway.js`): Multi-model routing pool across Groq (`llama-3.3-70b-versatile`), Google Gemini (`gemini-2.5-flash`, `gemini-2.5-pro`), and OpenAI (`gpt-4o-mini`).
- **Queues & Isolation**: BullMQ worker pools running against dedicated Queue Redis (`noeviction` + AOF), decoupled from Cache Redis (`allkeys-lru`).

### 3.4 Interface & Presentation Layer (`backend/server.js`, `frontend/`)
- Exposes RESTful HTTP/JSON endpoints and Server-Sent Events (SSE).
- Authentication, CSRF protection, tenant context injection, and input validation.

---

## 4. Workload Decoupling & Bulkhead Sizing

Workloads are strictly partitioned into dedicated bulkheads sized for the **10,000 user launch**, with documented headroom to scale toward 1,000,000 users:

| Workload Type | 10k Launch Profile | 1M Long-Term Horizon | Resource Bottleneck | Scaling Strategy | Failure Domain Isolation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **User Navigation & Profile** | ~250 RPS | ~25,000 RPS | Network I/O, Event Loop | Horizontal API pod autoscaling, Cache Redis | Isolated from worker crashes |
| **Job Search & Feed Querying** | ~100 RPS | ~8,000 RPS | Database Read IOPS | PostgreSQL Read Replicas, Full-text indices | Search lag does not block submission |
| **LLM Resume Optimization** | ~2.5 req/s ($\lambda_{ai}$) | ~250 req/s | Provider TPM/RPM Limits | Asynchronous BullMQ queue, provider pooling | Provider 429 does not crash app |
| **ATS Browser Automation** | ~0.5 - 1.0 jobs/s ($\lambda_{app}$) | ~100 concurrent workers | CPU & RAM (Playwright) | Isolated container worker pool (25-30 workers @ 10k) | Worker SIGKILL cannot corrupt API |
| **Crawler Ingestion** | Background Batch (Hourly) | Continuous Stream | Network Egress, DB Writes | Scheduled worker cron, bulk batch inserts | Crawler errors isolated to crawler queue |

---

## 5. Non-Negotiable Reliability Invariants

1. **At-Most-One Internal In-Flight Execution**: Enforced via PostgreSQL unique constraint `unique_candidate_active_requisition` on `submission_attempt_locks`.
2. **Ambiguous Outcome Quarantine**: Unverifiable submissions transition to `OUTCOME_UNKNOWN` without duplicate re-submission.
3. **Explicit Candidate Authorization**: Every application requires candidate HMAC authorization. Approval of resume content is distinct from authorization to submit an employer application.
4. **No Secret Inventions**: Every material generated claim must map to verified facts in the candidate FactStore.
5. **Credit Ledger Balance Invariant**: `Available + Reserved + Consumed === Total Granted` at all times.
6. **Forward-Only Additive Migrations**: Production schema management strictly uses forward-only migrations managed via Prisma Migrate. Destructive drop operations in production are prohibited.
7. **Dry-Run Security Barrier**: Production employer submissions and payment captures remain disabled during staging validation.

