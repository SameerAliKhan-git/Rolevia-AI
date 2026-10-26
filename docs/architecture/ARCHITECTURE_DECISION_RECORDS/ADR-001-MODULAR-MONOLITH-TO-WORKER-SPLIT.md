# ADR-001: Modular Monolith API with Asynchronous Dedicated Worker Pools

**Status:** ACCEPTED  
**Date:** October 26, 2026  
**Context:** Rolevia AI targets 1,000,000 simultaneously connected candidates. We need to decide whether to decompose the application into microservices immediately or retain a modular monolith with separated worker pools.  

## Decision
Retain a **Stateless Modular Monolith for the API Layer** and separate heavy, computationally expensive workloads (Playwright browser automation, LangGraph LLM orchestration, scheduled crawler ingestion) into **Independent Asynchronous Worker Pools** orchestrated via BullMQ and Redis.

## Rationale
1. **Premature Microservices Hazard**: Microservices introduce distributed transaction complexity, network latency, distributed tracing overhead, and operational complexity before product-market fit.
2. **Bulkhead Protection**: The primary danger at scale is event-loop blocking and memory starvation caused by Playwright browsers and PDF parsing. Offloading these tasks to dedicated worker containers completely protects API responsiveness.
3. **Seamless Autoscaling**: API pods autoscale on HTTP concurrency/CPU; Playwright worker pods autoscale independently on BullMQ submission queue depth.

## Consequences
- Single codebase, unified Prisma schema, and straightforward local development.
- Zero distributed database transactions required between API and worker processes.
- Clear path to extract microservices later if individual domain boundaries demand independent team ownership.
