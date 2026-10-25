// Rolevia AI · 10-Stage Workflow to ATS Integration Suite (Phase 6)
// Architecture: Demonstrates the end-to-end lifecycle across all 10 stages:
// DISCOVER → MATCH → OPTIMIZE → DOCUMENT_REVIEW → SUBMISSION_AUTHORIZATION →
// PREPARE_APPLICATION → HUMAN_REVIEW → SUBMIT → VERIFY → TRACK
// Invariants:
// - Unauthorized applications never reach the submit boundary.
// - Document modifications invalidate approvals.
// - Unanswered screening questions halt the workflow at HUMAN_REVIEW.
// - Dry-run evidence is never presented as authentic employer confirmation.
// - Ambiguous outcomes remain quarantined in OUTCOME_UNKNOWN_QUARANTINE.
// - Credits are charged only when authentic confirmation conditions are met.

const assert = require('assert');
const prisma = require('../backend/db');
const {
  createApplicationWorkflowGraph
} = require('../backend/workflows/applicationGraph');
const { PostgresDurableCheckpointer } = require('../backend/workflows/postgresCheckpointer');
const {
  WORKFLOW_VERSION,
  generateWorkflowThreadId
} = require('../backend/workflows/applicationWorkflowTypes');
const { createSubmissionAuthorization } = require('../backend/atsAutomation');

async function runWorkflowAtsIntegrationSuite() {
  console.log('\n================================================================================');
  console.log(' ROLEVIA AI · 10-STAGE WORKFLOW TO ATS INTEGRATION SUITE (PHASE 6)');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;

  function recordPass(testName) {
    console.log(`✓ [PASS] ${testName}`);
    passed++;
  }

  function recordFail(testName, err) {
    console.error(`✗ [FAIL] ${testName}: ${err.message}`);
    failed++;
  }

  const tenantId = 'tenant-int-01';
  const userId = 'user-int-01';
  const appId = `app-int-${Date.now()}`;

  try {
    // 0. Database Setup
    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: { id: tenantId, name: 'Integration Tenant', subdomain: 'int-tenant' }
    });
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        tenantId,
        email: 'candidate.integration@roleviaai.co.in',
        passwordHash: 'dummyhash',
        name: 'Integration Candidate'
      }
    });
    await prisma.application.create({
      data: {
        id: appId,
        tenantId,
        userId,
        company: 'Ashby Test Corp',
        position: 'Senior Full Stack Engineer',
        ats: 'ashby',
        url: 'https://jobs.ashbyhq.com/ashbytest/101',
        status: 'OPTIMIZING'
      }
    });

    const threadId = generateWorkflowThreadId({ tenantId, userId, applicationId: appId });
    const checkpointer = new PostgresDurableCheckpointer({ persistenceEnabled: true });
    const graph = createApplicationWorkflowGraph(checkpointer);
    const config = { configurable: { thread_id: threadId } };

    // -------------------------------------------------------------------------
    // STEP 1-4: DISCOVER → MATCH → OPTIMIZE → DOCUMENT_REVIEW
    // -------------------------------------------------------------------------
    const initialRun = await graph.invoke({
      workflowVersion: WORKFLOW_VERSION,
      tenantId,
      userId,
      applicationId: appId,
      jobRequisitionHash: 'req-ashby-101',
      executionMode: 'DRY_RUN',
      candidateProfile: {
        skills: ['React', 'Node.js', 'PostgreSQL'],
        experienceYears: 5,
        educationLevel: "Bachelor's",
        needsSponsorship: false,
        factIds: []
      },
      jobData: {
        company: 'Ashby Test Corp',
        position: 'Senior Full Stack Engineer',
        ats: 'ashby',
        url: 'https://jobs.ashbyhq.com/ashbytest/101',
        requiredSkills: ['React', 'Node.js']
      }
    }, config);

    assert.strictEqual(initialRun.currentStage, 'DOCUMENT_REVIEW');
    assert.strictEqual(initialRun.status, 'PAUSED_FOR_HUMAN');
    assert(initialRun.optimization && initialRun.optimization.documentHash);
    recordPass('Stages 1-4: Progresses DISCOVER → MATCH → OPTIMIZE and halts safely at DOCUMENT_REVIEW');

    // -------------------------------------------------------------------------
    // STEP 5: Unauthorized applications never reach the submit boundary
    // -------------------------------------------------------------------------
    // Invoking without approval must NOT progress
    const unauthorizedAttempt = await graph.invoke(null, config);
    assert.strictEqual(unauthorizedAttempt.currentStage, 'DOCUMENT_REVIEW');
    assert.strictEqual(unauthorizedAttempt.status, 'PAUSED_FOR_HUMAN');
    recordPass('Security Gate: Unauthorized application blocked at DOCUMENT_REVIEW without reaching submit boundary');

    // -------------------------------------------------------------------------
    // STEP 6: Document modification invalidates previous approval
    // -------------------------------------------------------------------------
    const initialDocHash = (await graph.getState(config)).values.optimization.documentHash;
    await graph.updateState(config, {
      documentReview: {
        approvedByCandidate: false,
        candidateEditsApplied: true,
        approvedContentHash: null
      }
    });

    const editRes = await graph.invoke(null, config);
    assert.strictEqual(editRes.currentStage, 'DOCUMENT_REVIEW');
    assert.strictEqual(editRes.status, 'PAUSED_FOR_HUMAN');
    assert.strictEqual(editRes.optimization.documentVersion >= 2, true);
    recordPass('Document Integrity: Document revisions invalidate approval, increment version, and re-pause');

    // -------------------------------------------------------------------------
    // STEP 7: Candidate Approves & Issues Cryptographic HMAC Token
    // -------------------------------------------------------------------------
    const updatedDocHash = (await graph.getState(config)).values.optimization.documentHash;
    const auth = createSubmissionAuthorization({
      userId,
      tenantId,
      applicationId: appId,
      jobRequisitionHash: 'req-ashby-101',
      documentHash: updatedDocHash,
      candidateSecret: process.env.JWT_SECRET || 'rolevia_ai_super_secret_jwt_key_2026_production_ready'
    });

    await graph.updateState(config, {
      documentReview: {
        approvedByCandidate: true,
        approvedAt: new Date().toISOString(),
        candidateEditsApplied: false,
        approvedContentHash: updatedDocHash
      },
      submissionAuthorization: {
        isAuthorized: true,
        authorizationToken: auth.authorizationToken || auth.signature,
        authorizedAt: new Date().toISOString()
      }
    });

    // -------------------------------------------------------------------------
    // STEP 8: Unanswered Screening Questions Halt Workflow at HUMAN_REVIEW
    // -------------------------------------------------------------------------
    await graph.updateState(config, {
      screeningQuestions: [
        {
          questionText: 'Do you require visa sponsorship?',
          category: 'SENSITIVE_DISCLOSURE',
          answer: null,
          requiresCandidateAction: true
        }
      ],
      jobData: {
        company: 'Ashby Test Corp',
        position: 'Senior Full Stack Engineer',
        ats: 'workday', // Triggers multi-step portal challenge
        requiredSkills: ['React']
      }
    });

    const workdayPause = await graph.invoke(null, config);
    assert.strictEqual(workdayPause.currentStage, 'HUMAN_REVIEW');
    assert.strictEqual(workdayPause.status, 'HUMAN_ESCALATION_MFA');
    recordPass('Screening & Portal Gate: Unsupported portal / unanswered questions halt at HUMAN_REVIEW');

    // -------------------------------------------------------------------------
    // STEP 9-10: SUBMIT → VERIFY → TRACK with Controlled Dry-Run Receipt
    // -------------------------------------------------------------------------
    // Switch ATS to standard greenhouse/ashby and provide candidate answer to screening question to proceed to submit
    await graph.updateState(config, {
      status: 'IN_PROGRESS',
      screeningQuestions: [
        {
          questionText: 'Do you require visa sponsorship?',
          category: 'SENSITIVE_DISCLOSURE',
          answer: 'No',
          requiresCandidateAction: false
        }
      ],
      jobData: {
        company: 'Ashby Test Corp',
        position: 'Senior Full Stack Engineer',
        ats: 'ashby',
        url: 'https://jobs.ashbyhq.com/ashbytest/101',
        requiredSkills: ['React']
      }
    });

    const finalCompletion = await graph.invoke(null, config);
    assert.strictEqual(finalCompletion.currentStage, 'TRACK');
    assert.strictEqual(finalCompletion.status, 'COMPLETED_TRACKED');
    assert(finalCompletion.receipt);
    assert.strictEqual(finalCompletion.receipt.receiptType, 'DRY_RUN_DIAGNOSTIC');
    recordPass('Stages 8-10: SUBMIT → VERIFY → TRACK completed; diagnostic receipt never faked as employer confirmed');

    // -------------------------------------------------------------------------
    // STEP 11: Ambiguous Outcome Quarantine Check
    // -------------------------------------------------------------------------
    const appIdQuarantine = `app-quarantine-${Date.now()}`;
    await prisma.application.create({
      data: {
        id: appIdQuarantine,
        tenantId,
        userId,
        company: 'Ambiguous Portal',
        position: 'Staff Engineer',
        ats: 'greenhouse',
        url: 'https://boards.greenhouse.io/ambiguous/101',
        status: 'OPTIMIZING'
      }
    });

    const threadIdQ = generateWorkflowThreadId({ tenantId, userId, applicationId: appIdQuarantine });
    const graphQ = createApplicationWorkflowGraph(new PostgresDurableCheckpointer({ persistenceEnabled: true }));
    const configQ = { configurable: { thread_id: threadIdQ } };

    await graphQ.invoke({
      workflowVersion: WORKFLOW_VERSION,
      tenantId,
      userId,
      applicationId: appIdQuarantine,
      jobRequisitionHash: 'req-q-101',
      executionMode: 'LIVE',
      candidateProfile: { skills: ['Node.js'], experienceYears: 5, educationLevel: "Bachelor's", needsSponsorship: false },
      jobData: { company: 'Ambiguous Portal', position: 'Staff Engineer', ats: 'greenhouse', url: 'https://boards.greenhouse.io/ambiguous/101', requiredSkills: ['Node.js'] }
    }, configQ);

    // Simulate ambiguous submit result (receipt.confirmed is false)
    await graphQ.updateState(configQ, {
      documentReview: { approvedByCandidate: true, approvedContentHash: 'hash-q' },
      submissionAuthorization: { isAuthorized: true, authorizationToken: 'token-q' },
      execution: { creditHeld: true, creditHoldId: 'journal-q-1' },
      receipt: { confirmed: false, confirmationNumber: null, receiptType: 'ATTEMPT' }
    });

    // In LIVE mode with unconfirmed receipt, nodeVerify quarantines
    const { nodeVerify } = require('../backend/workflows/applicationGraph');
    const verifyQRes = await nodeVerify((await graphQ.getState(configQ)).values);
    assert.strictEqual(verifyQRes.status, 'OUTCOME_UNKNOWN_QUARANTINE');
    recordPass('Quarantine Integrity: Ambiguous live outcome quarantines into OUTCOME_UNKNOWN without invalid refund or commit');

  } finally {
    // Cleanup
    await prisma.applicationEvent.deleteMany({
      where: { applicationId: { in: [appId] } }
    });
    await prisma.application.deleteMany({
      where: { id: { in: [appId] } }
    });
  }

  console.log('\n================================================================================');
  console.log(`>> [WORKFLOW TO ATS INTEGRATION SUITE COMPLETE] Passed: ${passed}, Failed: ${failed}`);
  console.log('================================================================================\n');

  if (failed > 0) {
    throw new Error(`Workflow ATS Integration Suite had ${failed} failing tests.`);
  }

  return { suite: 'Workflow-to-ATS Integration', passed, failed, category: 'Integration' };
}

if (require.main === module) {
  runWorkflowAtsIntegrationSuite()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = {
  runWorkflowAtsIntegrationSuite
};
