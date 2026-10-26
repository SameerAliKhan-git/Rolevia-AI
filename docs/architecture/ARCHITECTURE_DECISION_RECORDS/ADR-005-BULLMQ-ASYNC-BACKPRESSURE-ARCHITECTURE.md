# ADR-005: BullMQ Job Queues, Redis Isolation and Admission Control Backpressure

**Status:** ACCEPTED  
**Date:** October 26, 2026 (Updated for Infrastructure Isolation & BullMQ Policy Compliance)  
**Context:** Spikes in candidate activity can overwhelm Playwright browser worker pools and database connections. Furthermore, combining disposable cache workloads with persistent job queues on a single Redis instance with LRU eviction creates a severe data loss risk (eviction of queue keys, corrupted delay sets, or lost locks).

## Decision
1. **Physical / Logical Redis Infrastructure Separation**:
   - **Queue Redis (BullMQ)**: Dedicated Redis instance configured strictly with `maxmemory-policy=noeviction` and Append-Only File (AOF) persistence (`appendonly yes`, `appendfsync everysec`). Zero keys may be evicted automatically; out-of-memory errors halt job ingestion rather than silently dropping active or delayed queue items.
   - **Cache Redis**: Independent Redis instance configured with `maxmemory-policy=allkeys-lru` for disposable search queries, experience filters, and user session caches.
2. **Asynchronous Priority Queues**:
   - High Priority: Candidate approval processing and in-flight submission verification.
   - Standard Priority: Resume and cover letter tailoring workflows.
   - Low Priority: Crawler feed ingestion and historical analytics.
3. **Admission Control & Dynamic Backpressure**:
   - When the active submission queue depth exceeds the target worker capacity (e.g. > 2,500 jobs at 10k launch scale, or > 5,000 jobs at hyperscale), the API enforces admission control: user requests are assigned a visible queue position and estimated completion time rather than accepting unbounded synchronous executions.
4. **Dead-Letter Queue (DLQ)**:
   - Jobs failing 3 consecutive attempts are transferred to `rolevia-dlq-submissions` with execution failure context, alerting on-call engineering without blocking other candidates.

## Rationale
- Compliance with BullMQ official operational requirements (`noeviction`).
- Prevents queue corruption and silent job loss during traffic surges.
- Protects API responsiveness and database connection pools from exhaustion.

## Consequences
- Requires two separate Redis configurations in deployment manifests.
- Eliminates risk of queue state loss during cache churn.
