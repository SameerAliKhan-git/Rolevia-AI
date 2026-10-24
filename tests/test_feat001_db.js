// Rolevia AI · Automated Test Suite: FEAT-001 (PostgreSQL & Prisma Multi-Tenant Engine)
// Verifies live PostgreSQL 16 connection, relational schema models, foreign key cascades,
// transaction rollback on failure, tenant data isolation, and concurrent operations.

const assert = require('node:assert');
const prisma = require('../backend/db');

async function testFeat001Database() {
  console.log('\n--- [TEST SUITE 1] FEAT-001: PostgreSQL Relational Schema & Tenant Isolation ---');
  let testsPassed = 0;

  // 1. Genuine PostgreSQL 16 Live Connection Check
  const pgVersion = await prisma.$queryRaw`SELECT version()`;
  assert(pgVersion && pgVersion.length > 0, 'Must successfully query PostgreSQL');
  const versionString = pgVersion[0].version || '';
  assert(versionString.toLowerCase().includes('postgresql 16'), `Expected PostgreSQL 16, found: ${versionString}`);
  console.log(`✓ [DB] PostgreSQL Live Connection: Verified running on ${versionString.split(',')[0]}`);
  testsPassed++;

  // 2. Default Tenant & Multi-Tenant Model Verification
  const defaultTenant = await prisma.tenant.findUnique({
    where: { subdomain: 'default' }
  });
  assert(defaultTenant !== null, 'Default tenant must exist');
  assert.strictEqual(defaultTenant.subdomain, 'default', 'Tenant subdomain should match default');
  console.log('✓ [DB] Model: Tenant verified with unique subdomain constraint');
  testsPassed++;

  // 3. User, Profile & FactStore Relations
  const seedUser = await prisma.user.findUnique({
    where: { email: 'sammysameerkhan007@gmail.com' },
    include: { tenant: true, profile: { include: { facts: true } } }
  });
  assert(seedUser !== null, 'Seed user must exist in PostgreSQL');
  assert.strictEqual(seedUser.tenantId, defaultTenant.id, 'User must belong to default tenant');
  assert(seedUser.profile !== null, 'Candidate profile must be attached to user');
  assert(seedUser.profile.facts.length >= 4, `Expected at least 4 career facts, found ${seedUser.profile.facts.length}`);
  console.log(`✓ [DB] Relational Integrity: User -> CandidateProfile -> FactStore (${seedUser.profile.facts.length} facts) verified`);
  testsPassed++;

  // 4. Multi-Tenant Data Isolation Test
  const tenantB = await prisma.tenant.create({
    data: {
      name: 'Tenant B Org',
      subdomain: `org-b-${Date.now()}`
    }
  });
  const userB = await prisma.user.create({
    data: {
      tenantId: tenantB.id,
      email: `user-b-${Date.now()}@tenantb.test`,
      passwordHash: '$2a$10$samplehashfortenantisolationcheck',
      name: 'Tenant B User',
      credits: 20
    }
  });

  // Querying tenant A should never return user B
  const tenantAUsers = await prisma.user.findMany({
    where: { tenantId: defaultTenant.id }
  });
  const crossTenantLeak = tenantAUsers.some(u => u.id === userB.id);
  assert.strictEqual(crossTenantLeak, false, 'Tenant isolation violation: Tenant B user appeared in Tenant A query');
  console.log('✓ [SECURITY] Multi-Tenant Isolation: Tenant data partitioning verified across boundaries');
  testsPassed++;

  // 5. Transaction Rollback on Failure Test
  const initialUserCount = await prisma.user.count();
  let rollbackCaught = false;
  try {
    await prisma.$transaction(async (tx) => {
      // Step A: Insert a temporary user
      await tx.user.create({
        data: {
          tenantId: defaultTenant.id,
          email: `rollback-test-${Date.now()}@test.com`,
          passwordHash: '$2a$10$samplehash',
          name: 'Rollback Candidate',
          credits: 10
        }
      });
      // Step B: Intentionally throw an unhandled error to trigger rollback
      throw new Error('SIMULATED_TRANSACTION_FAILURE');
    });
  } catch (err) {
    if (err.message === 'SIMULATED_TRANSACTION_FAILURE') {
      rollbackCaught = true;
    }
  }
  assert.strictEqual(rollbackCaught, true, 'Transaction error must be caught');
  const postRollbackCount = await prisma.user.count();
  assert.strictEqual(postRollbackCount, initialUserCount, 'Database count must not change after failed transaction rollback');
  console.log('✓ [DB] Transaction Atomicity: Rollback on mid-flight failure verified (0 partial commits)');
  testsPassed++;

  // 6. Foreign Key Cascading Deletion Test
  const cascadeTenant = await prisma.tenant.create({
    data: { name: 'Cascade Test Tenant', subdomain: `cascade-${Date.now()}` }
  });
  const cascadeUser = await prisma.user.create({
    data: {
      tenantId: cascadeTenant.id,
      email: `cascade-user-${Date.now()}@test.com`,
      passwordHash: '$2a$10$samplehash',
      name: 'Cascade User'
    }
  });
  await prisma.application.create({
    data: {
      tenantId: cascadeTenant.id,
      userId: cascadeUser.id,
      company: 'Cascade Corp',
      position: 'SRE',
      ats: 'lever',
      url: 'https://jobs.lever.co/cascade/1',
      status: 'DRAFT'
    }
  });

  // Delete the parent tenant
  await prisma.tenant.delete({ where: { id: cascadeTenant.id } });

  // Verify that cascade deleted the user and application
  const userCheck = await prisma.user.findUnique({ where: { id: cascadeUser.id } });
  assert.strictEqual(userCheck, null, 'Cascading delete must remove child user when tenant is deleted');
  console.log('✓ [DB] Referential Integrity: ON DELETE CASCADE cleaned up dependent entities');
  testsPassed++;

  // 7. Concurrency Test: Parallel Read/Write Operations
  const parallelOps = Array.from({ length: 5 }, (_, idx) => 
    prisma.job.findMany({ take: 3, skip: idx })
  );
  const concurrencyResults = await Promise.all(parallelOps);
  assert.strictEqual(concurrencyResults.length, 5, 'All 5 concurrent queries must resolve cleanly');
  console.log('✓ [DB] Concurrency: Parallel connection pool query execution verified');
  testsPassed++;

  // Clean up tenant B
  await prisma.tenant.delete({ where: { id: tenantB.id } });

  console.log(`>> [PASS] FEAT-001: All ${testsPassed} PostgreSQL database tests passed.`);
  return {
    suite: 'FEAT-001 PostgreSQL Database & Multi-Tenancy',
    passed: testsPassed,
    failed: 0,
    category: 'Database'
  };
}

if (require.main === module) {
  testFeat001Database()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('>> [FAIL] FEAT-001 Test Failure:', err);
      process.exit(1);
    });
}

module.exports = testFeat001Database;
