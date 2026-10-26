# Rolevia AI — Hyperscale Infrastructure Cost Model & Unit Economics

**Product:** Rolevia AI ([roleviaai.co.in](https://roleviaai.co.in))  
**Scale Horizons:** 10,000 to 1,000,000 Simultaneously Connected Users  
**Pricing Baseline:** AWS / GCP Commercial Cloud Rates + Commercial LLM Pricing (October 2026)  
**Engineering Discipline:** Cloud Financial Operations (FinOps) & Infrastructure Economics  
**Date:** October 26, 2026  

---

## 1. Unit Economics & Cost Allocation per Candidate

To build a commercially sustainable SaaS competing with Tsenta AI, infrastructure costs per active candidate must be modeled with precision:

### Per-Application Cost Breakdown:
1. **Resume Bullet Optimization (LLM)**:
   - Primary: Groq `llama-3.3-70b-versatile` ($0.59 / 1M prompt, $0.79 / 1M completion).
   - Average prompt: 3,500 tokens (Candidate profile + Job description) = $0.00206.
   - Average completion: 800 tokens (Tailored bullets + structured diff) = $0.00063.
   - **Total LLM cost per tailored application: ~$0.0027 (Under 1/3 of a cent)**.
2. **Playwright Browser Submission Worker**:
   - Container compute: 2 vCPU, 2GB RAM running for 30 seconds = $0.00042.
3. **Database & Storage I/O**:
   - PostgreSQL queries, PgBouncer, screenshot artifact storage in S3/GCS = $0.00015.
4. **Total Direct Infrastructure Cost per Application**: **~$0.0033 USD (₹0.28 INR)**.

> **Gross Margin Insight**: At a consumer price of ₹25 - ₹50 per application credit ($0.30 - $0.60 USD), Rolevia AI achieves an exceptional direct infrastructure gross margin exceeding **98%**, providing strong unit economics to support generous free trials and competitive pricing against Tsenta AI.

---

## 2. Infrastructure Cost Projection across Six Scales (Monthly)

| Infrastructure Component | 10k Scale | 50k Scale | 100k Scale | 250k Scale | 500k Scale | 1M Scale |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **API Pods (Kubernetes Compute)** | $180 | $540 | $1,125 | $2,700 | $5,400 | **$10,800** |
| **PostgreSQL Primary (Multi-AZ RDS)** | $350 | $700 | $1,400 | $2,800 | $5,600 | **$9,800** |
| **PostgreSQL Read Replicas** | $175 | $350 | $700 | $1,400 | $2,800 | **$5,600** |
| **Redis Sharded Cluster** | $120 | $240 | $480 | $960 | $1,920 | **$3,840** |
| **Playwright Worker Pool (Fargate/GKE)**| $250 | $750 | $1,500 | $3,000 | $5,000 | **$8,000** |
| **Anycast CDN & WAF (Cloudflare Ent)** | $200 | $500 | $1,000 | $2,500 | $5,000 | **$9,500** |
| **Storage & Backups (S3 / GCS Artifacts)**| $25 | $120 | $250 | $600 | $1,250 | **$2,500** |
| **Observability (OTel, Datadog/Grafana)**| $150 | $450 | $900 | $2,250 | $4,500 | **$9,000** |
| **Commercial LLM API Costs (Blended)** | $400 | $1,250 | $1,845 | $5,290 | $10,530 | **$19,460** |
| **Total Monthly Infrastructure Cost** | **$1,850** | **$4,900** | **$9,200** | **$21,500** | **$42,000** | **$78,500** |
| **Infrastructure Cost / Connected User** | **$0.185** | **$0.098** | **$0.092** | **$0.086** | **$0.084** | **$0.078 / mo** |

---

## 3. FinOps Cost Optimization Levers

1. **Groq Primary Inference Routing**:
   - Routing 80%+ of resume optimization traffic through Groq's Llama 3.3 70B ($0.59/$0.79) rather than OpenAI GPT-4o ($2.50/$10.00) reduces monthly LLM spend from $95,000 down to under $20,000 at 1M scale.
2. **Local Resume Diff Caching**:
   - If a candidate applies to 3 similar roles with identical required skills, verified tailored bullet points are cached by SHA-256 requisition signature, eliminating redundant LLM inferences entirely.
3. **Spot / Preemptible Instances for Playwright Workers**:
   - Background browser automation runs on spot container instances (saving 65-70% on compute cost). Because the state machine is durable and recoverable in PostgreSQL, unexpected node reclamation is handled gracefully by `reconcileOrphanedSubmissionLocks`.
4. **S3 Intelligent Tiering for Submission Receipts**:
   - Screenshot receipts and PDF artifacts transition to Glacier Instant Retrieval after 30 days, cutting storage costs by 68%.
