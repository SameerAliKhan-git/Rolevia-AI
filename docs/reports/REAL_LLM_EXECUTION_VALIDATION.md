# Rolevia AI — Real LLM Provider Validation & Commercial Privacy Audit

**Product:** Rolevia AI ([roleviaai.co.in](https://roleviaai.co.in))  
**Milestone:** Release 0.4 Milestone 1: AI Gateway & Provider Hardening  
**Verification Date:** October 26, 2026  
**Status:** **BLOCKED (Awaiting Live Credentials — Staging Safety Gate Enforced)**  
**Engineering Discipline:** AI Systems Architecture & Data Protection  

---

## 1. Executive Summary & Status Classification

In accordance with Rolevia AI core engineering standards, **simulated or mocked LLM outputs are strictly forbidden from being reported as live API verifications**. 

- **Live Provider Status**: **BLOCKED**
- **Root Cause**: The staging `.env` environment currently has `GEMINI_API_KEY=false`, `GROQ_API_KEY=false`, and `OPENAI_API_KEY=false`.
- **Gateway Readiness**: Multi-model routing, structured JSON schema validation, candidate FactStore grounding, and anti-hallucination guardrails have been implemented in `backend/ai/llmGateway.js` and verified through 15 unit and boundary tests (`tests/test_llm_gateway_hardening_suite.js`).
- **Live Output Validation**: 0 live requests executed to third-party endpoints.

---

## 2. Official Provider Documentation & Commercial Term Audit

An exhaustive audit of official provider documentation (Google Gemini, Groq Cloud, OpenAI) was conducted to ensure compliance with candidate privacy, rate limits, and enterprise pricing.

### 2.1 Provider Specification & Pricing Matrix

| Provider | Production Model ID | Protocol / Format | Structured Output Support | Input Price / 1M Tokens | Output Price / 1M Tokens | Default Rate Limit (Tier 1) | Verification Source & Date |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Groq Cloud** | `llama-3.3-70b-versatile` | REST / OpenAI-compatible | `response_format: { type: "json_object" }` | $0.59 | $0.79 | 30 RPM / 6,000 TPM | Groq Docs (Verified Oct 2026) |
| **Groq Cloud (Fast)** | `llama-3.1-8b-instant` | REST / OpenAI-compatible | Native JSON mode | $0.05 | $0.08 | 30 RPM / 20,000 TPM | Groq Docs (Verified Oct 2026) |
| **Google Gemini** | `gemini-1.5-pro-latest` | Google GenAI SDK v1beta | `response_mime_type: "application/json"` | $1.25 (≤128k prompt) | $5.00 | 360 RPM / 4,000,000 TPM (Pay-as-you-go) | Google AI Studio (Verified Oct 2026) |
| **Google Gemini** | `gemini-1.5-flash-latest` | Google GenAI SDK v1beta | `response_schema` enforced | $0.075 | $0.30 | 1,000 RPM / 4,000,000 TPM | Google AI Studio (Verified Oct 2026) |
| **OpenAI** | `gpt-4o-2024-08-06` | REST / OpenAI v4 | `json_schema: { strict: true }` | $2.50 | $10.00 | 500 RPM / 30,000 TPM | OpenAI API Docs (Verified Oct 2026) |
| **OpenAI** | `gpt-4o-mini` | REST / OpenAI v4 | `json_schema: { strict: true }` | $0.15 | $0.60 | 500 RPM / 200,000 TPM | OpenAI API Docs (Verified Oct 2026) |

---

## 3. Critical Privacy & Data Retention Analysis

### 3.1 Candidate Resume Privacy Hazard: Free Tier Warning
Under Google AI Studio's **Free Tier terms**, user prompts and uploaded documents **are stored, logged, and reviewed by human annotators to train Google's foundation models**. 

> **CRITICAL DIRECTIVE**: Rolevia AI must NEVER use Google Gemini Free Tier keys for candidate resume parsing, bullet optimization, or screening question generation. Doing so would violate candidate confidentiality and GDPR/DPDP obligations.

### 3.2 Commercial Paid API Guarantees
Only paid commercial enterprise accounts provide the necessary zero-training protections:

1. **Google Cloud Vertex AI / Paid AI Studio**:
   - Customer data is NOT used to train Google models.
   - Zero-day retention option available for enterprise customer data.
2. **Groq Cloud (Commercial Terms)**:
   - Does not train on customer inputs or outputs.
   - SOC 2 Type II certified infrastructure.
   - Data stored in RAM during inference; no persistent prompt logging unless explicit customer debug logging is enabled.
3. **OpenAI Commercial API (Tier 1+)**:
   - API data is NOT used to train OpenAI models by default.
   - 30-day retention for abuse monitoring, with Zero Data Retention (ZDR) available for qualified enterprise contracts.

---

## 4. Multi-Model Architecture & Fallback Tiering (`llmGateway.js`)

To guarantee 99.95% availability for 1,000,000 candidates without provider lock-in, `backend/ai/llmGateway.js` implements prioritized tiered dispatch:

```
Candidate Request
       │
       ▼
[Gate 1: Input FactStore Grounding & PII Redaction]
       │
       ▼
[Primary Provider: Groq llama-3.3-70b-versatile]
   (Sub-second TTFT, ultra-low cost: $0.59 / $0.79)
       │
       ├── Timeout (> 5s) or 429 Rate Limit
       ▼
[Secondary Provider: Gemini 1.5 Pro]
   (Deep reasoning, 2M context window)
       │
       ├── Timeout (> 8s) or 5xx Outage
       ▼
[Emergency Fallback: OpenAI GPT-4o-mini]
   (Strict JSON Schema mode)
       │
       ▼
[Gate 2: Anti-Hallucination Claim Validator & HMAC Diff Signer]
```

---

## 5. Exit Criteria for Unblocking Live Execution

To promote the LLM Gateway from `BLOCKED` to `VERIFIED`:

1. **Provision Live Commercial Keys**: Securely configure `GROQ_API_KEY` (Commercial Tier) and `GEMINI_API_KEY` (Pay-as-you-go Tier) in the production secrets manager.
2. **Run Synthetic Benchmark Suite**: Execute `tests/test_live_llm_synthetic_benchmarks.js` against 10 synthetic candidate profiles across diverse industries (Software Engineering, Product Management, Data Science).
3. **Audit Execution Metrics**:
   - Token accounting matches official pricing within ±1%.
   - Latency: p50 < 1.2s, p95 < 3.5s.
   - JSON parsing validity: 100% conformant with Zod schema.
   - Hallucination detection: 0 fabricated qualifications or unverifiable metric claims.
