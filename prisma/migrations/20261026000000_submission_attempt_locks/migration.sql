-- Migration: 20261026000000_submission_attempt_locks
-- Description: Add database-level submission locks and requisition uniqueness constraints
-- Author: Principal Software Architect (Rolevia AI Engineering)

-- CreateTable: submission_attempt_locks
CREATE TABLE IF NOT EXISTS "submission_attempt_locks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "attempt_key" TEXT NOT NULL,
    "requisition_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_attempt_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: attempt_key must be unique across all attempts
CREATE UNIQUE INDEX IF NOT EXISTS "submission_attempt_locks_attempt_key_key" 
ON "submission_attempt_locks"("attempt_key");

-- CreateIndex: unique candidate active requisition constraint
-- Prevents race conditions and duplicate applications across competing worker processes
CREATE UNIQUE INDEX IF NOT EXISTS "unique_candidate_active_requisition" 
ON "submission_attempt_locks"("tenant_id", "user_id", "requisition_key");

-- CreateIndex: fast index by application_id
CREATE INDEX IF NOT EXISTS "submission_attempt_locks_application_id_idx" 
ON "submission_attempt_locks"("application_id");
