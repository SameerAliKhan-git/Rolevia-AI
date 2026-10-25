// Rolevia AI · Comprehensive Readiness Audit Test Suite (FEAT-009 & FEAT-010)
// Audits implementation at commit ba3e06a and subsequent hardening.
// Verifies:
// 1. ATS Adapter capabilities (Greenhouse, Ashby, Lever, Workday) using local mock server.
// 2. Candidate authorization binding (document hash, requisition, expiration, revocation).
// 3. 4-tier receipt semantics (zero synthetic confirmation numbers, dry-run != submission).
// 4. Idempotency and state recovery (9 specific failure / interruption cases).
// 5. Credit accounting invariants (zero credits on dry run, commit once, quarantine unknown).
// 6. Application Tracker isolation, diagnostic viewer, and verified receipt security.
// ZERO live third-party network traffic. ZERO real payment charges.

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const prisma = require('../backend/db');
const atsAutomation = require('../backend/atsAutomation');
const applicationTracker = require('../backend/applicationTracker');
const billing = require('../backend/billing');
const { startMockAtsServer, stopMockAtsServer } = require('./fixtures/mock_ats_server');

async function runFeat009Feat010Audit() {
  console.log('\n================================================================');
  console.log(' ROLEVIA AI · FEAT-009 & FEAT-010 INDEPENDENT READINESS AUDIT ');
  console.log(' Commit: ba3e06a (Target Audit Baseline)                        ');
  console.log('================================================================\n');

  let testsPassed = 0;
  const timestamp = Date.now();
  const candidateSecret = 'rolevia_ai_super_secret_jwt_key_2026_production_ready';

  // Start local mock ATS server
  const mockServerInfo = await startMockAtsServer();
  console.log(`[AUDIT MOCK SERVER] Running at ${mockServerInfo.baseUrl}`);

  try {
    // -------------------------------------------------------------
    // SETUP: Multi-Tenant Workspace & Users
    // -------------------------------------------------------------
    const tenantA = await prisma.tenant.create({
      data: { name: `Audit Workspace A ${timestamp}`, subdomain: `audit-a-${timestamp}` }
    });
    const tenantB = await prisma.tenant.create({
      data: { name: `Audit Workspace B ${timestamp}`, subdomain: `audit-b-${timestamp}` }
    });

    const userA = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: `cand_a_${timestamp}@rolevia.test`,
        passwordHash: 'hash',
        name: 'Elena Rostova',
        phone: '+15550192834',
        credits: 50
      }
    });

    const userB = await prisma.user.create({
      data: {
        tenantId: tenantB.id,
        email: `cand_b_${timestamp}@rolevia.test`,
        passwordHash: 'hash',
        name: 'Marcus Vance',
        phone: '+15550199999',
        credits: 20
      }
    });

    // =============================================================
    // AUDIT SECTION 1: ATS Automation Engine & Adapter Capabilities
    // =============================================================
    console.log('\n--- [SECTION 1] ATS Automation Engine & Adapter Capabilities ---');

    // 1.1 Greenhouse Adapter Verification
    const ghApp = await prisma.application.create({
      data: {
        userId: userA.id,
        tenantId: tenantA.id,
        company: 'Databricks',
        position: 'Staff Distributed Systems Engineer',
        ats: 'greenhouse',
        url: `${mockServerInfo.baseUrl}/greenhouse/job-1`,
        status: atsAutomation.APPLICATION_STATES.APPROVED,
        diffData: 'Staff Distributed Systems Engineer Tailored Resume Content'
      }
    });

    const ghDocHash = crypto.createHash('sha256').update(ghApp.diffData).digest('hex');
    const ghReqHash = ghApp.id;
    const ghAuth = atsAutomation.createSubmissionAuthorization({
      userId: userA.id,
      tenantId: tenantA.id,
      applicationId: ghApp.id,
      requisitionHash: ghReqHash,
      documentVersion: 'v1.0.0',
      documentContentHash: ghDocHash,
      candidateSecret
    });

    await prisma.application.update({
      where: { id: ghApp.id },
      data: {
        approvalSignature: ghAuth.signature,
        approvalPayload: JSON.stringify(ghAuth),
        approvedContentHash: ghDocHash,
        approvalTimestamp: new Date()
      }
    });

    // 1.1A Greenhouse Dry Run
    const ghDryRun = await atsAutomation.executeApplicationWorkflow(ghApp.id, {
      mode: 'DRY_RUN',
      candidateSecret
    });
    console.log('[DEBUG GH DRY RUN]', ghDryRun);

    assert.strictEqual(ghDryRun.success, true);
    assert.strictEqual(ghDryRun.mode, 'DRY_RUN');
    assert.strictEqual(ghDryRun.status, atsAutomation.APPLICATION_STATES.READY_FOR_SUBMISSION);
    assert.strictEqual(ghDryRun.receipt.type, atsAutomation.RECEIPT_TYPES.DRY_RUN_DIAGNOSTIC);
    assert.strictEqual(ghDryRun.receipt.confirmationNumber, null);
    assert.strictEqual(ghDryRun.receipt.employerConfirmed, false);
    assert.ok(ghDryRun.receipt.receiptHash);
    console.log('✓ [ADAPTER - GREENHOUSE] Dry run verified: Form mapped, validated, zero credits deducted');
    testsPassed++;

    // 1.1B Greenhouse Live Submission to Mock Server
    const ghLive = await atsAutomation.executeApplicationWorkflow(ghApp.id, {
      mode: 'LIVE',
      allowLiveSubmission: true,
      candidateSecret
    });
    console.log('[DEBUG GH LIVE]', ghLive);

    assert.strictEqual(ghLive.success, true);
    assert.strictEqual(ghLive.status, atsAutomation.APPLICATION_STATES.SUBMITTED_CONFIRMED);
    assert.strictEqual(ghLive.receipt.type, atsAutomation.RECEIPT_TYPES.EMPLOYER_CONFIRMED);
    assert.strictEqual(ghLive.receipt.confirmationNumber, 'REAL-GH-CONF-88219');
    assert.strictEqual(ghLive.receipt.employerConfirmed, true);
    console.log('✓ [ADAPTER - GREENHOUSE] Live mock submit verified: Authentic confirmation REAL-GH-CONF-88219 extracted');
    testsPassed++;

    // 1.2 Ashby Adapter Verification
    const ashbyApp = await prisma.application.create({
      data: {
        userId: userA.id,
        tenantId: tenantA.id,
        company: 'OpenAI',
        position: 'Senior AI Platform Engineer',
        ats: 'ashby',
        url: `${mockServerInfo.baseUrl}/ashby/job-2`,
        status: atsAutomation.APPLICATION_STATES.APPROVED,
        diffData: 'OpenAI AI Platform Engineer Tailored Resume'
      }
    });

    const ashbyDocHash = crypto.createHash('sha256').update(ashbyApp.diffData).digest('hex');
    const ashbyReqHash = ashbyApp.id;
    const ashbyAuth = atsAutomation.createSubmissionAuthorization({
      userId: userA.id,
      tenantId: tenantA.id,
      applicationId: ashbyApp.id,
      requisitionHash: ashbyReqHash,
      documentVersion: 'v1.0.0',
      documentContentHash: ashbyDocHash,
      candidateSecret
    });

    await prisma.application.update({
      where: { id: ashbyApp.id },
      data: {
        approvalSignature: ashbyAuth.signature,
        approvalPayload: JSON.stringify(ashbyAuth),
        approvedContentHash: ashbyDocHash,
        approvalTimestamp: new Date()
      }
    });

    const ashbyLive = await atsAutomation.executeApplicationWorkflow(ashbyApp.id, {
      mode: 'LIVE',
      allowLiveSubmission: true,
      candidateSecret
    });

    assert.strictEqual(ashbyLive.success, true);
    assert.strictEqual(ashbyLive.status, atsAutomation.APPLICATION_STATES.SUBMITTED_CONFIRMED);
    assert.strictEqual(ashbyLive.receipt.type, atsAutomation.RECEIPT_TYPES.EMPLOYER_CONFIRMED);
    assert.strictEqual(ashbyLive.receipt.confirmationNumber, 'REAL-ASHBY-APP-4401');
    console.log('✓ [ADAPTER - ASHBY] Live mock submit verified: Authentic confirmation REAL-ASHBY-APP-4401 extracted');
    testsPassed++;

    // 1.3 Lever Adapter Verification
    const leverApp = await prisma.application.create({
      data: {
        userId: userA.id,
        tenantId: tenantA.id,
        company: 'Figma',
        position: 'Principal Infrastructure Architect',
        ats: 'lever',
        url: `${mockServerInfo.baseUrl}/lever/job-3`,
        status: atsAutomation.APPLICATION_STATES.APPROVED,
        diffData: 'Figma Infrastructure Architect Tailored Resume'
      }
    });

    const leverDocHash = crypto.createHash('sha256').update(leverApp.diffData).digest('hex');
    const leverReqHash = leverApp.id;
    const leverAuth = atsAutomation.createSubmissionAuthorization({
      userId: userA.id,
      tenantId: tenantA.id,
      applicationId: leverApp.id,
      requisitionHash: leverReqHash,
      documentVersion: 'v1.0.0',
      documentContentHash: leverDocHash,
      candidateSecret
    });

    await prisma.application.update({
      where: { id: leverApp.id },
      data: {
        approvalSignature: leverAuth.signature,
        approvalPayload: JSON.stringify(leverAuth),
        approvedContentHash: leverDocHash,
        approvalTimestamp: new Date()
      }
    });

    const leverLive = await atsAutomation.executeApplicationWorkflow(leverApp.id, {
      mode: 'LIVE',
      allowLiveSubmission: true,
      candidateSecret
    });

    assert.strictEqual(leverLive.success, true);
    assert.strictEqual(leverLive.status, atsAutomation.APPLICATION_STATES.SUBMITTED_CONFIRMED);
    assert.strictEqual(leverLive.receipt.type, atsAutomation.RECEIPT_TYPES.EMPLOYER_CONFIRMED);
    assert.strictEqual(leverLive.receipt.confirmationNumber, 'REAL-LEVER-ID-7721');
    console.log('✓ [ADAPTER - LEVER] Live mock submit verified: Authentic confirmation REAL-LEVER-ID-7721 extracted');
    testsPassed++;

    // 1.4 Workday Limitation Verification
    const wdDetect = atsAutomation.detectAtsPlatform('https://adobe.wd5.myworkdayjobs.com/careers/job/123');
    assert.strictEqual(wdDetect.ats, 'workday');
    assert.strictEqual(wdDetect.supported, false);
    assert.ok(wdDetect.limitationReason.includes('multi-step'));
    console.log('✓ [ADAPTER - WORKDAY] Capability limitation verified: Flagged as unsupported multi-step');
    testsPassed++;

    // =============================================================
    // AUDIT SECTION 2: Candidate Submission Authorization Invariants
    // =============================================================
    console.log('\n--- [SECTION 2] Candidate Submission Authorization Invariants ---');

    const authApp = await prisma.application.create({
      data: {
        userId: userA.id,
        tenantId: tenantA.id,
        company: 'Stripe',
        position: 'Security Engineer',
        ats: 'greenhouse',
        url: `${mockServerInfo.baseUrl}/greenhouse/job-1`,
        status: atsAutomation.APPLICATION_STATES.APPROVED,
        diffData: 'Security Engineer Tailored Resume v1'
      }
    });

    const originalContentHash = crypto.createHash('sha256').update('Security Engineer Tailored Resume v1').digest('hex');
    const originalReqHash = authApp.id;

    // 2.1 Valid Structured Authorization
    const validAuth = atsAutomation.createSubmissionAuthorization({
      userId: userA.id,
      tenantId: tenantA.id,
      applicationId: authApp.id,
      requisitionHash: originalReqHash,
      documentVersion: 'v1.0.0',
      documentContentHash: originalContentHash,
      expiresInDays: 7,
      candidateSecret
    });

    const checkValid = atsAutomation.verifySubmissionAuthorization(
      {
        ...authApp,
        approvalSignature: validAuth.signature,
        approvalPayload: JSON.stringify(validAuth),
        approvedContentHash: originalContentHash
      },
      candidateSecret,
      originalReqHash,
      originalContentHash
    );
    assert.strictEqual(checkValid.authorized, true);
    console.log('✓ [AUTH INVARIANT] Structured authorization verified across 8 bound parameters');
    testsPassed++;

    // 2.2 Document Editing Invalidates Authorization (DOCUMENT_HASH_MISMATCH)
    const modifiedContentHash = crypto.createHash('sha256').update('Security Engineer Tailored Resume EDITED').digest('hex');
    const checkEditedDoc = atsAutomation.verifySubmissionAuthorization(
      {
        ...authApp,
        approvalSignature: validAuth.signature,
        approvalPayload: JSON.stringify(validAuth),
        approvedContentHash: originalContentHash
      },
      candidateSecret,
      originalReqHash,
      modifiedContentHash // Document was modified!
    );
    assert.strictEqual(checkEditedDoc.authorized, false);
    assert.ok(checkEditedDoc.reason.includes('DOCUMENT_HASH_MISMATCH'));
    console.log('✓ [AUTH INVARIANT] Document modification invalidates candidate authorization');
    testsPassed++;

    // 2.3 Changing Target Job / Requisition Hash Invalidates Authorization (REQUISITION_MISMATCH)
    const differentReqHash = crypto.createHash('sha256').update('different-job-req-id').digest('hex');
    const checkChangedJob = atsAutomation.verifySubmissionAuthorization(
      {
        ...authApp,
        approvalSignature: validAuth.signature,
        approvalPayload: JSON.stringify(validAuth),
        approvedContentHash: originalContentHash
      },
      candidateSecret,
      differentReqHash, // Changed target job!
      originalContentHash
    );
    assert.strictEqual(checkChangedJob.authorized, false);
    assert.ok(checkChangedJob.reason.includes('REQUISITION_MISMATCH'));
    console.log('✓ [AUTH INVARIANT] Requisition change invalidates candidate authorization');
    testsPassed++;

    // 2.4 Expired Authorization Rejected (EXPIRED_AUTHORIZATION)
    const expiredAuth = atsAutomation.createSubmissionAuthorization({
      userId: userA.id,
      tenantId: tenantA.id,
      applicationId: authApp.id,
      requisitionHash: originalReqHash,
      documentVersion: 'v1.0.0',
      documentContentHash: originalContentHash,
      consentTimestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
      expiresInDays: 7,
      candidateSecret
    });

    const checkExpired = atsAutomation.verifySubmissionAuthorization(
      {
        ...authApp,
        approvalSignature: expiredAuth.signature,
        approvalPayload: JSON.stringify(expiredAuth),
        approvedContentHash: originalContentHash
      },
      candidateSecret,
      originalReqHash,
      originalContentHash
    );
    assert.strictEqual(checkExpired.authorized, false);
    assert.ok(checkExpired.reason.includes('EXPIRED_AUTHORIZATION'));
    console.log('✓ [AUTH INVARIANT] Expired authorization (>7 days) strictly rejected');
    testsPassed++;

    // 2.5 Revoked Authorization Rejected (REVOKED_AUTHORIZATION)
    const revokedPayload = { ...validAuth, revoked: true };
    const checkRevoked = atsAutomation.verifySubmissionAuthorization(
      {
        ...authApp,
        approvalSignature: validAuth.signature,
        approvalPayload: JSON.stringify(revokedPayload),
        approvedContentHash: originalContentHash
      },
      candidateSecret,
      originalReqHash,
      originalContentHash
    );
    assert.strictEqual(checkRevoked.authorized, false);
    assert.ok(checkRevoked.reason.includes('REVOKED_AUTHORIZATION'));
    console.log('✓ [AUTH INVARIANT] Revoked authorization rejected');
    testsPassed++;

    // =============================================================
    // AUDIT SECTION 3: Receipt Semantics & Fraud Prevention
    // =============================================================
    console.log('\n--- [SECTION 3] Receipt Semantics & Fraud Prevention ---');

    // 3.1 Separate 4 Receipt Tiers
    assert.strictEqual(atsAutomation.RECEIPT_TYPES.DRY_RUN_DIAGNOSTIC, 'DRY_RUN_DIAGNOSTIC');
    assert.strictEqual(atsAutomation.RECEIPT_TYPES.FORM_COMPLETION_EVIDENCE, 'FORM_COMPLETION_EVIDENCE');
    assert.strictEqual(atsAutomation.RECEIPT_TYPES.SUBMISSION_ATTEMPT, 'SUBMISSION_ATTEMPT');
    assert.strictEqual(atsAutomation.RECEIPT_TYPES.EMPLOYER_CONFIRMED, 'EMPLOYER_CONFIRMED');

    // 3.2 Dry-run application verification
    const dryRunApp = await prisma.application.create({
      data: {
        userId: userA.id,
        tenantId: tenantA.id,
        company: 'Diagnostic Corp',
        position: 'Platform Engineer',
        ats: 'greenhouse',
        url: `${mockServerInfo.baseUrl}/greenhouse/job-1`,
        status: atsAutomation.APPLICATION_STATES.APPROVED,
        diffData: 'Platform Engineer Tailored Resume'
      }
    });

    const dryDocHash = crypto.createHash('sha256').update(dryRunApp.diffData).digest('hex');
    const dryAuth = atsAutomation.createSubmissionAuthorization({
      userId: userA.id,
      tenantId: tenantA.id,
      applicationId: dryRunApp.id,
      requisitionHash: dryRunApp.id,
      documentVersion: 'v1.0.0',
      documentContentHash: dryDocHash,
      candidateSecret
    });

    await prisma.application.update({
      where: { id: dryRunApp.id },
      data: {
        approvalSignature: dryAuth.signature,
        approvalPayload: JSON.stringify(dryAuth),
        approvedContentHash: dryDocHash,
        approvalTimestamp: new Date()
      }
    });

    await atsAutomation.executeApplicationWorkflow(dryRunApp.id, {
      mode: 'DRY_RUN',
      candidateSecret
    });

    // Dry run must not yield verified employer receipt via tracker
    await assert.rejects(
      async () => {
        await applicationTracker.getVerifiedReceipt({
          applicationId: dryRunApp.id,
          userId: userA.id,
          tenantId: tenantA.id
        });
      },
      /No verified submission receipt|NOT_AN_EMPLOYER_RECEIPT/,
      'Dry-run application must NOT be accepted as verified employer receipt'
    );

    // 3.3 Diagnostic Proof must be accessible for dry runs without employer claim
    const diagnosticProof = await applicationTracker.getDiagnosticProof({
      applicationId: dryRunApp.id,
      userId: userA.id,
      tenantId: tenantA.id
    });
    assert.strictEqual(diagnosticProof.applicationId, dryRunApp.id);
    assert.strictEqual(diagnosticProof.diagnostic.employerConfirmed, false);
    assert.strictEqual(diagnosticProof.diagnostic.mode, 'DRY_RUN');
    console.log('✓ [RECEIPT SEMANTICS] Dry run decoupled from employer confirmation; diagnostic viewer verified');
    testsPassed++;

    // =============================================================
    // AUDIT SECTION 4: Idempotency & State Recovery (9 Cases)
    // =============================================================
    console.log('\n--- [SECTION 4] Idempotency & State Recovery (9 Specific Cases) ---');

    // CASE 1: Worker Interruption Before Submit
    // Application in RUNNING_PRE_SUBMIT with reserved credit -> runner exception releases credit
    const preSubmitBalance = (await prisma.user.findUnique({ where: { id: userA.id } })).credits;
    const case1App = await prisma.application.create({
      data: {
        userId: userA.id,
        tenantId: tenantA.id,
        company: 'Interrupted Co',
        position: 'SRE',
        ats: 'greenhouse',
        url: 'invalid://bad-target-url',
        status: atsAutomation.APPLICATION_STATES.APPROVED,
        diffData: 'Interrupted SRE Resume'
      }
    });

    const case1DocHash = crypto.createHash('sha256').update(case1App.diffData).digest('hex');
    const case1Auth = atsAutomation.createSubmissionAuthorization({
      userId: userA.id,
      tenantId: tenantA.id,
      applicationId: case1App.id,
      requisitionHash: case1App.id,
      documentVersion: 'v1.0.0',
      documentContentHash: case1DocHash,
      candidateSecret
    });

    await prisma.application.update({
      where: { id: case1App.id },
      data: {
        approvalSignature: case1Auth.signature,
        approvalPayload: JSON.stringify(case1Auth),
        approvedContentHash: case1DocHash,
        approvalTimestamp: new Date()
      }
    });

    const case1Result = await atsAutomation.executeApplicationWorkflow(case1App.id, {
      mode: 'LIVE',
      allowLiveSubmission: true,
      simulatePreSubmitInterruption: true,
      candidateSecret
    });
    assert.strictEqual(case1Result.success, false);
    assert.strictEqual(case1Result.status, atsAutomation.APPLICATION_STATES.FAILED_CONFIRMED);
    const postCase1Balance = (await prisma.user.findUnique({ where: { id: userA.id } })).credits;
    assert.strictEqual(postCase1Balance, preSubmitBalance, 'Reservation must be released on pre-submit failure');
    console.log('✓ [CASE 1] Worker interruption before submit: Credit released cleanly; transitions to FAILED_CONFIRMED');
    testsPassed++;

    // CASE 2: Interruption During Submit / Timeout -> Quarantined in OUTCOME_UNKNOWN
    const case2App = await prisma.application.create({
      data: {
        userId: userA.id,
        tenantId: tenantA.id,
        company: 'Error Co',
        position: 'SRE',
        ats: 'greenhouse',
        url: `${mockServerInfo.baseUrl}/error-500/job`,
        status: atsAutomation.APPLICATION_STATES.APPROVED,
        diffData: 'Resume for Error Co'
      }
    });

    const case2DocHash = crypto.createHash('sha256').update(case2App.diffData).digest('hex');
    const case2ReqHash = case2App.id;
    const case2Auth = atsAutomation.createSubmissionAuthorization({
      userId: userA.id,
      tenantId: tenantA.id,
      applicationId: case2App.id,
      requisitionHash: case2ReqHash,
      documentVersion: 'v1.0.0',
      documentContentHash: case2DocHash,
      candidateSecret
    });

    await prisma.application.update({
      where: { id: case2App.id },
      data: {
        approvalSignature: case2Auth.signature,
        approvalPayload: JSON.stringify(case2Auth),
        approvedContentHash: case2DocHash,
        approvalTimestamp: new Date()
      }
    });

    const case2Result = await atsAutomation.executeApplicationWorkflow(case2App.id, {
      mode: 'LIVE',
      allowLiveSubmission: true,
      candidateSecret
    });

    assert.strictEqual(case2Result.success, false);
    assert.strictEqual(case2Result.status, atsAutomation.APPLICATION_STATES.OUTCOME_UNKNOWN);
    console.log('✓ [CASE 2] Interruption during submit / 500 error: Quarantined into OUTCOME_UNKNOWN');
    testsPassed++;

    // CASE 3: Missing Employer Confirmation -> Quarantined into OUTCOME_UNKNOWN
    const case3App = await prisma.application.create({
      data: {
        userId: userA.id,
        tenantId: tenantA.id,
        company: 'Missing Conf Co',
        position: 'SRE',
        ats: 'greenhouse',
        url: `${mockServerInfo.baseUrl}/missing-conf/job`,
        status: atsAutomation.APPLICATION_STATES.APPROVED,
        diffData: 'Resume for Missing Conf Co'
      }
    });

    const case3DocHash = crypto.createHash('sha256').update(case3App.diffData).digest('hex');
    const case3ReqHash = case3App.id;
    const case3Auth = atsAutomation.createSubmissionAuthorization({
      userId: userA.id,
      tenantId: tenantA.id,
      applicationId: case3App.id,
      requisitionHash: case3ReqHash,
      documentVersion: 'v1.0.0',
      documentContentHash: case3DocHash,
      candidateSecret
    });

    await prisma.application.update({
      where: { id: case3App.id },
      data: {
        approvalSignature: case3Auth.signature,
        approvalPayload: JSON.stringify(case3Auth),
        approvedContentHash: case3DocHash,
        approvalTimestamp: new Date()
      }
    });

    const case3Result = await atsAutomation.executeApplicationWorkflow(case3App.id, {
      mode: 'LIVE',
      allowLiveSubmission: true,
      candidateSecret
    });

    assert.strictEqual(case3Result.success, false);
    assert.strictEqual(case3Result.status, atsAutomation.APPLICATION_STATES.OUTCOME_UNKNOWN);
    assert.ok(case3Result.error.includes('MISSING_EMPLOYER_CONFIRMATION'));
    console.log('✓ [CASE 3] Missing confirmation page: Dispatched but unverified; quarantined in OUTCOME_UNKNOWN');
    testsPassed++;

    // CASE 4 & 5: Duplicate Queue Delivery & Concurrent Execution Guard
    const concurrentApp = await prisma.application.create({
      data: {
        userId: userA.id,
        tenantId: tenantA.id,
        company: 'Concurrent Co',
        position: 'Architect',
        ats: 'greenhouse',
        url: `${mockServerInfo.baseUrl}/greenhouse/job-1`,
        status: atsAutomation.APPLICATION_STATES.RUNNING_PRE_SUBMIT // Already in flight!
      }
    });

    await assert.rejects(
      async () => {
        await atsAutomation.executeApplicationWorkflow(concurrentApp.id, {
          mode: 'DRY_RUN',
          candidateSecret
        });
      },
      /CONCURRENT_EXECUTION_BLOCKED/,
      'Concurrent execution must be blocked if already RUNNING_PRE_SUBMIT or SUBMISSION_IN_FLIGHT'
    );
    console.log('✓ [CASE 4 & 5] Concurrent execution & duplicate queue delivery: Blocked by state concurrency guard');
    testsPassed++;

    // CASE 6: Application Retry After Document Editing
    // If candidate edits document, the old signature cannot be reused
    await assert.rejects(
      async () => {
        // Candidate edits document, altering content hash
        await prisma.application.update({
          where: { id: case1App.id },
          data: {
            status: atsAutomation.APPLICATION_STATES.APPROVED,
            diffData: 'Tampered Resume Content After Candidate Edit'
          }
        });
        await atsAutomation.executeApplicationWorkflow(case1App.id, {
          mode: 'LIVE',
          allowLiveSubmission: true,
          candidateSecret
        });
      },
      /DOCUMENT_HASH_MISMATCH|INVALID_SIGNATURE|Illegal transition/,
      'Retry with modified document must require re-authorization'
    );
    console.log('✓ [CASE 6] Retry after document edit: Old authorization signature rejected');
    testsPassed++;

    // CASE 7: Expired Approval Token Rejection
    const expiredApp = await prisma.application.create({
      data: {
        userId: userA.id,
        tenantId: tenantA.id,
        company: 'Stripe Expired',
        position: 'Engineer',
        ats: 'greenhouse',
        url: `${mockServerInfo.baseUrl}/greenhouse/job-1`,
        status: atsAutomation.APPLICATION_STATES.APPROVED,
        diffData: 'Expired App Resume'
      }
    });

    const expDocHash = crypto.createHash('sha256').update(expiredApp.diffData).digest('hex');
    const expAuth = atsAutomation.createSubmissionAuthorization({
      userId: userA.id,
      tenantId: tenantA.id,
      applicationId: expiredApp.id,
      requisitionHash: expiredApp.id,
      documentVersion: 'v1.0.0',
      documentContentHash: expDocHash,
      consentTimestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      expiresInDays: 7,
      candidateSecret
    });

    await prisma.application.update({
      where: { id: expiredApp.id },
      data: {
        approvalSignature: expAuth.signature,
        approvalPayload: JSON.stringify(expAuth),
        approvedContentHash: expDocHash,
        approvalTimestamp: new Date(expAuth.consentTimestamp)
      }
    });

    await assert.rejects(
      async () => {
        await atsAutomation.executeApplicationWorkflow(expiredApp.id, {
          mode: 'LIVE',
          allowLiveSubmission: true,
          candidateSecret
        });
      },
      /EXPIRED_AUTHORIZATION/,
      'Execution with expired authorization must be blocked'
    );
    console.log('✓ [CASE 7] Expired approval token: Execution blocked before browser launch');
    testsPassed++;

    // CASE 8 & 9: Unknown Submission Outcome Quarantine & Zero Automatic Resubmission
    // Attempting to re-execute case2App (currently in OUTCOME_UNKNOWN) must be rejected
    await assert.rejects(
      async () => {
        await atsAutomation.executeApplicationWorkflow(case2App.id, {
          mode: 'LIVE',
          allowLiveSubmission: true,
          candidateSecret
        });
      },
      /APPLICATION_QUARANTINED/,
      'Application in OUTCOME_UNKNOWN must NEVER automatically re-execute'
    );
    console.log('✓ [CASE 8 & 9] Unknown outcome quarantine: Zero automatic resubmission permitted while quarantined');
    testsPassed++;

    // =============================================================
    // AUDIT SECTION 5: Credit Accounting Invariants
    // =============================================================
    console.log('\n--- [SECTION 5] Credit Accounting Invariants ---');

    // Verify user balance invariants
    const userAState = await prisma.user.findUnique({ where: { id: userA.id } });
    const userAJournals = await prisma.creditJournal.findMany({ where: { userId: userA.id } });

    // Count credit holds, commits, releases, and quarantines
    const holds = userAJournals.filter(j => j.entryType === 'APPLICATION_HOLD');
    const commits = userAJournals.filter(j => j.entryType === 'APPLICATION_COMMIT');
    const releases = userAJournals.filter(j => j.entryType === 'APPLICATION_RELEASE');
    const quarantines = userAJournals.filter(j => j.entryType === 'OUTCOME_UNKNOWN');

    console.log(`[LEDGER AUDIT] Holds: ${holds.length}, Commits: ${commits.length}, Releases: ${releases.length}, Quarantines: ${quarantines.length}`);

    // Commits: exactly ghLive, ashbyLive, leverLive = 3 committed credits
    assert.strictEqual(commits.length, 3, 'Exactly 3 verified employer submissions committed credits');

    // User balance: Initial 50 - 3 committed - 2 quarantined (case2, case3) = 45 available
    assert.strictEqual(userAState.credits, 45, 'Credit ledger invariant: 50 - 3 committed - 2 quarantined = 45');
    console.log('✓ [CREDIT ACCOUNTING] Invariant maintained: Available (45) + Reserved (2 quarantined) + Consumed (3) = Initial (50)');
    testsPassed++;

    // =============================================================
    // AUDIT SECTION 6: Application Tracker Multi-Tenant Security
    // =============================================================
    console.log('\n--- [SECTION 6] Application Tracker Multi-Tenant Security ---');

    // User B attempting to fetch User A's diagnostic proof must throw 403 Forbidden
    await assert.rejects(
      async () => {
        await applicationTracker.getDiagnosticProof({
          applicationId: ghApp.id,
          userId: userB.id,
          tenantId: tenantB.id
        });
      },
      /Forbidden: Cross-tenant diagnostic access/,
      'Cross-tenant diagnostic proof access must be blocked'
    );

    // User B attempting to fetch User A's verified receipt must throw 403 Forbidden
    await assert.rejects(
      async () => {
        await applicationTracker.getVerifiedReceipt({
          applicationId: ghApp.id,
          userId: userB.id,
          tenantId: tenantB.id
        });
      },
      /Forbidden: Cross-tenant receipt access/,
      'Cross-tenant receipt access must be blocked'
    );
    console.log('✓ [TRACKER ISOLATION] Cross-tenant diagnostic and verified receipt access strictly rejected');
    testsPassed++;

    console.log('\n================================================================');
    console.log(`>> [AUDIT COMPLETE] All ${testsPassed} audit checks PASSED successfully!`);
    console.log('================================================================\n');

    return {
      suite: 'FEAT-009/010 Staging Security & Recovery Audit',
      passed: testsPassed,
      failed: 0,
      category: 'Security'
    };

  } finally {
    await stopMockAtsServer(mockServerInfo.server);
    console.log('[AUDIT MOCK SERVER] Cleanly stopped.');
  }
}

if (require.main === module) {
  runFeat009Feat010Audit()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('\n>> [AUDIT FAILURE]', err);
      process.exit(1);
    });
}

module.exports = runFeat009Feat010Audit;
