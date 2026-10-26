# ADR-003: LangGraph.js Agentic Orchestration with PostgreSQL State Checkpointing

**Status:** ACCEPTED  
**Date:** October 26, 2026  
**Context:** Candidate application workflows require multi-step AI orchestration (Discovery -> Match -> Optimize -> Approval -> ATS Prepare -> Submit -> Verify). Long-running workflows can crash or require human approval gates.

## Decision
Adopt **LangGraph.js** as the standard orchestrator for Rolevia AI's autonomous candidate agent (`FEAT-017`), persisting state transitions directly to PostgreSQL via a durable checkpointer (`backend/workflows/postgresSaver.js`).

## Rationale
1. **Durable Pause & Resume**: When an application requires candidate approval or human escalation (e.g. unknown screening question, CAPTCHA), the graph pauses state safely in PostgreSQL.
2. **Crash Resiliency**: If a worker process is terminated during graph execution, the workflow resumes from the exact last checkpoint without re-running completed AI inferences or re-debiting user credits.
3. **Database Sovereignty**: Checkpoints are stored in PostgreSQL relational tables alongside application records, maintaining transactional consistency.

## Consequences
- Fully deterministic and observable state transitions (`DRAFT` -> `OPTIMIZING` -> `PENDING_REVIEW` -> `APPROVED` -> `READY_FOR_SUBMISSION` -> `SUBMITTED_CONFIRMED`).
- Integrated into master test harness (`GATE-17` and `GATE-19`), passing 27 durability and recovery tests.
