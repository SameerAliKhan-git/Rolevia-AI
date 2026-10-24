// Rolevia AI · Automated E2E Suite: Full Candidate User Lifecycle
// Tests complete user journey:
// Registration -> Login -> Resume Upload -> Fact Verification -> Profile Persistence
// -> Job Discovery -> Credit Reservation (HOLD) -> Submission Commit (COMMIT) -> Logout & Token Revocation.

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const auth = require('../backend/auth');
const resumeParser = require('../backend/resumeParser');
const billing = require('../backend/billing');
const prisma = require('../backend/db');

async function testE2EUserJourney() {
  console.log('\n--- [TEST SUITE E2E] Full Candidate Lifecycle & Journey Verification ---');
  let testsPassed = 0;

  // Step 1: User & Tenant Registration
  const timestamp = Date.now();
  const candidateEmail = `journey_candidate_${timestamp}@rolevia.test`;
  const regResult = await auth.registerUser({
    email: candidateEmail,
    password: 'RoleviaE2EPass2026!',
    name: 'Sarah Connor',
    phone: '+1-555-0144',
    tenantSubdomain: `journey-org-${timestamp}`
  });

  assert.strictEqual(regResult.success, true, 'Registration must succeed');
  assert(regResult.accessToken, 'Access token issued');
  assert(regResult.refreshToken, 'Refresh token issued');
  assert.strictEqual(regResult.user.credits, 50, 'Initial available credits must be 50');
  console.log('✓ [E2E 1/8] Registration: New tenant candidate registered with 50 credits and token pair');
  testsPassed++;

  const candidateId = regResult.user.id;
  const tenantId = regResult.user.tenantId;

  // Step 2: Credential Verification & Session Login
  const loginResult = await auth.loginUser({
    email: candidateEmail,
    password: 'RoleviaE2EPass2026!',
    userAgent: 'RoleviaClient/1.0',
    ipAddress: '127.0.0.1'
  });
  assert.strictEqual(loginResult.success, true, 'Login must succeed');
  assert(loginResult.accessToken, 'Access token generated');
  assert(loginResult.refreshToken, 'Rotating refresh token generated');
  console.log('✓ [E2E 2/8] Login: Authenticated credentials, issued 15-minute access token and PostgreSQL refresh session');
  testsPassed++;

  // Step 3: Resume Binary Ingestion & Parsing
  const resumePath = path.join(__dirname, '..', 'fixtures', 'resume_two_column_modern.pdf');
  assert(fs.existsSync(resumePath), 'Synthetic resume fixture must exist');
  const resumeBuffer = fs.readFileSync(resumePath);

  const syncResult = await resumeParser.parseAndSyncResume(candidateId, resumeBuffer);
  assert.strictEqual(syncResult.success, true, 'Resume parsing and synchronization must succeed');
  assert(syncResult.parsed.skills.length >= 6, 'Skills extracted from resume');
  assert(syncResult.parsed.evaluation.totalScore >= 85, 'Format ATS Readability score evaluated dynamically');
  console.log(`✓ [E2E 3/8] Resume Ingestion: Extracted ${syncResult.parsed.skills.length} skills, ATS Score ${syncResult.parsed.evaluation.totalScore}/100`);
  testsPassed++;

  // Step 4: FactStore Career Entity Verification
  const facts = await prisma.factStore.findMany({
    where: { candidateProfile: { userId: candidateId } }
  });
  assert(facts.length >= 2, `Expected at least 2 career facts, found ${facts.length}`);
  const hasVerified = facts.every(f => f.verified === true && f.confidence >= 0.9);
  assert.strictEqual(hasVerified, true, 'All extracted facts must be verified with high confidence (>=0.9)');
  console.log(`✓ [E2E 4/8] FactStore: Verified ${facts.length} career entities persisted with structured highlights`);
  testsPassed++;

  // Step 5: CandidateProfile Persistence
  const profile = await prisma.candidateProfile.findUnique({
    where: { userId: candidateId }
  });
  assert(profile !== null, 'Candidate profile must exist');
  assert(profile.rawResumeText.length > 100, 'Raw text persisted');
  assert.strictEqual(profile.atsReadinessScore, syncResult.parsed.evaluation.totalScore, 'Score matches evaluation');
  console.log('✓ [E2E 5/8] Profile: CandidateProfile record validated in PostgreSQL with ATS readiness score');
  testsPassed++;

  // Step 6: Job Discovery
  const jobs = await prisma.job.findMany({
    where: { status: 'ACTIVE' },
    take: 1
  });
  assert(jobs.length >= 1, 'Active opportunities must exist in catalog');
  const targetJob = jobs[0];
  console.log(`✓ [E2E 6/8] Job Discovery: Selected active opportunity '${targetJob.title}' at ${targetJob.company}`);
  testsPassed++;

  // Step 7: Credit Reservation (HOLD) -> Submission Commit (COMMIT)
  const appId = `journey-app-${timestamp}`;
  await prisma.application.create({
    data: {
      id: appId,
      tenantId: tenantId,
      userId: candidateId,
      jobId: targetJob.id,
      company: targetJob.company,
      position: targetJob.title,
      ats: targetJob.ats,
      url: targetJob.url,
      status: 'DRAFT'
    }
  });

  // Execute HOLD
  const holdRes = await billing.reserveCreditForApplication({
    tenantId,
    userId: candidateId,
    applicationId: appId,
    requisitionId: targetJob.requisitionHash
  });
  assert.strictEqual(holdRes.availableCredits, 49, 'Available credits decremented from 50 to 49');
  assert.strictEqual(holdRes.reservedCredits, 1, 'Reserved credits incremented from 0 to 1');
  assert.strictEqual(holdRes.consumedCredits, 0, 'Consumed credits remained 0');

  // Execute COMMIT upon simulated application submission lifecycle
  // (Verifies transactional credit journal; external employer submission is executed via FEAT-009 runner)
  const commitRes = await billing.commitCreditForApplication({
    tenantId,
    userId: candidateId,
    applicationId: appId,
    confirmationNumber: `CONF-SIMULATED-${timestamp}`,
    receiptData: { portal: targetJob.ats, confirmedAt: new Date().toISOString(), mode: 'SIMULATED_TEST' }
  });
  assert.strictEqual(commitRes.availableCredits, 49, 'Available credits must remain 49 (NO double deduction)');
  assert.strictEqual(commitRes.reservedCredits, 0, 'Reserved credits decremented to 0');
  assert.strictEqual(commitRes.consumedCredits, 1, 'Consumed credits incremented to 1');
  assert.strictEqual(commitRes.status, 'SUBMITTED', 'Application status transitioned to SUBMITTED');

  // Verify full ledger invariant
  const creditSummary = await billing.getUserCreditSummary(candidateId);
  assert.strictEqual(creditSummary.availableCredits, 49);
  assert.strictEqual(creditSummary.reservedCredits, 0);
  assert.strictEqual(creditSummary.consumedCredits, 1);
  assert.strictEqual(creditSummary.totalGrantedCredits, 50);
  assert.strictEqual(creditSummary.isBalanced, true, 'Triple credit balance invariant satisfied');
  console.log('✓ [E2E 7/8] Credit Lifecycle & Simulated Submission: HOLD (50->49 avail, 1 res) -> COMMIT (49 avail, 0 res, 1 cons) balanced with 0 double-debits');
  testsPassed++;

  // Step 8: User Session Logout & Refresh Token Revocation
  const revokeSuccess = await auth.revokeRefreshToken(loginResult.refreshToken);
  assert.strictEqual(revokeSuccess, true, 'Revocation must return true');

  // Attempt to use revoked refresh token must be rejected
  let reuseFailed = false;
  try {
    await auth.rotateRefreshToken(loginResult.refreshToken, 'AttackerAgent/1.0', '192.168.1.5');
  } catch (err) {
    reuseFailed = true;
  }
  assert.strictEqual(reuseFailed, true, 'Reuse of revoked session token must be blocked');
  console.log('✓ [E2E 8/8] Logout: Session refresh token revoked; subsequent token reuse strictly blocked');
  testsPassed++;

  // Clean up journey tenant
  await prisma.tenant.delete({ where: { id: tenantId } });

  console.log(`>> [PASS] Full E2E User Journey: All ${testsPassed} steps verified successfully.`);
  return {
    suite: 'E2E Full Candidate User Journey',
    passed: testsPassed,
    failed: 0,
    category: 'End-to-End'
  };
}

if (require.main === module) {
  testE2EUserJourney()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('>> [FAIL] E2E User Journey Failure:', err);
      process.exit(1);
    });
}

module.exports = testE2EUserJourney;
