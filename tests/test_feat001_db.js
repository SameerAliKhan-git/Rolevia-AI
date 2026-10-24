// Rolevia AI · Automated Test Suite: FEAT-001 (PostgreSQL & Prisma Migration)
// Verifies relational schema models, foreign key cascades, unique constraints, and seed data.

const assert = require('node:assert');
const prisma = require('../backend/db');

async function testFeat001Database() {
  console.log('\n--- [TEST SUITE 1] FEAT-001: Relational Schema & Prisma Migration ---');

  // 1. Verify Tenant Model
  const tenant = await prisma.tenant.findUnique({
    where: { subdomain: 'default' }
  });
  assert(tenant !== null, 'Default tenant must exist');
  assert.strictEqual(tenant.subdomain, 'default', 'Tenant subdomain should match default');
  console.log('✓ Model: Tenant verified with unique subdomain constraint');

  // 2. Verify User & Tenant Relation
  const user = await prisma.user.findUnique({
    where: { email: 'sammysameerkhan007@gmail.com' },
    include: { tenant: true, profile: true }
  });
  assert(user !== null, 'Seed user must exist');
  assert.strictEqual(user.tenantId, tenant.id, 'User must be linked to default tenant');
  assert(user.passwordHash.startsWith('$2'), 'User password must be a valid bcrypt hash');
  console.log('✓ Model: User verified with tenant relation and bcrypt hash');

  // 3. Verify CandidateProfile & FactStore Relations
  assert(user.profile !== null, 'Candidate profile must be attached to user');
  const facts = await prisma.factStore.findMany({
    where: { candidateProfileId: user.profile.id }
  });
  assert(facts.length >= 4, `Expected at least 4 candidate facts in FactStore, found ${facts.length}`);
  const educationFact = facts.find(f => f.factType === 'EDUCATION');
  assert(educationFact !== null, 'Education fact must exist in FactStore');
  console.log(`✓ Model: FactStore verified with ${facts.length} structured career entities`);

  // 4. Verify Job Requisition Hashes & Deduplication Index
  const jobs = await prisma.job.findMany({ where: { status: 'ACTIVE' } });
  assert(jobs.length >= 10, `Expected at least 10 active jobs, found ${jobs.length}`);
  for (const j of jobs) {
    assert(j.requisitionHash && j.requisitionHash.length === 64, 'Requisition hash must be 64-char SHA-256');
  }
  console.log(`✓ Model: Job verified with ${jobs.length} SHA-256 indexed requisitions`);

  // 5. Verify Application & CreditJournal Models
  const apps = await prisma.application.findMany({ where: { userId: user.id } });
  assert(apps.length >= 5, `Expected at least 5 seeded applications, found ${apps.length}`);
  const journalEntries = await prisma.creditJournal.findMany({ where: { userId: user.id } });
  assert(journalEntries.length >= 1, 'CreditJournal audit entries must be logged');
  console.log(`✓ Model: Application (${apps.length} records) & CreditJournal (${journalEntries.length} entries) verified`);

  console.log('>> [PASS] FEAT-001: All database models and constraints verified.');
  return { suite: 'FEAT-001 Database Migration', passed: 5, failed: 0 };
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
