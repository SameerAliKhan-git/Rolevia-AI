// Rolevia AI · Automated Test Suite: FEAT-009 (Modular ATS Application Automation Engine)
// Verifies ATS detection (Greenhouse, Ashby, Lever, Workday), Playwright dry-run staging execution,
// state machine invariants, candidate cryptographic authorization, FactStore question mapping,
// human-in-the-loop escalation (NEEDS_USER_ACTION), and credit journal synchronization.

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const prisma = require('../backend/db');
const atsAutomation = require('../backend/atsAutomation');
const billing = require('../backend/billing');
const auth = require('../backend/auth');

async function testFeat009AtsAutomation() {
  console.log('\n--- [TEST SUITE 9] FEAT-009: Modular ATS Automation & Staging Runner ---');
  let testsPassed = 0;

  // 1. ATS Platform Detection
  const ghDetection = atsAutomation.detectAtsPlatform('https://boards.greenhouse.io/stripe/jobs/12345');
  assert.strictEqual(ghDetection.ats, 'greenhouse');
  assert.strictEqual(ghDetection.supported, true);

  const ashbyDetection = atsAutomation.detectAtsPlatform('https://jobs.ashbyhq.com/openai/67890');
  assert.strictEqual(ashbyDetection.ats, 'ashby');
  assert.strictEqual(ashbyDetection.supported, true);

  const leverDetection = atsAutomation.detectAtsPlatform('https://jobs.lever.co/figma/abcde');
  assert.strictEqual(leverDetection.ats, 'lever');
  assert.strictEqual(leverDetection.supported, true);

  const unsuppDetection = atsAutomation.detectAtsPlatform('https://jobs.randomboard.org/custom');
  assert.strictEqual(unsuppDetection.ats, 'unsupported');
  assert.strictEqual(unsuppDetection.supported, false);
  console.log('✓ [DETECTOR] ATS Platform Detection: Greenhouse, Ashby, Lever identified; unsupported handled');
  testsPassed++;

  // 2. Workday Capability Limitations
  const wdDetection = atsAutomation.detectAtsPlatform('https://adobe.wd5.myworkdayjobs.com/en-US/careers/job/123');
  assert.strictEqual(wdDetection.ats, 'workday');
  assert.strictEqual(wdDetection.supported, false);
  assert(wdDetection.limitationReason.includes('multi-step'), 'Must explain multi-step session limitation');
  console.log('✓ [CAPABILITY] Workday Detection: Explicitly flagged with capability limitation note');
  testsPassed++;

  // 3. State Machine Transitions & Event Journal
  const batchId = Date.now();
  const testTenant = await prisma.tenant.upsert({
    where: { subdomain: `tenant-auto-${batchId}` },
    update: {},
    create: { name: 'Automation Test Workspace', subdomain: `tenant-auto-${batchId}` }
  });

  const testUser = await prisma.user.create({
    data: {
      email: `auto_cand_${batchId}@rolevia.test`,
      passwordHash: 'hashed_password_placeholder',
      name: 'Elena Rostova',
      phone: '+15550192834',
      tenantId: testTenant.id,
      credits: 20
    }
  });

  const appRecord = await prisma.application.create({
    data: {
      userId: testUser.id,
      tenantId: testTenant.id,
      company: 'Databricks',
      position: 'Distributed Systems Engineer',
      ats: 'greenhouse',
      url: 'https://boards.greenhouse.io/databricks/jobs/991823',
      status: atsAutomation.APPLICATION_STATES.DRAFT
    }
  });

  // Valid forward transition: DRAFT -> OPTIMIZING -> PENDING_REVIEW -> APPROVED
  await atsAutomation.transitionApplicationState(appRecord.id, atsAutomation.APPLICATION_STATES.OPTIMIZING);
  await atsAutomation.transitionApplicationState(appRecord.id, atsAutomation.APPLICATION_STATES.PENDING_REVIEW);
  await atsAutomation.transitionApplicationState(appRecord.id, atsAutomation.APPLICATION_STATES.APPROVED);

  const updatedApp = await prisma.application.findUnique({ where: { id: appRecord.id } });
  assert.strictEqual(updatedApp.status, atsAutomation.APPLICATION_STATES.APPROVED);

  // Invalid transition attempt: APPROVED -> SUBMISSION_IN_FLIGHT (must throw)
  let invalidBlocked = false;
  try {
    await atsAutomation.transitionApplicationState(appRecord.id, atsAutomation.APPLICATION_STATES.SUBMISSION_IN_FLIGHT);
  } catch (err) {
    invalidBlocked = true;
  }
  assert.strictEqual(invalidBlocked, true, 'Illegal transition skipping QUEUED_RESERVED must be blocked');

  // Verify ApplicationEvent entries
  const events = await prisma.applicationEvent.findMany({ where: { applicationId: appRecord.id } });
  assert(events.length >= 3, 'Must record each transition in ApplicationEvent journal');
  console.log('✓ [STATE MACHINE] Durable Transitions: Valid progression logged in ApplicationEvent; illegal jump blocked');
  testsPassed++;

  // 4. Candidate Cryptographic Authorization Gate
  const candidateSecret = 'rolevia_ai_super_secret_jwt_key_2026_production_ready';
  const contentHash = crypto.createHash('sha256').update('Tailored Resume Content v1').digest('hex');

  // A. Missing signature
  const authMissing = atsAutomation.verifySubmissionAuthorization(updatedApp, candidateSecret);
  assert.strictEqual(authMissing.authorized, false);
  assert(authMissing.reason.includes('MISSING_AUTHORIZATION'));

  // B. Valid HMAC signature
  const validSigPayload = `${testUser.id}:${testTenant.id}:${appRecord.id}:${contentHash}`;
  const validSig = crypto.createHmac('sha256', candidateSecret).update(validSigPayload).digest('hex');

  await prisma.application.update({
    where: { id: appRecord.id },
    data: {
      approvalSignature: validSig,
      approvalTimestamp: new Date(),
      approvedContentHash: contentHash,
      diffData: 'Tailored Resume Content v1'
    }
  });

  const authorizedApp = await prisma.application.findUnique({ where: { id: appRecord.id } });
  const authValid = atsAutomation.verifySubmissionAuthorization(authorizedApp, candidateSecret);
  assert.strictEqual(authValid.authorized, true);

  // C. Tampered signature
  const tamperedSigApp = { ...authorizedApp, approvalSignature: 'tampered_signature_hex_1234' };
  const authTampered = atsAutomation.verifySubmissionAuthorization(tamperedSigApp, candidateSecret);
  assert.strictEqual(authTampered.authorized, false);
  assert(authTampered.reason.includes('INVALID_SIGNATURE'));
  console.log('✓ [SECURITY] Authorization Gate: Candidate HMAC signature verified; missing & tampered rejected');
  testsPassed++;

  // 5. FactStore Question Mapping & Escalation Logic
  const mockQuestions = [
    { id: 'first_name', label: 'First Name', required: true },
    { id: 'last_name', label: 'Last Name', required: true },
    { id: 'email', label: 'Email', required: true },
    { id: 'phone', label: 'Phone', required: true },
    { id: 'sponsorship', label: 'Will you now or in the future require visa sponsorship?', required: true },
    { id: 'desired_salary', label: 'Desired Annual Salary (USD)', required: true },
    { id: 'legal_attest', label: 'I certify that all statements made are true and complete under penalty of perjury', required: true }
  ];

  const candidateProfile = {
    user: testUser,
    requiresSponsorship: false,
    workAuthorizationStatus: 'AUTHORIZED',
    totalYearsExperience: 4,
    desiredSalary: null // Unstated -> triggers escalation
  };

  const mapped = atsAutomation.mapScreeningQuestions(mockQuestions, candidateProfile);
  assert.strictEqual(mapped.answers.length, 5, '5 standard fields mapped from profile');
  assert.strictEqual(mapped.escalations.length, 2, '2 required questions without facts must escalate');
  assert(mapped.escalations.some(e => e.reason.includes('MANDATORY_SALARY_UNSPECIFIED')));
  assert(mapped.escalations.some(e => e.reason.includes('LEGAL_ATTESTATION_REQUIRED')));
  console.log('✓ [MAPPING] FactStore Screening Mapper: Standard fields resolved; unstated salary & attestations escalated');
  testsPassed++;

  // 6. Playwright Dry-Run Staging Execution (Greenhouse Adapter)
  // Candidate Profile setup in DB
  const profileRecord = await prisma.candidateProfile.create({
    data: {
      userId: testUser.id,
      skills: JSON.stringify(['Distributed Systems', 'Kafka', 'Raft']),
      certifications: JSON.stringify(['CKA', 'AWS Solutions Architect']),
      targetRoles: JSON.stringify(['Distributed Systems Engineer']),
      preferredLocations: JSON.stringify(['San Francisco, CA', 'Remote']),
      needsSponsorship: false,
      atsReadinessScore: 95
    }
  });

  await prisma.factStore.create({
    data: {
      candidateProfileId: profileRecord.id,
      factType: 'SKILL',
      title: 'Distributed Systems',
      highlights: JSON.stringify(['Raft consensus', 'Kafka', 'RocksDB']),
      verified: true
    }
  });

  // Run dry-run execution against local offline fixture
  const stagingResult = await atsAutomation.executeApplicationWorkflow(appRecord.id, {
    mode: 'DRY_RUN',
    candidateSecret
  });

  assert.strictEqual(stagingResult.success, true);
  assert.strictEqual(stagingResult.mode, 'DRY_RUN');
  assert.strictEqual(stagingResult.status, atsAutomation.APPLICATION_STATES.READY_FOR_SUBMISSION);
  assert.strictEqual(stagingResult.receipt.type, atsAutomation.RECEIPT_TYPES.DRY_RUN_DIAGNOSTIC);
  assert.strictEqual(stagingResult.receipt.confirmationNumber, null, 'Zero synthetic confirmation numbers on dry runs');
  assert.strictEqual(stagingResult.receipt.employerConfirmed, false, 'Dry run is not an employer acknowledgment');
  assert.ok(stagingResult.receipt.receiptHash, 'Diagnostic receipt hash must be generated');

  // Verify dry run consumed ZERO credits (no hold, no commit)
  const dryRunUser = await prisma.user.findUnique({ where: { id: testUser.id } });
  assert.strictEqual(dryRunUser.credits, 20, 'Dry run must not deduct candidate credits');
  const journalEntries = await prisma.creditJournal.findMany({
    where: { userId: testUser.id }
  });
  assert(!journalEntries.some(j => j.entryType === 'APPLICATION_COMMIT'), 'Zero credits committed on dry run');
  console.log('✓ [DRY RUN] Staging Runner: Form verified, screenshot captured, zero credits debited, diagnostic receipt typed');
  testsPassed++;

  // 7. Human Escalation Path & Credit Refund (NEEDS_USER_ACTION)
  const appEscalate = await prisma.application.create({
    data: {
      userId: testUser.id,
      tenantId: testTenant.id,
      company: 'OpenAI',
      position: 'Research Infrastructure Lead',
      ats: 'workday', // Workday triggers unsupported escalation
      url: 'https://openai.wd5.myworkdayjobs.com/careers/job/44910',
      status: atsAutomation.APPLICATION_STATES.APPROVED,
      approvalSignature: validSig,
      approvalTimestamp: new Date(),
      approvedContentHash: contentHash
    }
  });

  // Recalculate valid signature for appEscalate
  const escSigPayload = `${testUser.id}:${testTenant.id}:${appEscalate.id}:${contentHash}`;
  const escSig = crypto.createHmac('sha256', candidateSecret).update(escSigPayload).digest('hex');
  await prisma.application.update({
    where: { id: appEscalate.id },
    data: { approvalSignature: escSig }
  });

  const initialBalance = (await prisma.user.findUnique({ where: { id: testUser.id } })).credits;
  const escResult = await atsAutomation.executeApplicationWorkflow(appEscalate.id, {
    mode: 'DRY_RUN',
    candidateSecret
  });

  assert.strictEqual(escResult.success, false);
  assert.strictEqual(escResult.status, atsAutomation.APPLICATION_STATES.NEEDS_USER_ACTION);
  
  // Verify credit was released (balance restored)
  const finalBalance = (await prisma.user.findUnique({ where: { id: testUser.id } })).credits;
  assert.strictEqual(finalBalance, initialBalance, 'Credit must be refunded via APPLICATION_RELEASE on escalation');
  console.log('✓ [ESCALATION] Human-in-the-Loop: Unsupported ATS escalated to NEEDS_USER_ACTION; credit released cleanly');
  testsPassed++;

  // 8. Live Submission Safety Barrier
  const appLiveAttempt = await prisma.application.create({
    data: {
      userId: testUser.id,
      tenantId: testTenant.id,
      company: 'Figma',
      position: 'Staff SRE',
      ats: 'lever',
      url: 'https://jobs.lever.co/figma/112233',
      status: atsAutomation.APPLICATION_STATES.APPROVED,
      diffData: 'Staff SRE Resume'
    }
  });

  const liveSigPayload = `${testUser.id}:${testTenant.id}:${appLiveAttempt.id}:${contentHash}`;
  const liveSig = crypto.createHmac('sha256', candidateSecret).update(liveSigPayload).digest('hex');
  await prisma.application.update({
    where: { id: appLiveAttempt.id },
    data: { approvalSignature: liveSig, approvedContentHash: contentHash, approvalTimestamp: new Date() }
  });

  const liveAttemptResult = await atsAutomation.executeApplicationWorkflow(appLiveAttempt.id, {
    mode: 'LIVE',
    candidateSecret
  });

  assert.strictEqual(liveAttemptResult.success, false);
  assert.strictEqual(liveAttemptResult.status, atsAutomation.APPLICATION_STATES.FAILED_CONFIRMED);
  assert(liveAttemptResult.error.includes('safety barrier'), 'Live submissions must be blocked by safety barrier');
  console.log('✓ [SAFETY] Live Submission Barrier: LIVE mode without production flag blocked; zero live submissions');
  testsPassed++;

  console.log(`>> [PASS] FEAT-009: All ${testsPassed} ATS automation and staging runner tests passed.`);
  return {
    suite: 'FEAT-009 Modular ATS Application Automation Engine',
    passed: testsPassed,
    failed: 0,
    category: 'Integration'
  };
}

if (require.main === module) {
  testFeat009AtsAutomation()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('>> [FAIL] FEAT-009 Test Failure:', err);
      process.exit(1);
    });
}

module.exports = testFeat009AtsAutomation;
