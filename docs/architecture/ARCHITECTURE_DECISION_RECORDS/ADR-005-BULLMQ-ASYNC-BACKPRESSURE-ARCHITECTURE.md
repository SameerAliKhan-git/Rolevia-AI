# ADR-005: BullMQ Job Queues and Admission Control Backpressure

**Status:** ACCEPTED  
**Date:** October 26, 2026  
**Context:** Spikes in candidate activity (e.g. 10,000 applications triggered during peak hiring hours) can overwhelm Playwright browser worker pools and database connection pools.

## Decision
Adopt **BullMQ on Redis** for asynchronous job scheduling with priority queues, dead-letter queues, and dynamic admission control backpressure.

## Rationale
1. **Durable Queuing**: Jobs are persisted in Redis with atomic state transitions and lock lease renewal.
2. **Backpressure Signaling**: If the queue length exceeds 10,000 items, the API returns HTTP 429 or queues jobs with an estimated time to execution displayed in the candidate UI.
3. **Graceful Workload Shedding**: Crawlers and background analytics are deprioritized during peak candidate submission bursts.
4. **Dead-Letter Recovery**: Permanently failing jobs are routed to DLQs for audit and manual replay without data loss.

## Consequences
- Protects API responsiveness under extreme traffic spikes.
- Enables predictable autoscaling of Playwright worker containers based on BullMQ queue depth.
