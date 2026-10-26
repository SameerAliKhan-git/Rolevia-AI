# Rolevia AI · Live LLM Inference & Model Gateway Results
**Release:** 0.4 — Runtime Deployment & Concurrency Validation  
**Date:** October 26, 2026  
**Status:** **PARTIAL** (Architecture & Contracts **VERIFIED**; Live Network Calls **BLOCKED**)  
**Component:** Multi-Model LLM Gateway, Active Model Registry, and Structured Schemas  

---

## 1. Executive Summary

In compliance with the **Release 0.4 Architecture Integrity Gate**, Rolevia AI evaluated its multi-provider LLM gateway ([backend/ai/llmGateway.js](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/backend/ai/llmGateway.js)).

All retired models (Gemini 1.5 Pro/Flash, Gemini 2.0 Flash) have been decommissioned and replaced with **active Google Gemini 2.5 endpoints**, alongside Groq and OpenAI fallback providers.

**Status Classification:**
- **Model Registry & Pricing:** **VERIFIED**
- **Structured Output Schemas (Zod):** **VERIFIED**
- **Intra-Provider Fallback Routing:** **VERIFIED**
- **Live Provider Network Invocations:** **BLOCKED** (Awaiting user development credentials for `GEMINI_API_KEY`, `GROQ_API_KEY`, or `OPENAI_API_KEY` in staging environment).

> **Core Invariant Enforced:** In accordance with user rules and architectural standards, **mock executions are never presented or reported as live external provider inference**.

---

## 2. Active Model Registry & Commercial Token Economics

All model configurations are registered with official provider endpoints, context windows, and commercial pricing (in USD per 1,000 tokens):

| Model Identifier | Provider | Input Cost / 1k Tokens | Output Cost / 1k Tokens | Context Window | Operational Role |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`gemini-2.5-flash`** | Google | **$0.000075** ($0.075/Mtok) | **$0.000300** ($0.30/Mtok) | 1,048,576 | Primary Default (Fast tailoring & screening) |
| **`gemini-2.5-pro`** | Google | **$0.001250** ($1.25/Mtok) | **$0.005000** ($5.00/Mtok) | 2,097,152 | Complex Executive Role Tailoring |
| **`llama-3.3-70b-versatile`** | Groq | **$0.000590** ($0.59/Mtok) | **$0.000790** ($0.79/Mtok) | 128,000 | Low-Latency Open Fallback |
| **`llama-3.1-8b-instant`** | Groq | **$0.000050** ($0.05/Mtok) | **$0.000080** ($0.08/Mtok) | 128,000 | Rate-Limit Fallback for Groq |
| **`gpt-4o-mini`** | OpenAI | **$0.000150** ($0.15/Mtok) | **$0.000600** ($0.60/Mtok) | 128,000 | Commercial Tertiary Resiliency Fallback |

---

## 3. Fallback Directory & Resiliency Routing

To prevent hard failures when upstream providers experience rate limits (HTTP 429) or transient outages (HTTP 5xx):

```
┌─────────────────────────────────────────────────────────────┐
│                    Task: RESUME_TAILORING                   │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌───────────────────────────────┐     ┌───────────────────────┐
│ Primary: Gemini 2.5 Pro       │     │ Secondary: Groq 70B   │
│ Context: 2M tokens            │     │ Context: 128k tokens  │
└───────────────┬───────────────┘     └───────────┬───────────┘
                │ Rate Limit (429)                │ Rate Limit (429)
                ▼                                 ▼
┌───────────────────────────────┐     ┌───────────────────────┐
│ Fallback: Gemini 2.5 Flash    │     │ Fallback: Groq 8B     │
│ Context: 1M tokens            │     │ Context: 128k tokens  │
└───────────────────────────────┘     └───────────────────────┘
```

The fallback mapping in [`backend/ai/llmGateway.js`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/backend/ai/llmGateway.js) was empirically verified:
```javascript
const MODEL_FALLBACKS = {
  'llama-3.3-70b-versatile': 'llama-3.1-8b-instant',
  'gemini-2.5-pro': 'gemini-2.5-flash',
  'gpt-4o': 'gpt-4o-mini'
};
```

---

## 4. Structured Output Validation Schemas

Three deterministic Zod schemas enforce structured responses and block unsupported or hallucinated claims:

1. **`ResumeTailoringOutputSchema`**:
   - Requires every suggested bullet to include a valid `sourceFactId` referencing the candidate's verified FactStore.
   - Enforces `preservedSkills` and `relevanceScore` (0.0 to 1.0).
2. **`ScreeningQuestionOutputSchema`**:
   - Outputs strict question-answer pairs.
   - Mandatory `requiresHumanAction: true` flag on unstated salaries or legal attestations.
3. **`RecruiterEmailOutputSchema`**:
   - Classifies email intent (`INTERVIEW_INVITATION`, `REJECTION`, `OA_ASSESSMENT`, `INQUIRY`).
   - Requires parsed scheduling dates and next action items.

---

## 5. Live Inference Status & Blocker Reconciliation

```text
--- [PHASE 4] LLM Multi-Model Gateway & Schema Verification ---
Verifying Model Registry for active Google Gemini 2.5 and multi-provider models:
  • Gemini 2.5 Flash : $0.0750/Mtok in, $0.3000/Mtok out
  • Gemini 2.5 Pro   : $1.2500/Mtok in, $5.0000/Mtok out
  • Groq Llama 3.3   : $0.5900/Mtok in, $0.7900/Mtok out
  • OpenAI 4o Mini   : $0.1500/Mtok in, $0.6000/Mtok out
✓ [MODEL SELECTION] Default for Gemini: gemini-2.5-flash (Fallback for Pro: gemini-2.5-flash)
✓ [GATEWAY STATUS] Contract & Schema: VERIFIED | Live Network Invocations: BLOCKED
  Note: Development API credentials (GEMINI_API_KEY, GROQ_API_KEY, OPENAI_API_KEY) not present in staging environment
```

### Action Required to Unblock Live Network Calls:
To execute live inference validation against the provider APIs:
1. Provide staging API credentials in `.env`:
   - `GEMINI_API_KEY="AIzaSy..."`
   - `GROQ_API_KEY="gsk_..."`
   - `OPENAI_API_KEY="sk-proj-..."`
2. Once keys are supplied, run `node tests/test_llm_gateway_hardening.js` with `ROLEVIA_LLM_MODE=LIVE` to record real token latencies and provider costs.
