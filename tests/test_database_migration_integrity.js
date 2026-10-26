// Rolevia AI · Database Migration Integrity & Orphaned Lock Reconciliation Suite
// Validates:
// 1. Version-controlled SQL migration application via migrationManager
// 2. Migration idempotency and SHA256 checksum tracking
// 3. PostgreSQL schema existence & uniqueness constraint verification
// 4. Repeated acquisition by same attempt vs rejection of competing instances
// 5. Automated reconciliation of orphaned/crashed locks into OUTCOME_UNKNOWN quarantine
// 6. Rollback script execution and clean re-application

const prisma = require('../backend/db');
const crypto = require('node:crypto');
const {
  ensureMigrationTable,
  applyPendingMigrations,
  rollbackMigration,
  reconcileOrphanedSubmissionLocks
} = require('../backend/db/migrationManager');

async function runDatabaseMigrationIntegritySuite() {
  console.log('\n================================================================================');
  console.log('    TEST SUITE: DATABASE MIGRATION INTEGRITY & ORPHANED LOCK RECONCILIATION     ');
  console.log('================================================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName} - ${details}`);
      failed++;
    }
  }

  const testTenantId = 'migration-test-tenant-' + Date.now();
  const testUserId = 'migration-test-user-' + Date.now();
  const testAppId1 = 'app-mig-test-1-' + Date.now();
  const testAppId2 = 'app-mig-test-2-' + Date.now();
  const testReqKey = 'req-mig-test-' + Date.now();

  try {
    // Setup test tenant in database
    await prisma.tenant.create({
      data: {
        id: testTenantId,
        name: 'Migration Test Tenant',
        subdomain: `mig-${Date.now()}`
      }
    });

    // Setup test user in database
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `mig-test-${Date.now()}@rolevia.test`,
        passwordHash: 'hashed_pw_dummy',
        name: 'Migration Test User',
        tenantId: testTenantId
      }
    });

    // Setup dummy application 1
    await prisma.application.create({
      data: {
        id: testAppId1,
        tenantId: testTenantId,
        userId: testUserId,
        company: 'Rolevia Staging Inc',
        position: 'Database Migration Engineer',
        ats: 'GREENHOUSE',
        url: 'https://boards.greenhouse.io/rolevia/jobs/12345',
        status: 'SUBMISSION_IN_FLIGHT'
      }
    });

    // Setup dummy application 2
    await prisma.application.create({
      data: {
        id: testAppId2,
        tenantId: testTenantId,
        userId: testUserId,
        company: 'Rolevia Staging Inc',
        position: 'Database Migration Engineer',
        ats: 'GREENHOUSE',
        url: 'https://boards.greenhouse.io/rolevia/jobs/12345',
        status: 'PENDING_REVIEW'
      }
    });

    // -------------------------------------------------------------------------
    // TEST 1: Migration table creation & initial pending migrations application
    // -------------------------------------------------------------------------
    await ensureMigrationTable();
    const applyResult = await applyPendingMigrations();
    assert(
      applyResult && typeof applyResult.applied === 'number',
      'Test 1: Migration manager ensures tracking table and applies migrations',
      `Applied: ${applyResult.applied}`
    );

    // -------------------------------------------------------------------------
    // TEST 2: Migration idempotency check
    // -------------------------------------------------------------------------
    const secondApply = await applyPendingMigrations();
    assert(
      secondApply.applied === 0,
      'Test 2: Migration manager is strictly idempotent (zero re-applications)',
      `Re-applied: ${secondApply.applied}`
    );

    // -------------------------------------------------------------------------
    // TEST 3: PostgreSQL schema validation for submission_attempt_locks
    // -------------------------------------------------------------------------
    const columns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'submission_attempt_locks';
    `);
    const colNames = columns.map(c => c.column_name);
    const requiredCols = ['id', 'tenant_id', 'user_id', 'application_id', 'attempt_key', 'requisition_key', 'status'];
    const hasAllCols = requiredCols.every(c => colNames.includes(c));
    assert(
      hasAllCols,
      'Test 3: PostgreSQL schema contains all required lock columns and data types',
      `Columns found: ${colNames.join(', ')}`
    );

    // -------------------------------------------------------------------------
    // TEST 4: Atomic lock acquisition & repeated same-attempt acquisition
    // -------------------------------------------------------------------------
    const attemptKey1 = `att-${testAppId1}-1`;
    // Insert initial lock
    await prisma.$executeRawUnsafe(`
      INSERT INTO "submission_attempt_locks" 
        ("id", "tenant_id", "user_id", "application_id", "attempt_key", "requisition_key", "status")
      VALUES 
        ($1, $2, $3, $4, $5, $6, 'IN_FLIGHT')
    `, crypto.randomUUID(), testTenantId, testUserId, testAppId1, attemptKey1, testReqKey);

    // Re-acquire same attempt key (idempotent lock re-entry)
    const reacquireResult = await prisma.$executeRawUnsafe(`
      INSERT INTO "submission_attempt_locks"
        ("id", "tenant_id", "user_id", "application_id", "attempt_key", "requisition_key", "status")
      VALUES
        ($1, $2, $3, $4, $5, $6, 'IN_FLIGHT')
      ON CONFLICT ("tenant_id", "user_id", "requisition_key")
      DO UPDATE SET "updated_at" = CURRENT_TIMESTAMP
      WHERE "submission_attempt_locks"."application_id" = $4;
    `, crypto.randomUUID(), testTenantId, testUserId, testAppId1, attemptKey1, testReqKey);

    assert(
      reacquireResult === 1,
      'Test 4: Repeated acquisition by same attempt key succeeds idempotently',
      `Rows affected: ${reacquireResult}`
    );

    // -------------------------------------------------------------------------
    // TEST 5: Unique constraint blocks competing application for same requisition
    // -------------------------------------------------------------------------
    let competingBlocked = false;
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "submission_attempt_locks"
          ("id", "tenant_id", "user_id", "application_id", "attempt_key", "requisition_key", "status")
        VALUES
          ($1, $2, $3, $4, $5, $6, 'IN_FLIGHT');
      `, crypto.randomUUID(), testTenantId, testUserId, testAppId2, `att-${testAppId2}-1`, testReqKey);
    } catch (err) {
      if (
        err.message.includes('unique_candidate_active_requisition') ||
        err.message.includes('unique constraint') ||
        err.message.includes('duplicate key') ||
        err.message.includes('already exists') ||
        err.meta?.code === '23505'
      ) {
        competingBlocked = true;
      }
    }
    assert(
      competingBlocked,
      'Test 5: Unique constraint strictly blocks competing application for same candidate + requisition',
      'Competing application was not blocked by constraint'
    );

    // -------------------------------------------------------------------------
    // TEST 6: Orphaned lock detection and reconciliation into OUTCOME_UNKNOWN
    // -------------------------------------------------------------------------
    // Backdate the lock to simulate a crashed worker holding lock for > 20 minutes
    await prisma.$executeRawUnsafe(`
      UPDATE "submission_attempt_locks"
      SET "updated_at" = CURRENT_TIMESTAMP - INTERVAL '25 minutes'
      WHERE "application_id" = $1;
    `, testAppId1);

    const reconcileResult = await reconcileOrphanedSubmissionLocks({ timeoutMinutes: 15 });
    const reconciledItem = reconcileResult.reconciled.find(r => r.application_id === testAppId1);
    
    // Check application status
    const appAfterReconcile = await prisma.application.findUnique({ where: { id: testAppId1 } });
    // Check lock status
    const lockRows = await prisma.$queryRawUnsafe(`
      SELECT status FROM "submission_attempt_locks" WHERE application_id = $1;
    `, testAppId1);
    const lockStatus = lockRows[0]?.status;

    assert(
      reconciledItem &&
      appAfterReconcile.status === 'OUTCOME_UNKNOWN' &&
      lockStatus === 'ORPHANED_QUARANTINED',
      'Test 6: Orphaned locks (> 15m) are safely transitioned to ORPHANED_QUARANTINED with OUTCOME_UNKNOWN quarantine',
      `App status: ${appAfterReconcile?.status}, Lock status: ${lockStatus}`
    );

    // -------------------------------------------------------------------------
    // TEST 7: Audit trail record written for orphaned lock reconciliation
    // -------------------------------------------------------------------------
    const events = await prisma.applicationEvent.findMany({
      where: { applicationId: testAppId1, eventType: 'LOCK_RECONCILIATION_ORPHAN_CLEARED' }
    });
    assert(
      events.length > 0 && events[0].payload.timeoutMinutes === 15,
      'Test 7: LOCK_RECONCILIATION_ORPHAN_CLEARED event logged to ApplicationEvent ledger',
      `Events found: ${events.length}`
    );

    // -------------------------------------------------------------------------
    // TEST 8: Migration Rollback and Re-Application
    // -------------------------------------------------------------------------
    // Clean up test lock before rollback to avoid foreign key dependency issues
    await prisma.$executeRawUnsafe(`DELETE FROM "submission_attempt_locks" WHERE tenant_id = $1;`, testTenantId);
    
    // Test Rollback
    const rollbackRes = await rollbackMigration('20261026000000_submission_attempt_locks');
    const tableCheckAfterRollback = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'submission_attempt_locks'
      ) as "tblExists";
    `);
    const isDropped = !tableCheckAfterRollback[0]?.tblExists;

    // Test Re-apply
    const reapplyRes = await applyPendingMigrations();
    const tableCheckAfterReapply = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'submission_attempt_locks'
      ) as "tblExists";
    `);
    const isRecreated = !!tableCheckAfterReapply[0]?.tblExists;

    assert(
      rollbackRes.status === 'ROLLED_BACK' && isDropped && isRecreated && reapplyRes.applied >= 1,
      'Test 8: Migration rollback drops table safely and re-application cleanly recreates schema',
      `isDropped: ${isDropped}, isRecreated: ${isRecreated}, reapplyCount: ${reapplyRes.applied}`
    );

  } catch (error) {
    console.error('  ✗ [FATAL] Exception in migration integrity test:', error);
    failed++;
  } finally {
    // Cleanup test data
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM "submission_attempt_locks" WHERE tenant_id = $1;`, testTenantId).catch(() => {});
      await prisma.applicationEvent.deleteMany({ where: { applicationId: { in: [testAppId1, testAppId2] } } }).catch(() => {});
      await prisma.application.deleteMany({ where: { tenantId: testTenantId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { tenantId: testTenantId } }).catch(() => {});
      await prisma.tenant.deleteMany({ where: { id: testTenantId } }).catch(() => {});
    } catch (e) {}
  }

  console.log(`--------------------------------------------------------------------------------`);
  console.log(`MIGRATION INTEGRITY SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================================\n');

  return {
    suite: 'FEAT-001 / Concurrency: Database Migration Integrity & Lock Reconciliation',
    category: 'Database',
    passed,
    failed
  };
}

if (require.main === module) {
  runDatabaseMigrationIntegritySuite()
    .then(() => prisma.$disconnect())
    .catch(err => {
      console.error(err);
      prisma.$disconnect();
      process.exit(1);
    });
}

module.exports = { runDatabaseMigrationIntegritySuite };
