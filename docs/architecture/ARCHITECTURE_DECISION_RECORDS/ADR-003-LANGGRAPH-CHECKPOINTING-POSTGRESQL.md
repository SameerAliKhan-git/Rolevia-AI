# ADR-003: LangGraph.js Agentic Orchestration with PostgreSQL State Checkpointing

**Status:** ACCEPTED  
**Date:** October 26, 2026 (Reconciled & Architecture-Aligned)  
**Context:** Candidate application workflows require multi-step AI orchestration (Discovery -> Match -> Optimize -> Approval -> ATS Prepare -> Submit -> Verify). Long-running workflows can encounter container restarts, worker crashes, or human approval gates.

## Decision
Adopt **LangGraph.js** as the standard workflow engine for Rolevia AI's autonomous candidate agent (`FEAT-017`), persisting state transitions directly to PostgreSQL via the production checkpointer module:
`backend/workflows/postgresCheckpointer.js` (`PostgresDurableCheckpointer`).

## Rationale
1. **Durable Pause & Resume**: When an application requires candidate document approval or human escalation (e.g. unknown screening question, CAPTCHA challenge), the graph pauses state safely in PostgreSQL relational storage (`ApplicationEvent` and thread metadata).
2. **Crash Resiliency**: If a worker process is terminated during graph execution, the workflow resumes from the exact last saved checkpoint without re-running completed AI inferences or re-debiting user credits.
3. **Database Sovereignty**: Checkpoints are stored in PostgreSQL relational tables alongside application records, maintaining transactional consistency without requiring separate key-value state engines.
4. **Side-Effect Reconciliation**: A recovered checkpoint indicates previous execution progress; irreversible external actions (such as employer form submissions) require verifying the submission lock and audit trail before any re-execution.

## Consequences
- Single authoritative checkpointer implementation: `backend/workflows/postgresCheckpointer.js`.
- Fully deterministic and observable state transitions (`DRAFT` -> `OPTIMIZING` -> `PENDING_REVIEW` -> `APPROVED` -> `READY_FOR_SUBMISSION` -> `SUBMITTED_CONFIRMED`).
- Integrated into master test harness (`GATE-17` and `GATE-19`), passing 27 durability and recovery tests.
