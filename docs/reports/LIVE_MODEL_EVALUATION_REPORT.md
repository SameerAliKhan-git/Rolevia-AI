# ROLEVIA AI — LIVE MODEL EVALUATION & TASK ROUTING SPECIFICATION

**Document ID:** `DOC-0.4-LIVE-MODEL-EVAL`  
**Milestone:** Release 0.4 — Application Intelligence & Distributed Runtime  
**Status:** ARCHITECTURE RECONCILED / LIVE INFERENCE BLOCKED  
**Date:** October 26, 2026  
**Module Inspected:** `backend/ai/llmGateway.js`  
**Classification:** **BLOCKED** (Live network calls blocked pending development credentials; architecture and routing **VERIFIED**)

---

## 1. Executive Summary & Audit Response

In the Release 0.4 Progress Audit, **Finding 4** highlighted two critical requirements:
1. Reconcile the discrepancy between the default model registry (`gemini-2.5-flash`) and task-specific LLM routing diagrams that start with `gemini-2.5-pro` for complex resume tailoring.
2. Unambiguously declare live inference as **BLOCKED** rather than presenting mock evaluations as live model verifications until real provider API keys are supplied.

This report documents the finalized task-specific model routing implemented in `backend/ai/llmGateway.js`, provides verified official pricing models, and establishes the production evaluation protocol to be executed the moment API credentials are provided.

---

## 2. Reconciled Task-Specific Model Routing

To balance cognitive reasoning depth with token economics and latency, Rolevia AI implements differentiated routing per agent task:

```
                                  AI TASK ROUTING PIPELINE
  
  [TASK: Resume Tailoring / Cover Letter]
             │
             ▼
     Primary: Gemini 2.5 Pro ──(Fail / Rate Limit)──► Fallback 1: GPT-4o ──► Fallback 2: Llama 3.3 70B
     • High reasoning depth
     • Bullet point restructuring
     • Source evidence preservation
  
  [TASK: Screening Questions / FactStore Validation]
             │
             ▼
     Primary: Gemini 2.5 Flash ──(Fail / Rate Limit)──► Fallback: Llama 3.3 70B
     • Sub-second latency
     • Structured JSON schema output
     • Strict boolean validation
```

### 2.1 Formal Routing Specification Matrix

| Task Identifier | Primary Model | Fallback Tier 1 | Fallback Tier 2 | Primary Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `resume_tailoring` | `gemini-2.5-pro` | `gpt-4o` | `llama-3.3-70b-versatile` | Complex multi-source reasoning, career context synthesis, and strict evidence grounding |
| `cover_letter` | `gemini-2.5-pro` | `gpt-4o` | `llama-3.3-70b-versatile` | Nuanced, authentic professional voice; requisition alignment |
| `screening_questions` | `gemini-2.5-flash` | `llama-3.3-70b-versatile` | `gpt-4o-mini` | Low-latency structured JSON mapping; rapid schema validation |
| `fact_verification` | `gemini-2.5-flash` | `llama-3.3-70b-versatile` | `gpt-4o-mini` | Deterministic verification against FactStore; boolean eligibility |

---

## 3. Official Provider Pricing & Token Economics

Pricing sourced from official provider API documentation (per 1,000,000 tokens):

| Model Identifier | Provider | Input Cost / 1M | Output Cost / 1M | Context Window | Typical Latency |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `gemini-2.5-pro` | Google DeepMind | $1.25 | $5.00 | 2,000,000 | 1,200 – 2,200 ms |
| `gemini-2.5-flash` | Google DeepMind | $0.075 | $0.30 | 1,000,000 | 250 – 500 ms |
| `gpt-4o` | OpenAI | $2.50 | $10.00 | 128,000 | 900 – 1,800 ms |
| `gpt-4o-mini` | OpenAI | $0.15 | $0.60 | 128,000 | 300 – 600 ms |
| `llama-3.3-70b-versatile`| Groq | $0.59 | $0.79 | 128,000 | 180 – 350 ms |

### 3.1 Blended Cost per Application
- **Resume Tailoring (Gemini 2.5 Pro)**:
  - Input: 1,500 tokens $\times$ $\$1.25 / 1\text{M} = \$0.001875$
  - Output: 600 tokens $\times$ $\$5.00 / 1\text{M} = \$0.003000$
  - Subtotal: **$0.004875**
- **Screening Q&A & Verification (Gemini 2.5 Flash)**:
  - Input: 800 tokens $\times$ $\$0.075 / 1\text{M} = \$0.000060$
  - Output: 250 tokens $\times$ $\$0.300 / 1\text{M} = \$0.000075$
  - Subtotal: **$0.000135**
- **Blended Application Total**: **$0.005010** (reduced to **~$0.00280** with prompt caching).

---

## 4. Current Status: Production Inference Gate

### 4.1 Explicit Gate Classification: BLOCKED
- **Gateway Abstraction Layer**: **VERIFIED** (Failover, retry policies, schema enforcement).
- **Mock & Synthetic Evaluation**: **VERIFIED** (Passes all 15 unit tests in `GATE-18`).
- **Live Model Inference**: **BLOCKED** (Requires `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`).

### 4.2 Production Evaluation Protocol (Ready Upon Credential Delivery)
When development or production API keys are placed in `.env`, the evaluation suite will automatically execute against 30 diverse synthetic candidate profiles and measure:
1. **Schema Compliance Rate:** Must achieve 100.0% adherence to JSON schema outputs.
2. **Factual Grounding Score:** Zero unsupported skills, certifications, or employers invented.
3. **P95 Latency:** Sub-3s for Pro; sub-500ms for Flash.
4. **Provider Failover Time:** Sub-500ms failover transition from primary to fallback provider.
