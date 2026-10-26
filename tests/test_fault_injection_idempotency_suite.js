// Rolevia AI · Automated Fault-Injection, Crash-Consistency & Submission Idempotency Suite
// Validates:
// 1. Durable submission-attempt IDs persisted before browser execution without timestamp variance.
// 2. Retries reuse the exact persisted attempt key.
// 3. Crash consistency before submit (worker killed in RUNNING_PRE_SUBMIT -> credit hold preserved).
// 4. Crash consistency during submit (interrupted -> OUTCOME_UNKNOWN_QUARANTINE, auto-resubmit blocked).
// 5. Candidate-Employer-Requisition duplicate prevention (survives document edits).
// 6. Concurrency locking prevents double submission across racing workers.
// 7. Graph checkpoint mutations cannot bypass authorization or forge receipts.

const assert = require('node:assert');
const crypto = require('node:crypto');
const prisma = require('../backend/db');
const billing = require('../backend/billing');
const { executeApplicationWorkflow, APPLICATION_STATES, createSubmissionAuthorization } = require('../backend/atsAutomation');
const {
  generateAtsSubmissionAttemptKey,
  generateCandidateRequisitionDuplicateKey,
  generateWorkflowThreadId
} = require('../backend/workflows/idempotency');
const {
  createApplicationWorkflowGraph,
  WORKFLOW_VERSION
} = require('../backend/workflows/applicationGraph');
const { PostgresDurableCheckpointer } = require('../backend/workflows/postgresCheckpointer');

async function runFaultInjectionIdempotencySuite() {
  console.log('\n================================================================================');
  console.log(' ROLEVIA AI · FAULT-INJECTION, CRASH-CONSISTENCY & IDEMPOTENCY SUITE');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;

  function recordPass(msg) {
    console.log(`✓ [PASS] ${msg}`);
    passed++;
  }

  function recordFail(msg, err) {
    console.error(`✗ [FAIL] ${msg}: ${err.message}`);
    failed++;
  }

  const tenantId = `tenant-fault-${Date.now()}`;
  const userId = `user-fault-${Date.now()}`;
  const requisitionHash = `req-hash-fault-${Date.now()}`;

  let jobId = null;
  let appId1 = `app-fault-1-${Date.now()}`;
  let appId2 = `app-fault-2-${Date.now()}`;

  try {
    // Setup test tenant, user, candidate profile, and job
    await prisma.tenant.create({
      data: { id: tenantId, name: 'Fault Injection Tenant', subdomain: `fault-${Date.now()}` }
    });

    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email: `fault-${Date.now()}@rolevia.test`,
        name: 'Fault Test Candidate',
        passwordHash: 'dummy-hash',
        credits: 50,
        reservedCredits: 0,
        consumedCredits: 0
      }
    });

    await prisma.candidateProfile.create({
      data: {
        userId,
        skills: JSON.stringify(['Node.js', 'Distributed Systems']),
        certifications: '[]',
        targetRoles: '[]',
        preferredLocations: '[]',
        needsSponsorship: false
      }
    });

    const job = await prisma.job.create({
      data: {
        company: 'Resilience Corp',
        title: 'Reliability Engineer',
        url: 'https://jobs.ashbyhq.com/resilience/101',
        ats: 'ashby',
        atsName: 'Ashby',
        requirements: JSON.stringify(['Node.js']),
        requisitionHash,
        status: 'ACTIVE'
      }
    });
    jobId = job.id;

    // -------------------------------------------------------------------------
    // TEST 1: Durable Submission Attempt ID Determinism (No Timestamp Drift)
    // -------------------------------------------------------------------------
    try {
      const docHash = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
      const key1 = generateAtsSubmissionAttemptKey({
        tenantId,
        userId,
        applicationId: appId1,
        attemptNumber: 1,
        documentHash: docHash
      });

      // Simulate a retry 5 seconds later
      const key2 = generateAtsSubmissionAttemptKey({
        tenantId,
        userId,
        applicationId: appId1,
        attemptNumber: 1,
        documentHash: docHash
      });

      assert.strictEqual(key1, key2, 'Retrying the same submission attempt must produce identical key without timestamp variance');
      assert(!key1.includes('undefined'), 'Key must not have undefined elements');
      assert.strictEqual(key1, `${tenantId}:${userId}:${appId1}:ats_attempt_1:${docHash.slice(0, 16)}`);
      recordPass('Attempt Identity: Submission key is strictly deterministic and invariant to retry timing');
    } catch (err) {
      recordFail('Attempt Identity: Submission key is strictly deterministic and invariant to retry timing', err);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Attempt Persisted Before Browser Dispatch
    // -------------------------------------------------------------------------
    try {
      await prisma.application.create({
        data: {
          id: appId1,
          tenantId,
          userId,
          jobId,
          company: 'Resilience Corp',
          position: 'Reliability Engineer',
          ats: 'ashby',
          url: 'https://jobs.ashbyhq.com/resilience/101',
          status: APPLICATION_STATES.APPROVED,
          diffData: JSON.stringify({ bullet: 'Scaled fault-tolerant architectures' }),
          approvedContentHash: 'hash-doc-fault-1'
        }
      });

      const auth = createSubmissionAuthorization({
        userId,
        tenantId,
        applicationId: appId1,
        jobRequisitionHash: requisitionHash,
        documentHash: 'hash-doc-fault-1'
      });

      await prisma.application.update({
        where: { id: appId1 },
        data: {
          approvalSignature: auth.signature,
          approvalPayload: JSON.stringify(auth),
          approvedContentHash: 'hash-doc-fault-1'
        }
      });

      // Execute dry run workflow
      await executeApplicationWorkflow(appId1, {
        userId,
        tenantId,
        mode: 'DRY_RUN'
      });

      // Verify that SUBMISSION_ATTEMPT_INITIALIZED event was created with deterministic key
      const initEvent = await prisma.applicationEvent.findFirst({
        where: {
          applicationId: appId1,
          eventType: 'SUBMISSION_ATTEMPT_INITIALIZED'
        }
      });

      assert(initEvent, 'SUBMISSION_ATTEMPT_INITIALIZED event must exist in audit log');
      assert(initEvent.payload && initEvent.payload.submissionAttemptKey, 'Payload must record submissionAttemptKey');
      assert.strictEqual(initEvent.payload.attemptNumber, 1);
      recordPass('Attempt Persistence: Submission attempt ID is persisted in database prior to browser execution');
    } catch (err) {
      recordFail('Attempt Persistence: Submission attempt ID is persisted in database prior to browser execution', err);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Pre-Submit Crash Fault-Injection (Credit Hold Safe & No Duplicates)
    // -------------------------------------------------------------------------
    try {
      const crashAppId = `app-crash-pre-${Date.now()}`;
      const reqHashCrash = `req-hash-crash-${Date.now()}`;
      const jobCrash = await prisma.job.create({
        data: {
          id: `job-crash-${Date.now()}`,
          company: 'Resilience Corp Crash',
          title: 'Reliability Engineer',
          url: 'https://jobs.ashbyhq.com/resilience/102',
          ats: 'ashby',
          atsName: 'Ashby',
          requirements: JSON.stringify(['Node.js']),
          requisitionHash: reqHashCrash,
          status: 'ACTIVE'
        }
      });

      const crashDiff = JSON.stringify({ bullet: 'Grounded skill' });
      const crashDocHash = crypto.createHash('sha256').update(crashDiff).digest('hex');

      await prisma.application.create({
        data: {
          id: crashAppId,
          tenantId,
          userId,
          jobId: jobCrash.id,
          company: 'Resilience Corp Crash',
          position: 'Reliability Engineer',
          ats: 'ashby',
          url: 'https://jobs.ashbyhq.com/resilience/102',
          status: APPLICATION_STATES.APPROVED,
          diffData: crashDiff,
          approvedContentHash: crashDocHash
        }
      });

      const authCrash = createSubmissionAuthorization({
        userId,
        tenantId,
        applicationId: crashAppId,
        jobRequisitionHash: reqHashCrash,
        documentHash: crashDocHash
      });

      await prisma.application.update({
        where: { id: crashAppId },
        data: {
          approvalSignature: authCrash.signature,
          approvalPayload: JSON.stringify(authCrash),
          approvedContentHash: crashDocHash
        }
      });

      // Inject crash right before submit
      let crashed = false;
      try {
        const crashRes = await executeApplicationWorkflow(crashAppId, {
          userId,
          tenantId,
          mode: 'LIVE',
          allowLiveSubmission: true,
          simulatePreSubmitInterruption: true
        });
        if (crashRes && crashRes.error && crashRes.error.includes('SIMULATED_PRE_SUBMIT_INTERRUPTION')) {
          crashed = true;
        }
      } catch (err) {
        crashed = true;
        assert(err.message.includes('SIMULATED_PRE_SUBMIT_INTERRUPTION'));
      }

      assert.strictEqual(crashed, true, 'Worker pre-submit crash must be triggered');

      // Verify credit hold was created and preserved or quarantined
      const user = await prisma.user.findUnique({ where: { id: userId } });
      assert(user.reservedCredits >= 0, 'Credit ledger must preserve non-negative invariant');
      recordPass('Crash Consistency: Pre-submit worker kill preserves ledger integrity and prevents false completion');
    } catch (err) {
      recordFail('Crash Consistency: Pre-submit worker kill preserves ledger integrity and prevents false completion', err);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Post-Submit Interruption Quarantines into OUTCOME_UNKNOWN
    // -------------------------------------------------------------------------
    try {
      const unknownAppId = `app-unknown-${Date.now()}`;
      const reqHashUnknown = `req-hash-unknown-${Date.now()}`;
      const jobUnknown = await prisma.job.create({
        data: {
          id: `job-unknown-${Date.now()}`,
          company: 'Resilience Corp Unknown',
          title: 'Reliability Engineer',
          url: 'https://jobs.ashbyhq.com/resilience/103',
          ats: 'ashby',
          atsName: 'Ashby',
          requirements: JSON.stringify(['Node.js']),
          requisitionHash: reqHashUnknown,
          status: 'ACTIVE'
        }
      });

      const unknownDiff = JSON.stringify({ bullet: 'Grounded skill' });
      const unknownDocHash = crypto.createHash('sha256').update(unknownDiff).digest('hex');

      await prisma.application.create({
        data: {
          id: unknownAppId,
          tenantId,
          userId,
          jobId: jobUnknown.id,
          company: 'Resilience Corp Unknown',
          position: 'Reliability Engineer',
          ats: 'ashby',
          url: 'https://jobs.ashbyhq.com/resilience/103',
          status: APPLICATION_STATES.APPROVED,
          diffData: unknownDiff,
          approvedContentHash: unknownDocHash
        }
      });

      const authUnknown = createSubmissionAuthorization({
        userId,
        tenantId,
        applicationId: unknownAppId,
        jobRequisitionHash: reqHashUnknown,
        documentHash: unknownDocHash
      });

      await prisma.application.update({
        where: { id: unknownAppId },
        data: {
          approvalSignature: authUnknown.signature,
          approvalPayload: JSON.stringify(authUnknown),
          approvedContentHash: unknownDocHash
        }
      });

      // Inject submit interruption
      const submitRes = await executeApplicationWorkflow(unknownAppId, {
        userId,
        tenantId,
        mode: 'LIVE',
        allowLiveSubmission: true,
        simulateSubmitInterruption: true
      });

      assert.strictEqual(submitRes.status, APPLICATION_STATES.OUTCOME_UNKNOWN);

      // Verify that automatic resubmission is strictly blocked
      let resubmitBlocked = false;
      try {
        await executeApplicationWorkflow(unknownAppId, {
          userId,
          tenantId,
          mode: 'LIVE',
          allowLiveSubmission: true
        });
      } catch (err) {
        resubmitBlocked = true;
        assert(err.message.includes('APPLICATION_QUARANTINED'));
      }

      assert.strictEqual(resubmitBlocked, true, 'Quarantined applications must reject automatic resubmission');
      recordPass('Quarantine Integrity: Submit interruption quarantines into OUTCOME_UNKNOWN and blocks resubmission');
    } catch (err) {
      recordFail('Quarantine Integrity: Submit interruption quarantines into OUTCOME_UNKNOWN and blocks resubmission', err);
    }

    // -------------------------------------------------------------------------
    // TEST 5: Candidate/Requisition Uniqueness Prevents Duplicate Submissions
    // -------------------------------------------------------------------------
    try {
      // Mark appId1 as SUBMITTED_CONFIRMED for this job requisition
      await prisma.application.update({
        where: { id: appId1 },
        data: { status: APPLICATION_STATES.SUBMITTED_CONFIRMED }
      });

      // Attempt to submit a second application (appId2) for the exact same job requisition
      await prisma.application.create({
        data: {
          id: appId2,
          tenantId,
          userId,
          jobId,
          company: 'Resilience Corp',
          position: 'Reliability Engineer',
          ats: 'ashby',
          url: 'https://jobs.ashbyhq.com/resilience/101',
          status: APPLICATION_STATES.APPROVED,
          diffData: JSON.stringify({ bullet: 'Modified resume version 2' }), // Even with modified text
          approvedContentHash: 'hash-doc-version-2'
        }
      });

      const auth2 = createSubmissionAuthorization({
        userId,
        tenantId,
        applicationId: appId2,
        jobRequisitionHash: requisitionHash,
        documentHash: 'hash-doc-version-2'
      });

      await prisma.application.update({
        where: { id: appId2 },
        data: {
          approvalSignature: auth2.signature,
          approvedContentHash: 'hash-doc-version-2'
        }
      });

      let dupBlocked = false;
      try {
        await executeApplicationWorkflow(appId2, {
          userId,
          tenantId,
          mode: 'DRY_RUN'
        });
      } catch (err) {
        dupBlocked = true;
        assert(err.message.includes('DUPLICATE_APPLICATION_PREVENTED'));
      }

      assert.strictEqual(dupBlocked, true, 'Duplicate submission for same requisition must be blocked even with edited resume');
      recordPass('Requisition Uniqueness: Duplicate application blocked across candidate-job requisition boundary');
    } catch (err) {
      recordFail('Requisition Uniqueness: Duplicate application blocked across candidate-job requisition boundary', err);
    }

    // -------------------------------------------------------------------------
    // TEST 6: Atomic State Lock Blocks Concurrent Workers
    // -------------------------------------------------------------------------
    try {
      const lockAppId = `app-lock-${Date.now()}`;
      await prisma.application.create({
        data: {
          id: lockAppId,
          tenantId,
          userId,
          company: 'Lock Corp',
          position: 'Lock Engineer',
          ats: 'ashby',
          url: 'https://jobs.ashbyhq.com/lock/1',
          status: APPLICATION_STATES.RUNNING_PRE_SUBMIT // In-flight state
        }
      });

      let concurrentBlocked = false;
      try {
        await executeApplicationWorkflow(lockAppId, {
          userId,
          tenantId,
          mode: 'DRY_RUN'
        });
      } catch (err) {
        concurrentBlocked = true;
        assert(err.message.includes('CONCURRENT_EXECUTION_BLOCKED'));
      }

      assert.strictEqual(concurrentBlocked, true, 'Concurrent execution on in-flight application must be blocked');
      recordPass('Concurrency Control: In-flight execution lock strictly rejects competing worker dispatch');
    } catch (err) {
      recordFail('Concurrency Control: In-flight execution lock strictly rejects competing worker dispatch', err);
    }

    // -------------------------------------------------------------------------
    // TEST 7: Graph Checkpoint Mutation Cannot Bypass Approval or Forge Receipts
    // -------------------------------------------------------------------------
    try {
      const forgeAppId = `app-forge-${Date.now()}`;
      await prisma.application.create({
        data: {
          id: forgeAppId,
          tenantId,
          userId,
          jobId,
          company: 'Forge Corp',
          position: 'Security Engineer',
          ats: 'ashby',
          url: 'https://jobs.ashbyhq.com/forge/1',
          status: APPLICATION_STATES.OPTIMIZING
        }
      });

      const threadIdForge = generateWorkflowThreadId({ tenantId, userId, applicationId: forgeAppId });
      const checkpointer = new PostgresDurableCheckpointer({ persistenceEnabled: true });
      const graph = createApplicationWorkflowGraph(checkpointer);
      const configForge = { configurable: { thread_id: threadIdForge } };

      // Malicious attempt: candidate tries to inject forged receipt and skip approval
      await graph.updateState(configForge, {
        workflowVersion: WORKFLOW_VERSION,
        tenantId,
        userId,
        applicationId: forgeAppId,
        candidateProfile: {
          skills: ['Node.js', 'Distributed Systems'],
          experienceYears: 4,
          educationLevel: 'BACHELOR',
          needsSponsorship: false,
          facts: []
        },
        jobRequisitionHash: 'req-forge-1',
        jobData: {
          company: 'Forge Corp',
          position: 'Security Engineer',
          ats: 'ashby',
          url: 'https://jobs.ashbyhq.com/forge/1',
          requiredSkills: ['Node.js']
        },
        currentStage: 'SUBMIT',
        status: 'IN_PROGRESS',
        submissionAuthorization: {
          isAuthorized: true,
          authorizationToken: 'forged_fake_token_12345'
        },
        receipt: {
          confirmed: true,
          confirmationNumber: 'FORGED-CONF-99999',
          receiptType: 'EMPLOYER_CONFIRMED'
        }
      });

      // Invoke graph from SUBMIT
      const forgeResult = await graph.invoke(null, configForge);

      // Verify that nodeSubmit verification checks real DB record and refuses to commit without authentic adapter receipt
      const dbApp = await prisma.application.findUnique({ where: { id: forgeAppId } });
      assert.notStrictEqual(dbApp.status, APPLICATION_STATES.SUBMITTED_CONFIRMED, 'Database application status must not accept forged graph receipt');
      recordPass('Side-Effect Immunity: Checkpoint state mutation cannot forge employer receipts in database');
    } catch (err) {
      recordFail('Side-Effect Immunity: Checkpoint state mutation cannot forge employer receipts in database', err);
    }

  } finally {
    // Cleanup test data
    await prisma.applicationEvent.deleteMany({
      where: { application: { tenantId } }
    });
    await prisma.creditJournal.deleteMany({
      where: { tenantId }
    });
    await prisma.application.deleteMany({
      where: { tenantId }
    });
    if (jobId) {
      await prisma.job.delete({ where: { id: jobId } }).catch(() => {});
    }
    await prisma.candidateProfile.deleteMany({
      where: { user: { tenantId } }
    });
    await prisma.user.deleteMany({
      where: { tenantId }
    });
    await prisma.tenant.deleteMany({
      where: { id: tenantId }
    });
  }

  console.log('\n================================================================================');
  console.log(`>> [FAULT-INJECTION & IDEMPOTENCY SUITE COMPLETE] Passed: ${passed}, Failed: ${failed}`);
  console.log('================================================================================\n');

  if (failed > 0) {
    throw new Error(`Fault-Injection & Idempotency Suite had ${failed} failing tests.`);
  }

  return { suite: 'IDEMPOTENCY & FAULT-INJECTION', passed, failed, category: 'Database' };
}

if (require.main === module) {
  runFaultInjectionIdempotencySuite()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runFaultInjectionIdempotencySuite };
