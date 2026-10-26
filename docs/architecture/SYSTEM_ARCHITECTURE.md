# Rolevia AI — Enterprise System Architecture Specification

**Product:** Rolevia AI ([roleviaai.co.in](https://roleviaai.co.in))  
**Architectural Baseline:** Release 0.4 Enterprise Standard  
**Target Capacity:** 1,000,000 Simultaneously Connected Users  
**Availability SLO:** 99.95% (Multi-Region / Multi-AZ Ready)  
**Primary Accent:** `#e0601e`  
**Benchmark Competitor:** Tsenta AI ([tsenta.com](https://tsenta.com))  

---

## 1. Architectural Vision & Enterprise Standards

Rolevia AI is designed as a cloud-native, horizontally scalable, multi-tenant autonomous job application and career intelligence platform. The architecture is engineered to guarantee:

1. **High Availability (99.95%)**: Zero single points of failure across all critical paths.
2. **Strict Data Protection & Multi-Tenancy**: Complete cryptographic and relational isolation across candidate accounts and corporate tenants.
3. **Factual Grounding & Anti-Hallucination**: Candidate FactStore enforcement preventing invented accomplishments, false credentials, or unapproved employer submissions.
4. **Resilient Failure Recovery**: Zero duplicate applications submitted to employers even during worker SIGKILL, network partitions, or database failover events.
5. **Horizontal Scalability to 1M Users**: Decoupled user requests from compute-intensive LLM inference and Playwright browser execution via durable queues and backpressure controls.

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
                ├─────────────────────────────────────────────────────┤
                ▼                                                     ▼
        [ Redis Cluster ]                                 [ PostgreSQL 16 Cluster ]
     (In-Memory Cache & Queues)                           (Authoritative System of Record)
  • Session Tokens & Rate Limits                          • Primary (Write / ACID Master)
  • BullMQ Task Queues                                    • Read Replicas (Search & Analytics)
  • Distributed Locks                                     • PgBouncer Connection Pooler
                │                                         • Migration Version Ledger
                ▼                                                     ▲
  ┌──────────────────────────┐                                        │
  │  Durable Job Queues      │                                        │
  │  (BullMQ + Backpressure) │                                        │
  └─────────────┬────────────┘                                        │
                │                                                     │
       ┌────────┴────────────────────────┬────────────────────────────┤
       ▼                                 ▼                            ▼
[ LangGraph AI Workers ]       [ ATS Automation Pool ]     [ Crawler & Feed Ingestion ]
(Orchestrated Workflows)       (Playwright Sandboxes)      (Ashby, Greenhouse, Lever)
• State Checkpointers          • Isolated Browser Contexts • Canonical Requisition Hasher
• Resume Fact Alignment        • Form Mapping Engine       • Health Freshness Scanner
• Multi-Model Gateway          • Database Submission Lock  • Deduplication Engine
• Structured Output Validator  • Quarantine Manager                   │
       │                                 │                            │
       ▼                                 ▼                            ▼
[ External LLM APIs ]          [ Employer ATS Portals ]    [ Company Career Portals ]
(Groq / Gemini / OpenAI)       (Greenhouse / Lever / Ashby)
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
- **LangGraph Application Graph**: Coordinates discovery, eligibility, document optimization, candidate authorization, and submission preparation.
- **Credit Accounting Service**: Manages ACID transactions, balance checks, reservation holds, commits, and releases.

### 3.3 Infrastructure Layer (`backend/db/`, `backend/ai/`, `backend/queue/`)
- Concrete technical implementations of interfaces defined by the domain layer.
- **Database**: PostgreSQL 16 via Prisma ORM and raw SQL migration engine (`migrationManager.js`).
- **AI Gateway**: `llmGateway.js` multi-model routing, token counting, and Zod schema validation.
- **Queues**: BullMQ worker pools with Redis persistence.

### 3.4 Interface & Presentation Layer (`backend/server.js`, `frontend/`)
- Exposes RESTful HTTP/JSON endpoints and Server-Sent Events (SSE).
- Authentication, CSRF protection, tenant context injection, and input validation.

---

## 4. Workload Decoupling & Bulkhead Isolation

To serve 1,000,000 simultaneously connected candidates, distinct workloads are partitioned into dedicated resource bulkheads:

| Workload Type | Concurrency Profile | Resource Bottleneck | Scaling Strategy | Failure Domain Isolation |
| :--- | :--- | :--- | :--- | :--- |
| **User Navigation & Profile** | High Concurrency (1M users, ~15k RPS) | Network I/O, Memory | Horizontal API pod autoscaling, Redis caching | Isolated from worker crashes |
| **Job Search & Feed Querying** | Read-Heavy (~8k RPS) | Database Read IOPS | PostgreSQL Read Replicas, Full-text indices | Search lag does not block submission |
| **LLM Resume Optimization** | Compute-Medium (~250 RPS) | Third-Party Provider TPM/RPM | Asynchronous BullMQ queue, rate limiters | Provider 429 does not crash app |
| **ATS Browser Automation** | Compute-Heavy (~50 concurrent browsers) | CPU & RAM (Playwright contexts) | Isolated container worker nodes with concurrency caps | Crash cannot corrupt API sessions |
| **Crawler Ingestion** | Background Batch (Hourly) | Network Egress, DB Writes | Scheduled worker cron, bulk batch inserts | Crawler errors isolated to crawler queue |

---

## 5. Non-Negotiable Reliability Invariants

1. **Zero Duplicate Applications**: Enforced via PostgreSQL unique constraint `unique_candidate_active_requisition` on `submission_attempt_locks`.
2. **Explicit Candidate Authorization**: Every application requires candidate HMAC authorization.
3. **No Secret Inventions**: Candidate claims must map to verified facts in the candidate FactStore.
4. **Credit Ledger Balance Equation**: `Available + Reserved + Consumed === Total Granted` at all times.
5. **Dry-Run Security Barrier**: Production employer submissions and payment captures remain disabled during staging validation.
