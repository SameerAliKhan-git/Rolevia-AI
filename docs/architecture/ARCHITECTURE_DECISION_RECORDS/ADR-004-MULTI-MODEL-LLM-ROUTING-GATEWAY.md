# ADR-004: Multi-Model LLM Gateway with Anti-Hallucination Guardrails

**Status:** ACCEPTED (Architecture Implemented; Live Network Integration Gated Pending Commercial Keys)  
**Date:** October 26, 2026 (Updated for Active Model Endpoints)  
**Context:** Relying on a single commercial LLM vendor creates operational vulnerabilities (rate limits, vendor outages, cost spikes, lock-in). Furthermore, generative models can hallucinate candidate qualifications or metrics without deterministic validation.

## Decision
Implement a centralized multi-model gateway (`backend/ai/llmGateway.js`, `FEAT-018`) with:
1. **Tiered Active Provider Routing**:
   - Primary: Groq Cloud `llama-3.3-70b-versatile` ($0.59 / $0.79 per 1M tokens) — ultra-low latency & cost.
   - Secondary: Google Gemini `gemini-2.5-pro` / `gemini-2.5-flash` ($1.25 / $5.00 and $0.075 / $0.30 per 1M tokens) — deep reasoning and extended context.
   - Emergency Fallback: OpenAI `gpt-4o-mini` ($0.15 / $0.60 per 1M tokens) — strict schema mode.
2. **Circuit Breakers & Jittered Backoff**: Fast failover to the secondary provider upon 5 consecutive network errors or HTTP 429 rate limits.
3. **Structured Schema Validation**: Deterministic Zod schema parsing on all model outputs.
4. **Anti-Hallucination Claim Validator**: Cross-references every generated bullet claim against candidate facts in the verified FactStore; flags or removes ungrounded metrics, dates, and organizations.
5. **Commercial Zero-Data-Retention Requirement**: Prohibits the use of free-tier API endpoints that train foundation models on candidate resumes.
6. **Explicit Execution Modes**: `MOCK`, `LIVE`, and `UNAVAILABLE`. Silent mock fallback in `LIVE` mode is strictly prohibited.

## Rationale
- Target availability SLO of 99.95% for AI operations through multi-vendor failover.
- Sustainable unit economics: direct LLM generation cost is modeled at ~$0.0027 USD per tailored application.
- Candidate protection: prevents fabricated career claims on employer applications.

## Current Operational Status
- Gateway schema enforcement, PII scrubbing, and anti-hallucination validation verified across 15 tests in `tests/test_llm_gateway_hardening_suite.js`.
- Live network execution is currently **BLOCKED** pending injection of commercial API keys in production secrets vaulting.
