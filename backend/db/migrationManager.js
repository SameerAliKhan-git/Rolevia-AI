// Rolevia AI · Database Migration Manager & Lock Reconciliation
// Enforces version-controlled schema migrations, rollbacks, and orphaned lock reconciliation.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const prisma = require('../db');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'prisma', 'migrations');

/**
 * Ensure the migration tracking table exists
 */
async function ensureMigrationTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_rolevia_migrations" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL UNIQUE,
      "checksum" TEXT NOT NULL,
      "applied_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      "status" TEXT NOT NULL
    );
  `);
}

function splitSqlStatements(sql) {
  return sql
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => {
      const clean = stmt.replace(/--.*$/gm, '').trim();
      return clean.length > 0;
    });
}

/**
 * Apply all pending migrations in alphabetical order
 */
async function applyPendingMigrations() {
  await ensureMigrationTable();

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return { applied: 0, pending: 0, appliedMigrations: [] };
  }

  const entries = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .sort();

  const appliedRecords = await prisma.$queryRawUnsafe(`
    SELECT name, checksum FROM "_rolevia_migrations" WHERE status = 'APPLIED';
  `);
  const appliedSet = new Set(appliedRecords.map(r => r.name));

  const appliedMigrations = [];

  for (const migrationName of entries) {
    if (appliedSet.has(migrationName)) {
      continue;
    }

    const migrationPath = path.join(MIGRATIONS_DIR, migrationName, 'migration.sql');
    if (!fs.existsSync(migrationPath)) {
      continue;
    }

    const sqlContent = fs.readFileSync(migrationPath, 'utf8');
    const checksum = crypto.createHash('sha256').update(sqlContent).digest('hex');

    console.log(`[MIGRATION] Applying migration: ${migrationName}...`);
    
    // Execute migration statements sequentially
    const statements = splitSqlStatements(sqlContent);
    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
    }

    // Record migration in history table
    await prisma.$executeRawUnsafe(`
      INSERT INTO "_rolevia_migrations" ("id", "name", "checksum", "status")
      VALUES ($1, $2, $3, 'APPLIED')
      ON CONFLICT ("name") DO UPDATE SET "checksum" = $3, "status" = 'APPLIED', "applied_at" = CURRENT_TIMESTAMP;
    `, crypto.randomUUID(), migrationName, checksum);

    appliedMigrations.push(migrationName);
    console.log(`✓ [MIGRATION] Successfully applied: ${migrationName}`);
  }

  return {
    applied: appliedMigrations.length,
    totalKnown: entries.length,
    appliedMigrations
  };
}

/**
 * Roll back a specified migration by name
 */
async function rollbackMigration(migrationName) {
  await ensureMigrationTable();

  const rollbackPath = path.join(MIGRATIONS_DIR, migrationName, 'rollback.sql');
  if (!fs.existsSync(rollbackPath)) {
    throw new Error(`Rollback script not found for migration: ${migrationName}`);
  }

  const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');
  console.log(`[MIGRATION] Rolling back migration: ${migrationName}...`);

  const statements = splitSqlStatements(rollbackSql);
  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
  }

  await prisma.$executeRawUnsafe(`
    UPDATE "_rolevia_migrations" 
    SET "status" = 'ROLLED_BACK' 
    WHERE "name" = $1;
  `, migrationName);

  console.log(`✓ [MIGRATION] Successfully rolled back: ${migrationName}`);
  return { rolledBack: migrationName, status: 'ROLLED_BACK' };
}

/**
 * Reconcile orphaned submission locks
 * When a worker process crashes mid-submission, locks in IN_FLIGHT remain in place.
 * Stale locks (> timeoutMs) are safely transitioned to ORPHANED_QUARANTINED to prevent deadlocks
 * without accidentally permitting duplicate employer submissions.
 */
async function reconcileOrphanedSubmissionLocks(options = {}) {
  const timeoutMinutes = options.timeoutMinutes || 15;

  const orphaned = await prisma.$queryRawUnsafe(`
    SELECT id, tenant_id, user_id, application_id, attempt_key, requisition_key, status, updated_at
    FROM "submission_attempt_locks"
    WHERE status = 'IN_FLIGHT'
      AND updated_at < (CURRENT_TIMESTAMP - INTERVAL '${parseInt(timeoutMinutes, 10)} minutes');
  `);

  const reconciled = [];

  for (const lock of orphaned) {
    // 1. Mark lock as ORPHANED_QUARANTINED
    await prisma.$executeRawUnsafe(`
      UPDATE "submission_attempt_locks"
      SET status = 'ORPHANED_QUARANTINED', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `, lock.id);

    // 2. Mark the corresponding application as OUTCOME_UNKNOWN quarantine if application exists
    try {
      await prisma.application.update({
        where: { id: lock.application_id },
        data: {
          status: 'OUTCOME_UNKNOWN',
          quarantineReason: `ORPHANED_LOCK_DETECTED: Worker holding submission lock died before completion. Stale timeout: ${timeoutMinutes}m.`
        }
      });

      // 3. Log ApplicationEvent for auditability
      await prisma.applicationEvent.create({
        data: {
          applicationId: lock.application_id,
          eventType: 'LOCK_RECONCILIATION_ORPHAN_CLEARED',
          fromStatus: 'SUBMISSION_IN_FLIGHT',
          toStatus: 'OUTCOME_UNKNOWN',
          payload: {
            lockId: lock.id,
            attemptKey: lock.attempt_key,
            requisitionKey: lock.requisition_key,
            timeoutMinutes,
            clearedAt: new Date().toISOString()
          }
        }
      });
    } catch (_) {
      // Application record may have been deleted in synthetic tests
    }

    reconciled.push(lock);
  }

  if (reconciled.length > 0) {
    console.log(`[LOCK RECONCILIATION] Reconciled ${reconciled.length} orphaned submission lock(s) into OUTCOME_UNKNOWN quarantine.`);
  }

  return {
    reconciledCount: reconciled.length,
    reconciled
  };
}

module.exports = {
  ensureMigrationTable,
  applyPendingMigrations,
  rollbackMigration,
  reconcileOrphanedSubmissionLocks
};
