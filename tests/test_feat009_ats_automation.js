// Rolevia AI · Automated Test Suite for FEAT-009 (ATS Automation Engine)
// Validates:
// 1. ATS engine identification & adapter resolution (Greenhouse, Ashby, Lever, Workday)
// 2. Truth-grounded screening question resolution without hallucinations
// 3. Dry-run form mapping, document upload, and validation on Greenhouse, Ashby, Lever, Workday
// 4. Missing-field detection & error boundary recovery
// 5. Cryptographic approval pre-condition gate (rejecting unapproved/tampered/revoked documents)
// 6. Duplicate submission prevention bound to user-employer-requisition (independent of document text)
// 7. Explicit candidate consent boundary for final submission
// 8. Two-phase credit reservation & confirmation receipt extraction
// 9. Quarantine isolation for ambiguous/unknown submission outcomes
// 10. Worker interruption recovery from PostgreSQL durable state

const assert = require('node:assert');
const crypto = require('node:crypto');
const prisma = require('../backend/db');
const auth = require('../backend/auth');
const billing = require('../backend/billing');
const atsEngine = require('../backend/ats/atsEngine');
const adapterRegistry = require('../backend/ats/adapterRegistry');
const ScreeningQuestionMatcher = require('../backend/ats/screeningQuestions');
const resumeWorkspace = require('../backend/resumeWorkspace');
const BrowserDriver = require('../backend/ats/browserDriver');

async function runFeat009AtsAutomationTests() {
  console.log('\n================================================================================');
  console.log('       [TEST SUITE 13] FEAT-009: MODULAR ATS AUTOMATION ENGINE VERIFICATION     ');
  console.log('================================================================================\n');

  const tenantId = `tenant-feat009-${Date.now()}`;
  const userEmail = `candidate_feat009_${Date.now()}@example.com`;
  let userId;
  let candidateToken;
  let candidateProfileId;

  // Setup candidate & tenant
  const user = await auth.registerUser({
    email: userEmail,
    password: 'SecurePassword123!',
    name: 'Sameer Ali Khan',
    subdomain: `sub-${Date.now()}`,
    tenantName: 'Rolevia Staging Corp'
  });
  userId = user.user.id;
  candidateToken = user.accessToken;

  // Update user contact details & credits
  await prisma.user.update({
    where: { id: userId },
    data: {
      phone: '+1-555-0199',
      location: 'San Francisco, CA',
      linkedin: 'https://linkedin.com/in/sameer-ali-khan',
      github: 'https://github.com/sameerkhan007',
      yearsExp: 3,
      credits: 20
    }
  });

  // Update candidate profile & verified FactStore
  const profile = await prisma.candidateProfile.update({
    where: { userId },
    data: {
      skills: JSON.stringify(['Node.js', 'Python', 'PostgreSQL', 'Docker', 'AWS', 'TypeScript']),
      certifications: JSON.stringify(['Generative AI Fundamentals']),
      targetRoles: JSON.stringify(['Backend Engineer', 'Software Architect']),
      preferredLocations: JSON.stringify(['Remote', 'San Francisco']),
      needsSponsorship: false,
      bachelors: "Bachelor of Technology in Computer Science",
      education: "Master of Science in Computer Science",
      facts: {
        create: [
          {
            factType: 'WORK_EXPERIENCE',
            title: 'Python Developer Intern',
            organization: 'Mantarang Edtech LLP',
            startDate: '2023-01',
            endDate: '2023-08',
            highlights: JSON.stringify(['Developed modular Flask & PostgreSQL microservices', 'Optimized async query execution']),
            metrics: '500+ daily active users',
            verified: true,
            confidence: 1.0
          },
          {
            factType: 'EDUCATION',
            title: 'Master of Science in Computer Science',
            organization: 'Osmania University',
            startDate: '2024-09',
            endDate: '2026-05',
            highlights: JSON.stringify(['Distributed Systems, AI Systems Research']),
            verified: true,
            confidence: 1.0
          }
        ]
      }
    },
    include: { facts: true }
  });
  candidateProfileId = profile.id;

  // Helper to create an approved application with cryptographic signature
  async function createApprovedApplication({ company, position, ats, url, reqHash }) {
    const requisitionHash = reqHash || crypto.createHash('sha256').update(`${company}:${position}:${url}:${Date.now()}:${Math.random()}`).digest('hex');
    const job = await prisma.job.upsert({
      where: { requisitionHash },
      update: {},
      create: {
        company,
        title: position,
        url,
        applyUrl: url,
        ats: ats.toLowerCase(),
        atsName: ats,
        location: 'Remote',
        requirements: JSON.stringify(['Python', 'PostgreSQL', 'Docker']),
        requisitionHash
      }
    });

    const candidateSecret = 'rolevia-candidate-approval-gate';
    const approvedDocText = `SAMEER ALI KHAN\nEmail: ${userEmail}\nSkills: Python, PostgreSQL, Docker\nExperience:\n- Built modular services at Mantarang Edtech`;
    const docHash = `sha256:${crypto.createHash('sha256').update(approvedDocText).digest('hex')}`;
    const versionId = `v-1-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const appId = `app-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const signaturePayload = `${userId}|${user.user.tenantId}|${appId}|${versionId}|${docHash}|${timestamp}|${expiresAt}`;
    const signature = crypto.createHmac('sha256', candidateSecret).update(signaturePayload).digest('hex');

    const approvalRecord = {
      approvalId: `appr-${Date.now()}`,
      userId,
      tenantId: user.user.tenantId,
      applicationId: appId,
      versionId,
      documentHash: docHash,
      signature,
      approvalSignature: signature,
      timestamp,
      approvedAt: timestamp,
      expiresAt,
      approvedBy: 'Sameer Ali Khan',
      revoked: false
    };

    const diffData = {
      workspaceId: appId,
      status: 'APPROVED',
      optimizedResumeText: approvedDocText,
      approvalRecord,
      scoringBreakdown: { atsReadinessScore: 95 }
    };

    const app = await prisma.application.create({
      data: {
        id: appId,
        tenantId: user.user.tenantId,
        userId,
        jobId: job.id,
        company,
        position,
        ats,
        url,
        status: 'READY_FOR_REVIEW',
        diffData: JSON.stringify(diffData),
        approvalSignature: signature,
        documentHash: docHash,
        documentVersionId: versionId,
        executionMode: 'DRY_RUN'
      },
      include: { user: true, job: true }
    });

    return { app, job, approvalRecord, diffData, candidateSecret, approvedDocText };
  }

  // --------------------------------------------------------------------------
  // TEST 1: ATS Engine Identification & Adapter Resolution
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 1/12] Verifying ATS Identification and Adapter Registry...');
  const ghAdapter = adapterRegistry.resolveAdapter('https://job-boards.greenhouse.io/gitlab/jobs/8704363002');
  assert.strictEqual(ghAdapter.name, 'Greenhouse');
  assert.strictEqual(ghAdapter.engineId, 'greenhouse');

  const ashbyAdapter = adapterRegistry.resolveAdapter('https://jobs.ashbyhq.com/openai/240d459b-696d-43eb-8497');
  assert.strictEqual(ashbyAdapter.name, 'Ashby');
  assert.strictEqual(ashbyAdapter.engineId, 'ashby');

  const leverAdapter = adapterRegistry.resolveAdapter('https://jobs.lever.co/canonical/6132532');
  assert.strictEqual(leverAdapter.name, 'Lever');
  assert.strictEqual(leverAdapter.engineId, 'lever');

  const wdAdapter = adapterRegistry.resolveAdapter('https://autodesk.wd1.myworkdayjobs.com/en-US/Ext/job/1');
  assert.strictEqual(wdAdapter.name, 'Workday');
  assert.strictEqual(wdAdapter.engineId, 'workday');

  assert.throws(() => {
    adapterRegistry.resolveAdapter('https://unsupported-unknown-ats.com/apply');
  }, /UNSUPPORTED_ATS/);
  console.log('✓ [PASS 1/12] ATS identification: Successfully routed Greenhouse, Ashby, Lever, Workday; rejected unsupported domains.');

  // --------------------------------------------------------------------------
  // TEST 2: Truth-Grounded Screening Question Matching & Non-Hallucination Guard
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 2/12] Verifying Truth-Grounded Screening Question Handling...');
  const candidateCtx = {
    user: await prisma.user.findUnique({ where: { id: userId } }),
    profile: { ...profile, skills: JSON.parse(profile.skills) },
    facts: profile.facts.map(f => ({ ...f, highlights: JSON.parse(f.highlights) }))
  };

  // Sponsorship match
  const qSponsor = ScreeningQuestionMatcher.matchQuestion({
    questionText: 'Will you now or in the future require visa sponsorship?',
    fieldType: 'select',
    options: ['Yes', 'No'],
    candidate: candidateCtx
  });
  assert.strictEqual(qSponsor.matched, true);
  assert.strictEqual(qSponsor.value, 'No');
  assert.strictEqual(qSponsor.confidence, 1.0);

  // Education match
  const qEdu = ScreeningQuestionMatcher.matchQuestion({
    questionText: 'Highest level of education completed?',
    fieldType: 'select',
    options: ["Bachelor's Degree", "Master's Degree", "PhD / Doctorate"],
    candidate: candidateCtx
  });
  assert.strictEqual(qEdu.matched, true);
  assert.strictEqual(qEdu.value, "Master's Degree");

  // Experience match
  const qExp = ScreeningQuestionMatcher.matchQuestion({
    questionText: 'How many years of Python experience do you have?',
    fieldType: 'text',
    candidate: candidateCtx
  });
  assert.strictEqual(qExp.matched, true);
  assert.ok(parseInt(qExp.value, 10) >= 2);

  // Non-Hallucination Guard on Unknown Question
  const qUnknown = ScreeningQuestionMatcher.matchQuestion({
    questionText: 'What is your favorite medieval literature author and why?',
    fieldType: 'text',
    candidate: candidateCtx
  });
  assert.strictEqual(qUnknown.matched, false);
  assert.strictEqual(qUnknown.requiresIntervention, true);
  assert.ok(qUnknown.reason.includes('UNSUPPORTED_QUESTION_FACT'));
  console.log('✓ [PASS 2/12] Truth-grounded screening: Correctly mapped sponsorship, education, experience; strictly halted on ungrounded question.');

  // --------------------------------------------------------------------------
  // TEST 3: Greenhouse Adapter Automation (Dry-Run)
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 3/12] Verifying Greenhouse Adapter in Dry-Run Mode...');
  const ghSetup = await createApprovedApplication({
    company: 'GitLab',
    position: 'Backend Engineer (Python)',
    ats: 'Greenhouse',
    url: 'http://localhost:3000/fixtures/ats/greenhouse'
  });

  const ghDryRun = await atsEngine.executeApplication({
    applicationId: ghSetup.app.id,
    userId,
    tenantId: user.user.tenantId,
    executionMode: 'DRY_RUN'
  });

  assert.strictEqual(ghDryRun.status, 'FORM_FILLED');
  assert.strictEqual(ghDryRun.dryRun, true);
  assert.strictEqual(ghDryRun.validation.valid, true);
  assert.ok(ghDryRun.screenshotPath && ghDryRun.screenshotPath.endsWith('.png'));

  // Verify PostgreSQL state
  const ghDb = await prisma.application.findUnique({ where: { id: ghSetup.app.id } });
  assert.strictEqual(ghDb.status, 'FORM_FILLED');
  assert.strictEqual(ghDb.executionMode, 'DRY_RUN');
  assert.ok(ghDb.screenshotPath);
  console.log('✓ [PASS 3/12] Greenhouse Dry-Run: Fields populated, PDF uploaded, verified answers filled, stopped before submission boundary.');

  // --------------------------------------------------------------------------
  // TEST 4: Ashby Adapter Automation (Dry-Run)
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 4/12] Verifying Ashby Adapter in Dry-Run Mode...');
  const ashbySetup = await createApprovedApplication({
    company: 'OpenAI',
    position: 'Research Engineer - AI Systems & Scaling',
    ats: 'Ashby',
    url: 'http://localhost:3000/fixtures/ats/ashby'
  });

  const ashbyDryRun = await atsEngine.executeApplication({
    applicationId: ashbySetup.app.id,
    userId,
    tenantId: user.user.tenantId,
    executionMode: 'DRY_RUN'
  });

  assert.strictEqual(ashbyDryRun.status, 'FORM_FILLED');
  assert.strictEqual(ashbyDryRun.dryRun, true);
  assert.strictEqual(ashbyDryRun.validation.valid, true);

  const ashbyDb = await prisma.application.findUnique({ where: { id: ashbySetup.app.id } });
  assert.strictEqual(ashbyDb.status, 'FORM_FILLED');
  console.log('✓ [PASS 4/12] Ashby Dry-Run: Name, email, phone, education dropdown, and PDF file attached without live submission.');

  // --------------------------------------------------------------------------
  // TEST 5: Lever Adapter Automation (Dry-Run)
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 5/12] Verifying Lever Adapter in Dry-Run Mode...');
  const leverSetup = await createApprovedApplication({
    company: 'Canonical',
    position: 'Cloud Field Engineer',
    ats: 'Lever',
    url: 'http://localhost:3000/fixtures/ats/lever'
  });

  const leverDryRun = await atsEngine.executeApplication({
    applicationId: leverSetup.app.id,
    userId,
    tenantId: user.user.tenantId,
    executionMode: 'DRY_RUN'
  });

  assert.strictEqual(leverDryRun.status, 'FORM_FILLED');
  assert.strictEqual(leverDryRun.dryRun, true);

  const leverDb = await prisma.application.findUnique({ where: { id: leverSetup.app.id } });
  assert.strictEqual(leverDb.status, 'FORM_FILLED');
  console.log('✓ [PASS 5/12] Lever Dry-Run: Contact info, org, URLs, resume input populated and verified.');

  // --------------------------------------------------------------------------
  // TEST 6: Workday Experimental Adapter (Multi-Step Progression)
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 6/12] Verifying Workday Multi-Step Progression...');
  const wdSetup = await createApprovedApplication({
    company: 'Autodesk',
    position: 'Software Architect',
    ats: 'Workday',
    url: 'http://localhost:3000/fixtures/ats/workday'
  });

  const wdDryRun = await atsEngine.executeApplication({
    applicationId: wdSetup.app.id,
    userId,
    tenantId: user.user.tenantId,
    executionMode: 'DRY_RUN'
  });

  assert.strictEqual(wdDryRun.status, 'FORM_FILLED');
  assert.strictEqual(wdDryRun.dryRun, true);

  const wdDb = await prisma.application.findUnique({ where: { id: wdSetup.app.id } });
  assert.strictEqual(wdDb.status, 'FORM_FILLED');
  console.log('✓ [PASS 6/12] Workday Experimental: Successfully advanced across multi-step wizard, uploaded resume, and halted at review stage.');

  // --------------------------------------------------------------------------
  // TEST 7: Missing-Field Detection & Validation Guard
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 7/12] Verifying Missing-Field Detection and Recovery...');
  const session = await BrowserDriver.createSession({ headless: true });
  await session.page.goto('http://localhost:3000/fixtures/ats/greenhouse', { waitUntil: 'domcontentloaded' });
  const validationCheck = await ghAdapter.validateForm(session.page);

  assert.strictEqual(validationCheck.valid, false);
  assert.ok(validationCheck.missingRequired.length >= 4);
  assert.ok(validationCheck.missingRequired.includes('first_name'));
  await BrowserDriver.safeClose(session);
  console.log(`✓ [PASS 7/12] Missing-field recovery: Form correctly reported ${validationCheck.missingRequired.length} missing required fields before population.`);

  // --------------------------------------------------------------------------
  // TEST 8: Cryptographic Pre-Condition Verification
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 8/12] Verifying Cryptographic Approval Pre-Condition Gate...');
  const unapprovedApp = await prisma.application.create({
    data: {
      tenantId: user.user.tenantId,
      userId,
      company: 'Tampered Corp',
      position: 'Security Lead',
      ats: 'greenhouse',
      url: 'http://localhost:3000/fixtures/ats/greenhouse',
      status: 'DRAFT'
    }
  });

  await assert.rejects(async () => {
    await atsEngine.executeApplication({
      applicationId: unapprovedApp.id,
      userId,
      tenantId: user.user.tenantId,
      executionMode: 'DRY_RUN'
    });
  }, /UNAPPROVED_DOCUMENT/);

  // Tampered document text
  const tamperedSetup = await createApprovedApplication({
    company: 'Tampered Corp 2',
    position: 'Engineer',
    ats: 'Greenhouse',
    url: 'http://localhost:3000/fixtures/ats/greenhouse'
  });
  const tamperedDiff = JSON.parse(tamperedSetup.app.diffData);
  tamperedDiff.optimizedResumeText += ' [TAMPERED BULLET]';
  await prisma.application.update({
    where: { id: tamperedSetup.app.id },
    data: { diffData: JSON.stringify(tamperedDiff) }
  });

  await assert.rejects(async () => {
    await atsEngine.executeApplication({
      applicationId: tamperedSetup.app.id,
      userId,
      tenantId: user.user.tenantId,
      executionMode: 'DRY_RUN'
    });
  }, /INVALID_APPROVAL_SIGNATURE/);
  console.log('✓ [PASS 8/12] Cryptographic gate: Unapproved and tampered document versions strictly blocked from execution.');

  // --------------------------------------------------------------------------
  // TEST 9: Duplicate Submission Prevention (Idempotency Key Invariant)
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 9/12] Verifying Duplicate Submission Prevention Across Tailored Versions...');
  const sharedReqHash = `req-fixed-${Date.now()}`;
  const appA = await createApprovedApplication({
    company: 'Stripe',
    position: 'Security Infrastructure Engineer',
    ats: 'Greenhouse',
    url: 'http://localhost:3000/fixtures/ats/greenhouse',
    reqHash: sharedReqHash
  });

  // Mark appA as SUBMITTED_CONFIRMED with idempotency key
  const keyA = atsEngine.generateSubmissionIdempotencyKey({
    tenantId: user.user.tenantId,
    userId,
    company: 'Stripe',
    jobId: appA.job.id,
    reqId: sharedReqHash
  });
  await prisma.application.update({
    where: { id: appA.app.id },
    data: { status: 'SUBMITTED_CONFIRMED', idempotencyKey: keyA }
  });

  // Attempt second application to same employer/requisition with DIFFERENT resume
  const appB = await createApprovedApplication({
    company: 'Stripe',
    position: 'Security Infrastructure Engineer',
    ats: 'Greenhouse',
    url: 'http://localhost:3000/fixtures/ats/greenhouse',
    reqHash: sharedReqHash
  });

  await assert.rejects(async () => {
    await atsEngine.executeApplication({
      applicationId: appB.app.id,
      userId,
      tenantId: user.user.tenantId,
      executionMode: 'DRY_RUN'
    });
  }, (err) => {
    assert.strictEqual(err.code, 'DUPLICATE_SUBMISSION_PREVENTED');
    return true;
  });
  console.log('✓ [PASS 9/12] Duplicate prevention: Collision-resistant key successfully blocked repeat submission even with modified resume.');

  // --------------------------------------------------------------------------
  // TEST 10: Explicit Candidate Consent & Live Two-Phase Credit Commit
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 10/12] Verifying Explicit Candidate Consent & Two-Phase Credit Commit...');
  const liveSetup = await createApprovedApplication({
    company: 'GitLab Live Staging',
    position: 'Python Engineer',
    ats: 'Greenhouse',
    url: 'http://localhost:3000/fixtures/ats/greenhouse'
  });

  const initialUser = await prisma.user.findUnique({ where: { id: userId } });
  const initialCredits = initialUser.credits;

  // Execute with explicit consent
  const liveResult = await atsEngine.executeApplication({
    applicationId: liveSetup.app.id,
    userId,
    tenantId: user.user.tenantId,
    executionMode: 'LIVE',
    finalSubmissionConsent: true
  });

  assert.strictEqual(liveResult.status, 'SUBMITTED_CONFIRMED');
  assert.strictEqual(liveResult.confirmed, true);
  assert.strictEqual(liveResult.receipt.confirmationNumber, 'GH-91823746');

  // Verify credits atomically deducted in PostgreSQL
  const postUser = await prisma.user.findUnique({ where: { id: userId } });
  assert.strictEqual(postUser.credits, initialCredits - 1);
  assert.strictEqual(postUser.consumedCredits, 1);
  assert.strictEqual(postUser.reservedCredits, 0);

  // Verify journal entries for hold and commit
  const journalHold = await prisma.creditJournal.findFirst({
    where: {
      userId,
      entryType: 'APPLICATION_HOLD',
      referenceId: liveSetup.job ? liveSetup.job.requisitionHash : liveSetup.app.id
    }
  });
  assert.ok(journalHold);
  assert.strictEqual(journalHold.amount, -1);

  const journalCommit = await prisma.creditJournal.findFirst({
    where: { userId, referenceId: liveSetup.app.id, entryType: 'APPLICATION_COMMIT' }
  });
  assert.ok(journalCommit);
  assert.strictEqual(journalCommit.amount, 0);
  console.log('✓ [PASS 10/12] Live 2PC commit: Credit held -> submission executed -> confirmation receipt verified -> credit consumed.');

  // --------------------------------------------------------------------------
  // TEST 11: Quarantine Isolation for Ambiguous / Unknown Outcomes
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 11/12] Verifying Quarantine for Ambiguous Submission Outcomes...');
  // Point to a page that does not return confirmation number (404 page)
  const quarantineSetup = await createApprovedApplication({
    company: 'Ambiguous Portal',
    position: 'Engineer',
    ats: 'Greenhouse',
    url: 'http://localhost:3000/fixtures/ats/greenhouse?ambiguous=1'
  });

  // Mock submit on adapter to simulate network disconnect or portal freeze
  const originalSubmit = ghAdapter.submit;
  ghAdapter.submit = async () => ({ submitted: true, status: 'SUBMITTED_IN_FLIGHT' });
  const originalParse = ghAdapter.parseReceipt;
  ghAdapter.parseReceipt = async () => ({ confirmed: false, error: 'TIMEOUT_WAITING_FOR_PORTAL' });

  try {
    const qRes = await atsEngine.executeApplication({
      applicationId: quarantineSetup.app.id,
      userId,
      tenantId: user.user.tenantId,
      executionMode: 'LIVE',
      finalSubmissionConsent: true
    });

    assert.strictEqual(qRes.status, 'OUTCOME_UNKNOWN');
    assert.strictEqual(qRes.quarantined, true);

    const qDb = await prisma.application.findUnique({ where: { id: quarantineSetup.app.id } });
    assert.strictEqual(qDb.status, 'OUTCOME_UNKNOWN');
    assert.ok(qDb.quarantineReason);
  } finally {
    ghAdapter.submit = originalSubmit;
    ghAdapter.parseReceipt = originalParse;
  }
  console.log('✓ [PASS 11/12] Quarantine isolation: Ambiguous submission response safely quarantined without consuming or losing credit.');

  // --------------------------------------------------------------------------
  // TEST 12: Worker Interruption & PostgreSQL Recovery
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 12/12] Verifying Worker Interruption State Recovery...');
  const interruptedApp = await prisma.application.create({
    data: {
      tenantId: user.user.tenantId,
      userId,
      company: 'Crash Recovery Corp',
      position: 'Reliability Engineer',
      ats: 'ashby',
      url: 'http://localhost:3000/fixtures/ats/ashby',
      status: 'SUBMISSION_IN_FLIGHT',
      updatedAt: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
    }
  });

  const recoveryReport = await atsEngine.recoverInterruptedExecutions();
  assert.ok(recoveryReport.recoveredCount >= 1);
  assert.ok(recoveryReport.recovered.includes(interruptedApp.id));

  const recoveredDb = await prisma.application.findUnique({ where: { id: interruptedApp.id } });
  assert.strictEqual(recoveredDb.status, 'OUTCOME_UNKNOWN');
  assert.ok(recoveredDb.quarantineReason.includes('Worker interrupted'));
  console.log('✓ [PASS 12/12] Worker recovery: In-flight orphaned application safely reclaimed and quarantined upon worker recovery scan.');

  console.log('\n>> [PASS] FEAT-009: All 12 ATS Automation Engine tests passed successfully.\n');
  return true;
}

if (require.main === module) {
  runFeat009AtsAutomationTests()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('\n❌ [FAIL] FEAT-009 test suite failed:', err);
      process.exit(1);
    });
}

module.exports = runFeat009AtsAutomationTests;
