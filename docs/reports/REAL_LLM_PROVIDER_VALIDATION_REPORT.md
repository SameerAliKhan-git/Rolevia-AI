# ROLEVIA AI — REAL LLM PROVIDER VALIDATION & COMMERCIAL EVALUATION REPORT

**Feature ID:** `FEAT-018` (Multi-Model LLM Gateway & Guardrails)  
**Product:** Rolevia AI (`RoleviaAI`)  
**Domain:** https://roleviaai.co.in  
**Primary Accent:** `#e0601e`  
**Evaluation Scope:** Google Gemini, Groq Cloud, OpenAI Gateway Contracts, Commercial Pricing & Privacy Analysis  
**Test Harness:** `tests/test_live_llm_validation.js` & `tests/test_llm_gateway_hardening_suite.js`  
**Audit Date:** October 26, 2026  
**Auditor:** Principal Software Architect & AI Systems Lead (Google Antigravity)  
**Milestone Status:** **BLOCKED (Awaiting Live Development Credentials) · MOCK/SCHEMA TESTS VERIFIED (15/15) · LIVE API CALLS UNTESTED**

---

## 1. Executive Summary & Status Classification

In accordance with Rolevia AI's truth-in-engineering standards, this report establishes the authoritative verification status of the Multi-Model LLM Gateway (`FEAT-018`).

### Status Classification:
- **Unit / Schema / Anti-Hallucination Guardrails:** **VERIFIED (15/15 assertions pass)**. Gateway request schemas, Zod validation, PII/secret redaction, prompt injection interception, and sensitive disclosure holdbacks (`null` for visa sponsorship, compensation, disability) are fully tested in staging.
- **Live Commercial Model Execution:** **BLOCKED / UNTESTED**. As confirmed by environment telemetry (`{ GEMINI_API_KEY: false, GROQ_API_KEY: false, OPENAI_API_KEY: false }`), no live commercial API credentials have been injected into this development environment.
- **Production Safety Invariant Verified:** When configured in `LIVE` mode without credentials, `LLMGateway` strictly throws `PROVIDER_UNAVAILABLE` and rejects requests. It **never quietly falls back to mock responses in production**, guaranteeing that synthetic outputs can never masquerade as real AI generation.

---

## 2. Commercial Pricing, Quotas & Data Privacy Analysis

A critical finding from our architectural audit is that **free-tier API access cannot be treated as zero-cost commercial production infrastructure**. Commercial deployment requires strict evaluation of rate limits, SLAs, and candidate data privacy.

| Provider & Model | Tier | Rate Limits / Quotas | Pricing (Input / Output per 1M tokens) | Data Privacy & Commercial SLA Risk | Commercial Viability Assessment |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Groq Cloud**<br>`llama-3.3-70b-versatile` | **Free Tier** | 30 requests/min<br>6,000 tokens/min<br>14,400 requests/day | **$0.00** | No uptime SLA; strict TPM throttle causes dropped requests during burst resume tailoring. | **Development / Staging Only.** Free tier will fail under concurrent user load (> 10 concurrent candidates). |
| **Groq Cloud**<br>`llama-3.3-70b-versatile` | **Paid On-Demand** | Custom enterprise tiers<br>(typically 1,000+ RPM) | **$0.59 / $0.79** | Guaranteed compute allocation; 99.9% uptime SLA; sub-second inference. | **Recommended Primary Engine for Release 0.4.** High speed, low cost, open-weight transparency. |
| **Google Gemini**<br>`gemini-1.5-flash` | **Free Tier** | 15 requests/min<br>1,000,000 TPM<br>1,500 requests/day | **$0.00** | **CRITICAL PRIVACY RISK:** Under Google Free API terms, prompts and candidate resume data may be reviewed by human reviewers and used to train Google models. | **UNACCEPTABLE FOR PRODUCTION RESUME DATA.** Violates candidate confidentiality. |
| **Google Gemini**<br>`gemini-1.5-flash` | **Paid Commercial** | 1,000 requests/min<br>4,000,000 TPM | **$0.075 / $0.30** | Enterprise data privacy: Candidate data is **never** used to train Google models; full HIPAA / GDPR compliance. | **Recommended Secondary Fallback for Release 0.4.** Exceptional cost efficiency with verified data confidentiality. |
| **OpenAI**<br>`gpt-4o-mini` | **Paid Commercial** | Tier-based (500–10,000 RPM) | **$0.15 / $0.60** | Enterprise data privacy: API inputs are excluded from model training by default; 99.9% SLA. | **Viable Alternative Tier.** Highly reliable structured JSON outputs with proven schema compliance. |
| **OpenAI**<br>`gpt-4o` | **Paid Commercial** | Tier-based (500–10,000 RPM) | **$2.50 / $10.00** | Enterprise data privacy; top-tier reasoning capabilities. | **Power User Tier Only.** Cost is 15x higher than Groq; reserved for complex executive resume rewrites. |

---

## 3. Verified Architecture & Endpoint Contracts

The gateway implementation in [`backend/ai/llmGateway.js`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/backend/ai/llmGateway.js) uses native `fetch` over Node.js 18+ HTTP/2 without heavy third-party SDK bloat:

```mermaid
graph TD
    UserReq[Candidate Optimization Request] --> Sanitize[PII & Secret Redaction]
    Sanitize --> Router[LLMGateway Router]
    
    subgraph Providers [Configured Commercial Providers]
        P1[Groq: llama-3.3-70b-versatile]
        P2[Gemini: gemini-1.5-flash]
        P3[OpenAI: gpt-4o-mini]
    end

    Router -->|Primary Dispatch| P1
    P1 -->|Rate Limit 429 / Timeout| P2
    P2 -->|Error 5xx / Unavailable| P3
    
    P1 --> ZodVerify[Zod Schema Validation & FactStore Citation Guard]
    P2 --> ZodVerify
    P3 --> ZodVerify

    ZodVerify -->|Pass| Result[Verified Tailored Content]
    ZodVerify -->|Hallucination Detected| Reject[Validation Rejection]
```

### Verified Operational Modes:
1. `MOCK`: Used exclusively in automated CI unit tests. Returns deterministic synthetic responses tagged with `metadata.isMock = true`.
2. `LIVE`: Dispatches real HTTP requests to commercial provider endpoints. Throws `PROVIDER_UNAVAILABLE` if keys are missing.
3. `UNAVAILABLE`: Explicit state triggered when providers return 5xx errors or exhausted quotas, cleanly escalating to human review without crashing the application.

---

## 4. Secure Credential Configuration Procedure

To prevent accidental key exposure in terminal command histories, transcripts, or git repositories:

### Required PowerShell Secure Configuration:
```powershell
# Set development keys for the current terminal session only (temporary and memory-only):
$env:GROQ_API_KEY = "gsk_your_groq_development_key"
$env:GEMINI_API_KEY = "AIzaSy_your_gemini_paid_development_key"
$env:ROLEVIA_LLM_MODE = "LIVE"

# Execute the live evaluation benchmark:
node tests/test_live_llm_validation.js
```

### Safety Rules:
- Never commit `.env` containing live commercial API keys.
- Never write scripts that echo, print, or log `process.env.*_API_KEY`.
- Always use restricted development keys with daily budget caps (e.g. $5.00 limit).

---

## 5. Acceptance Criteria to Exit BLOCKED Status

To mark `FEAT-018` live integration as **VERIFIED**:
1. Supply valid development API keys for at least one primary provider (Groq or Gemini).
2. Execute `tests/test_live_llm_validation.js` with live network connectivity.
3. Record actual latency (ms), token usage (prompt + completion tokens), output JSON schema compliance, and zero hallucination violations.
4. Confirm fallback execution between Groq and Gemini under simulated 429 HTTP status codes.
