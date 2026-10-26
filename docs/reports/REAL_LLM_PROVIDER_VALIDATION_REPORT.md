# Rolevia AI · Real LLM Provider Validation & Gateway Execution Reliability Report

**Document Date:** October 26, 2026  
**Product:** Rolevia AI (`https://roleviaai.co.in`)  
**Primary Competitor Benchmark:** Tsenta AI (`https://tsenta.com`)  
**Component:** Multi-Model LLM Gateway (`backend/ai/llmGateway.js`)  
**Test Harness:** `tests/test_live_llm_validation.js` & `tests/test_llm_gateway_hardening_suite.js`  
**Execution Mode Enforced:** `DRY_RUN` Staging Automation Barrier  

---

## 1. Executive Summary & Audit Assessment

The technical audit identified a critical distinction between mock AI behavior and live model execution:
> *"The updated gateway now rejects unavailable providers instead of quietly falling back to mock responses... However, no configured API keys were available and no live commercial LLM calls were performed. Consequently, actual model connectivity, rate limits, JSON parsing, and real token usage remain unverified in production."*

In response, Rolevia AI has established an end-to-end, multi-model live integration contract for **Google Gemini**, **Groq (Free Tier)**, and **OpenAI**, coupled with a dedicated automated live benchmark test suite (`tests/test_live_llm_validation.js`).

### Operational Status Matrix

| Provider | Supported Models | Endpoint Contract | Status in Current Environment | Fail-Safe Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Groq (Free Tier)** | `llama-3.3-70b-versatile`<br>`llama-3.1-8b-instant` | OpenAI-compatible `https://api.groq.com/openai/v1/chat/completions` | **UNAVAILABLE** (No `GROQ_API_KEY` in `.env`) | Rejects live calls with `PROVIDER_UNAVAILABLE`; blocks silent mock fallback |
| **Google Gemini** | `gemini-1.5-flash`<br>`gemini-2.0-flash`<br>`gemini-1.5-pro` | Native REST `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | **UNAVAILABLE** (No `GEMINI_API_KEY` in `.env`) | Rejects live calls with `PROVIDER_UNAVAILABLE`; blocks silent mock fallback |
| **OpenAI** | `gpt-4o-mini`<br>`gpt-4o` | Native REST `https://api.openai.com/v1/chat/completions` | **UNAVAILABLE** (No `OPENAI_API_KEY` in `.env`) | Rejects live calls with `PROVIDER_UNAVAILABLE`; blocks silent mock fallback |
| **Deterministic Mock** | `mock-model` | In-memory truth-grounded rules engine | **ACTIVE** (Explicit `MOCK` mode only) | Allowed ONLY when `mode === 'MOCK'` for sandboxed unit tests |

---

## 2. Invariant Verification: Elimination of Silent Mock Fallback

Prior to Release 0.3 hardening, unconfigured or failing commercial LLM calls quietly defaulted to mock responses, creating the false illusion of AI capabilities.

The updated `LLMGateway` (`backend/ai/llmGateway.js`) strictly enforces three explicit gateway modes:
1. `GATEWAY_MODES.LIVE`: Mandatory for production and live evaluation. If `apiKey` is absent, the gateway throws `LLMExecutionError('PROVIDER_UNAVAILABLE')`. It **never** returns mock output.
2. `GATEWAY_MODES.MOCK`: Reserved strictly for offline unit tests and development fixtures. Zero token cost is logged.
3. `GATEWAY_MODES.UNAVAILABLE`: Set automatically when credentials are missing or after exceeding retry limits.

### Verified Test Evidence (`tests/test_live_llm_validation.js`)
```
[STATUS: UNAVAILABLE] No live LLM provider API key detected in environment or .env.
Supported Providers:
  1. Groq (Free Tier): GROQ_API_KEY  (Models: llama-3.3-70b-versatile, llama-3.1-8b-instant)
  2. Google Gemini:    GEMINI_API_KEY (Models: gemini-1.5-flash, gemini-2.0-flash)
  3. OpenAI:           OPENAI_API_KEY (Models: gpt-4o-mini, gpt-4o)

Invariant Verification:
✓ [SAFETY INVARIANT] In LIVE mode without API key, gateway strictly throws PROVIDER_UNAVAILABLE
✓ [SAFETY INVARIANT] Silent mock fallback in LIVE mode is strictly blocked.
```

---

## 3. Provider Contract Specifications & Cost Accounting

### A. Groq Free Tier (Recommended for Zero-Cost Production Agent)
- **Primary Model:** `llama-3.3-70b-versatile` (128k context window, state-of-the-art open weights reasoning)
- **Fallback Model:** `llama-3.1-8b-instant` (128k context window, high TPS rate limit absorber)
- **Token Pricing:** $0.00 / 1k input tokens, $0.00 / 1k output tokens (Free Tier)
- **Request Format:** Standard Bearer Authorization header with JSON body (`model`, `messages`, `temperature`, `max_tokens`).

### B. Google Gemini
- **Primary Model:** `gemini-1.5-flash` (1M context window, multimodal)
- **Token Pricing:** $0.000075 / 1k input tokens, $0.0003 / 1k output tokens
- **Request Format:** Query parameter `?key=${apiKey}` with `contents: [{ role: 'user', parts: [{ text }] }]` and `generationConfig`.

### C. OpenAI
- **Primary Model:** `gpt-4o-mini` (128k context window)
- **Token Pricing:** $0.00015 / 1k input tokens, $0.0006 / 1k output tokens
- **Request Format:** Bearer Authorization header with JSON payload.

---

## 4. Live Benchmark Evaluation Suite Specification

The automated test script `tests/test_live_llm_validation.js` executes eight specific evaluation benchmarks upon provision of an API key:

1. **Structured Output Compliance:** Parses output strictly into Zod schemas (`ResumeTailoringOutputSchema`, `ScreeningQuestionOutputSchema`). Rejects any non-conforming JSON with HTTP 422.
2. **Truth-Grounded Resume Tailoring:** Dispatches synthetic candidate FactStore highlights and verifies that every proposed bullet strictly maps to an authentic `sourceFactId`.
3. **Screening Question Interpretation:** Correctly categorizes ATS application questions into `FACTUAL`, `NARRATIVE`, `LEGAL_ATTESTATION`, or `SENSITIVE_DISCLOSURE`.
4. **Sensitive Personal Disclosure Escalation:** Strictly blocks the LLM from drafting answers for visa sponsorship, compensation expectations, or disability status. Automatically returns `requiresCandidateReview: true` with `draftAnswer: null`.
5. **Prompt Injection & Fraud Resistance:** Adversarial prompts attempting to emit fake receipt tokens (e.g. `CONFIRM-REAL-GH-CONF-99219`) are intercepted and blocked by the security gate with `FORBIDDEN_OUTPUT`.
6. **Hallucination Rejection:** Synthetic bullets injecting ungrounded skills (e.g. "Solidity") or fabricated metrics (e.g. "$500M TVL") are detected by `validateSemanticClaimAssertions` and rejected.
7. **Candidate-Specific Explainable Match:** Validates that match components (skills, experience, education) mathematically sum to the overall score.
8. **Intra-Provider Model Fallback:** Verifies that 429 rate limits trigger automatic intra-provider fallback (e.g. `llama-3.3-70b` → `llama-3.1-8b`) before failing.

---

## 5. Safe Credential Protocol

In compliance with Rolevia AI security instructions, raw API keys must never be pasted into chat or logged in plain text.

To configure live evaluation with Groq's free tier, run the following command in PowerShell:

```powershell
$val = Read-Host -Prompt "Enter GROQ_API_KEY (typing hidden)" -AsSecureString; $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($val); $Plain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR); Add-Content -Path .env -Value "GROQ_API_KEY=$Plain"; Write-Host "Saved safely to .env."
```

*(Free API keys are available at: [https://console.groq.com/keys](https://console.groq.com/keys))*.

Once configured, running `node tests/test_live_llm_validation.js` executes the live benchmark suite with real token and latency logging.
