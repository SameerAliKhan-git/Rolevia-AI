-- Rollback Migration: 20261026000000_submission_attempt_locks
-- Description: Drop submission_attempt_locks table, constraints, and associated indexes safely

DROP TABLE IF EXISTS "submission_attempt_locks" CASCADE;
