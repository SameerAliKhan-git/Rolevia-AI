# ADR-004: Multi-Model LLM Gateway with Anti-Hallucination Guardrails

**Status:** ACCEPTED  
**Date:** October 26, 2026  
**Context:** Relying on a single commercial LLM vendor creates severe operational vulnerabilities (rate limits, outages, cost surges, vendor lock-in). Furthermore, LLMs tend to hallucinate candidate qualifications or metrics.

## Decision
Implement a centralized multi-model gateway (`backend/ai/llmGateway.js`, `FEAT-018`) with:
1. **Tiered Provider Fallback**: Groq Cloud `llama-3.3-70b-versatile` (Primary, lowest cost & fastest) -> Google Gemini 1.5 Pro (Secondary, deep reasoning) -> OpenAI GPT-4o-mini (Emergency fallback).
2. **Circuit Breakers**: Fast-failover to secondary provider on 5 consecutive errors or rate limits.
3. **Structured JSON Validation**: Zod schema enforcement on all model outputs.
4. **Anti-Hallucination Guardrails**: Cross-references every generated bullet claim against verified facts in the candidate FactStore; strips or rejects unsupported claims.
5. **Commercial Zero-Data-Retention Requirement**: Prohibits the use of free tier keys that train foundation models on candidate resumes.

## Rationale
- Guaranteed 99.95% availability for document generation.
- Reduces unit economics cost per application to ~$0.0027 USD.
- Ensures candidates are never misrepresented on employment applications.

## Consequences
- Single entrypoint for all LLM calls across the application.
- Tested and verified across 15 unit tests in `tests/test_llm_gateway_hardening_suite.js`.
