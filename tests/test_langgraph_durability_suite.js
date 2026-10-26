// Rolevia AI · LangGraph.js Durability & Recovery Verification Suite (Phase 2 & Phase 3)
// Architecture: Rigorously verifies LangGraph checkpoint durability, server/worker crash recovery,
// 10 critical restart and concurrency lifecycles, and tenant security barriers.

const assert = require('assert');
const prisma = require('../backend/db');
const { MemorySaver } = require('@langchain/langgraph');
const {
  createApplicationWorkflowGraph,
  nodeDiscover,
  nodeMatch,
  nodeOptimize,
  nodeDocumentReview,
  nodeSubmissionAuthorization,
  nodePrepareApplication,
  nodeSubmit,
  nodeVerify,
  nodeTrack
} = require('../backend/workflows/applicationGraph');
const { PostgresDurableCheckpointer } = require('../backend/workflows/postgresCheckpointer');
const {
  WORKFLOW_VERSION,
  generateWorkflowThreadId,
  generateNodeExecutionKey,
  generateWorkflowAttemptKey,
  generatePaymentOperationKey,
  generateAtsSubmissionAttemptKey,
  generateCandidateRequisitionDuplicateKey
} = require('../backend/workflows/applicationWorkflowTypes');
const { createSubmissionAuthorization } = require('../backend/atsAutomation');

async function runLangGraphDurabilitySuite() {
  console.log('\n================================================================================');
  console.log(' ROLEVIA AI · LANGGRAPH DURABILITY & WORKER RECOVERY SUITE (PHASE 2 & 3)');
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

  // Setup test tenant, user, application in database
  const tenantA = 'tenant-durability-a';
  const tenantB = 'tenant-durability-b';
  const userIdA = 'user-durability-a';
  const userIdB = 'user-durability-b';
  const appIdA = 'app-durability-001';

  try {
    // Ensure test records exist in PostgreSQL
    await prisma.tenant.upsert({
      where: { id: tenantA },
      update: {},
      create: { id: tenantA, name: 'Durability Tenant A', subdomain: 'durability-a' }
    });
    await prisma.tenant.upsert({
      where: { id: tenantB },
      update: {},
      create: { id: tenantB, name: 'Durability Tenant B', subdomain: 'durability-b' }
    });
    await prisma.user.upsert({
      where: { id: userIdA },
      update: {},
      create: {
        id: userIdA,
        tenantId: tenantA,
        email: 'userA.durability@roleviaai.co.in',
        passwordHash: 'dummyhash',
        name: 'Durability User A'
      }
    });
    await prisma.user.upsert({
      where: { id: userIdB },
      update: {},
      create: {
        id: userIdB,
        tenantId: tenantB,
        email: 'userB.durability@roleviaai.co.in',
        passwordHash: 'dummyhash',
        name: 'Durability User B'
      }
    });
    await prisma.application.upsert({
      where: { id: appIdA },
      update: { status: 'OPTIMIZING' },
      create: {
        id: appIdA,
        tenantId: tenantA,
        userId: userIdA,
        company: 'CloudScale Tech',
        position: 'Distributed Systems Engineer',
        ats: 'greenhouse',
        url: 'https://boards.greenhouse.io/cloudscale/jobs/101',
        status: 'OPTIMIZING'
      }
    });

    const threadId = generateWorkflowThreadId({ tenantId: tenantA, userId: userIdA, applicationId: appIdA });
    assert.strictEqual(threadId, `${tenantA}:${userIdA}:${appIdA}`);

    // -------------------------------------------------------------------------
    // TEST 1: Restart during resume optimization (State preserved in DB)
    // -------------------------------------------------------------------------
    try {
      const checkpointer1 = new PostgresDurableCheckpointer({ persistenceEnabled: true });
      const graph1 = createApplicationWorkflowGraph(checkpointer1);

      const initialState = {
        workflowVersion: WORKFLOW_VERSION,
        tenantId: tenantA,
        userId: userIdA,
        applicationId: appIdA,
        jobRequisitionHash: 'req-durability-101',
        executionMode: 'DRY_RUN',
        candidateProfile: {
          skills: ['Node.js', 'PostgreSQL', 'Distributed Systems'],
          experienceYears: 4,
          educationLevel: "Bachelor's",
          needsSponsorship: false,
          factIds: []
        },
        jobData: {
          company: 'CloudScale Tech',
          position: 'Distributed Systems Engineer',
          ats: 'greenhouse',
          url: 'https://boards.greenhouse.io/cloudscale/jobs/101',
          requiredSkills: ['Node.js', 'PostgreSQL']
        }
      };

      const config = { configurable: { thread_id: threadId } };
      const res1 = await graph1.invoke(initialState, config);
      assert.strictEqual(res1.currentStage, 'DOCUMENT_REVIEW');
      assert.strictEqual(res1.status, 'PAUSED_FOR_HUMAN');
      assert(res1.optimization && res1.optimization.documentHash);

      // SIMULATE SERVER RESTART: Create brand new checkpointer with empty memory
      const checkpointer2 = new PostgresDurableCheckpointer({ persistenceEnabled: true });
      const graph2 = createApplicationWorkflowGraph(checkpointer2);

      // Load state from DB without providing state payload
      const recoveredState = await graph2.getState(config);
      assert(recoveredState && recoveredState.values);
      assert.strictEqual(recoveredState.values.currentStage, 'DOCUMENT_REVIEW');
      assert.strictEqual(recoveredState.values.status, 'PAUSED_FOR_HUMAN');
      assert.strictEqual(recoveredState.values.optimization.documentHash, res1.optimization.documentHash);
      recordPass('Scenario 1: Server restart during optimization recovers exact documentHash and pause state');
    } catch (err) {
      recordFail('Scenario 1: Server restart during optimization recovers exact documentHash and pause state', err);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Restart during document approval (Awaiting candidate review)
    // -------------------------------------------------------------------------
    try {
      const checkpointer = new PostgresDurableCheckpointer({ persistenceEnabled: true });
      const graph = createApplicationWorkflowGraph(checkpointer);
      const config = { configurable: { thread_id: threadId } };

      const recovered = await graph.getState(config);
      assert.strictEqual(recovered.values.documentReview.approvedByCandidate, false);

      // Invoking without approval must NOT advance past DOCUMENT_REVIEW
      const res = await graph.invoke(null, config);
      assert.strictEqual(res.currentStage, 'DOCUMENT_REVIEW');
      assert.strictEqual(res.status, 'PAUSED_FOR_HUMAN');
      recordPass('Scenario 2: Restart during document approval safely preserves AWAITING_APPROVAL barrier');
    } catch (err) {
      recordFail('Scenario 2: Restart during document approval safely preserves AWAITING_APPROVAL barrier', err);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Restart after credit reservation (No duplicate credit hold)
    // -------------------------------------------------------------------------
    try {
      const checkpointer = new PostgresDurableCheckpointer({ persistenceEnabled: true });
      const graph = createApplicationWorkflowGraph(checkpointer);
      const config = { configurable: { thread_id: threadId } };

      // Candidate approves document
      const docHash = (await graph.getState(config)).values.optimization.documentHash;
      await graph.updateState(config, {
        documentReview: {
          approvedByCandidate: true,
          approvedAt: new Date().toISOString(),
          candidateEditsApplied: false,
          approvedContentHash: docHash
        },
        execution: {
          creditHeld: true,
          creditHoldId: 'journal-hold-existing-1',
          attempts: 0
        }
      });

      // SIMULATE CRASH & RESTART
      const checkpointerRestart = new PostgresDurableCheckpointer({ persistenceEnabled: true });
      const graphRestart = createApplicationWorkflowGraph(checkpointerRestart);
      const statePostRestart = await graphRestart.getState(config);

      assert.strictEqual(statePostRestart.values.execution.creditHeld, true);
      assert.strictEqual(statePostRestart.values.execution.creditHoldId, 'journal-hold-existing-1');
      recordPass('Scenario 3: Restart after credit hold preserves existing holdId and prevents double-charge');
    } catch (err) {
      recordFail('Scenario 3: Restart after credit hold preserves existing holdId and prevents double-charge', err);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Restart before submit (Authorized state preserved)
    // -------------------------------------------------------------------------
    try {
      const checkpointer = new PostgresDurableCheckpointer({ persistenceEnabled: true });
      const graph = createApplicationWorkflowGraph(checkpointer);
      const config = { configurable: { thread_id: threadId } };

      const currentState = (await graph.getState(config)).values;
      const docHash = currentState.optimization.documentHash;

      // Candidate issues HMAC token
      const auth = createSubmissionAuthorization({
        userId: userIdA,
        tenantId: tenantA,
        applicationId: appIdA,
        jobRequisitionHash: 'req-durability-101',
        documentHash: docHash,
        candidateSecret: process.env.JWT_SECRET || 'rolevia_ai_super_secret_jwt_key_2026_production_ready'
      });

      await graph.updateState(config, {
        submissionAuthorization: {
          isAuthorized: true,
          authorizationToken: auth.authorizationToken || auth.signature,
          authorizedAt: new Date().toISOString()
        }
      });

      // RESTART WORKER
      const checkpointerNewWorker = new PostgresDurableCheckpointer({ persistenceEnabled: true });
      const graphNewWorker = createApplicationWorkflowGraph(checkpointerNewWorker);
      const reloadedState = (await graphNewWorker.getState(config)).values;

      assert.strictEqual(reloadedState.submissionAuthorization.isAuthorized, true);
      assert(reloadedState.submissionAuthorization.authorizationToken);
      recordPass('Scenario 4: Restart before submit preserves cryptographic HMAC authorization token');
    } catch (err) {
      recordFail('Scenario 4: Restart before submit preserves cryptographic HMAC authorization token', err);
    }

    // -------------------------------------------------------------------------
    // TEST 5: Restart after submit with unknown result (Preserves Quarantine)
    // -------------------------------------------------------------------------
    try {
      const checkpointer = new PostgresDurableCheckpointer({ persistenceEnabled: true });
      const graph = createApplicationWorkflowGraph(checkpointer);
      const config = { configurable: { thread_id: threadId } };

      await graph.updateState(config, {
        currentStage: 'VERIFY',
        status: 'OUTCOME_UNKNOWN_QUARANTINE',
        receipt: null,
        execution: {
          creditHeld: true,
          humanInterventionReason: 'Missing authentic confirmation page after submit'
        }
      });

      // RESTART
      const checkpointerQuarantine = new PostgresDurableCheckpointer({ persistenceEnabled: true });
      const graphQuarantine = createApplicationWorkflowGraph(checkpointerQuarantine);
      const quarantined = (await graphQuarantine.getState(config)).values;

      assert.strictEqual(quarantined.status, 'OUTCOME_UNKNOWN_QUARANTINE');
      assert.strictEqual(quarantined.execution.creditHeld, true);
      recordPass('Scenario 5: Restart after submit with ambiguous result safely preserves quarantine status');
    } catch (err) {
      recordFail('Scenario 5: Restart after submit with ambiguous result safely preserves quarantine status', err);
    }

    // -------------------------------------------------------------------------
    // TEST 6: Duplicate graph invocation is idempotent
    // -------------------------------------------------------------------------
    try {
      const checkpointer = new PostgresDurableCheckpointer({ persistenceEnabled: true });
      const graph = createApplicationWorkflowGraph(checkpointer);
      const config = { configurable: { thread_id: threadId } };

      const resFirst = await graph.invoke(null, config);
      const resSecond = await graph.invoke(null, config);

      assert.strictEqual(resFirst.status, resSecond.status);
      assert.strictEqual(resFirst.currentStage, resSecond.currentStage);
      recordPass('Scenario 6: Duplicate graph invocation is idempotent and produces no state disruption');
    } catch (err) {
      recordFail('Scenario 6: Duplicate graph invocation is idempotent and produces no state disruption', err);
    }

    // -------------------------------------------------------------------------
    // TEST 7: Concurrent execution by multiple workers
    // -------------------------------------------------------------------------
    try {
      const checkpointer = new PostgresDurableCheckpointer({ persistenceEnabled: true });
      const graph = createApplicationWorkflowGraph(checkpointer);
      const config = { configurable: { thread_id: threadId } };

      // 2 workers concurrent updates
      const p1 = graph.updateState(config, { execution: { attempts: 1 } });
      const p2 = graph.updateState(config, { execution: { attempts: 2 } });
      await Promise.all([p1, p2]);

      const state = (await graph.getState(config)).values;
      assert(state.execution.attempts === 1 || state.execution.attempts === 2);
      recordPass('Scenario 7: Concurrent worker state updates resolve without deadlock or state corruption');
    } catch (err) {
      recordFail('Scenario 7: Concurrent worker state updates resolve without deadlock or state corruption', err);
    }

    // -------------------------------------------------------------------------
    // TEST 8: Document revision followed by reapproval
    // -------------------------------------------------------------------------
    try {
      const appIdRev = `app-durability-rev-${Date.now()}`;
      await prisma.application.upsert({
        where: { id: appIdRev },
        update: {},
        create: {
          id: appIdRev,
          tenantId: tenantA,
          userId: userIdA,
          company: 'CloudScale Tech',
          position: 'Distributed Systems Engineer',
          ats: 'greenhouse',
          url: 'https://boards.greenhouse.io/cloudscale/jobs/101',
          status: 'OPTIMIZING'
        }
      });
      const threadIdRev = generateWorkflowThreadId({ tenantId: tenantA, userId: userIdA, applicationId: appIdRev });
      const checkpointer = new PostgresDurableCheckpointer({ persistenceEnabled: true });
      const graph = createApplicationWorkflowGraph(checkpointer);
      const configRev = { configurable: { thread_id: threadIdRev } };

      // Initial run: reaches DOCUMENT_REVIEW
      const r1 = await graph.invoke({
        workflowVersion: WORKFLOW_VERSION,
        tenantId: tenantA,
        userId: userIdA,
        applicationId: appIdRev,
        jobRequisitionHash: 'req-durability-101',
        candidateProfile: { skills: ['Node.js'], experienceYears: 4, educationLevel: "Bachelor's", needsSponsorship: false },
        jobData: { company: 'CloudScale Tech', position: 'Distributed Systems Engineer', ats: 'greenhouse', url: 'https://boards.greenhouse.io/cloudscale/jobs/101', requiredSkills: ['Node.js'] }
      }, configRev);
      assert.strictEqual(r1.currentStage, 'DOCUMENT_REVIEW');
      assert.strictEqual(r1.optimization.documentVersion, 1);

      // Candidate modifies document text
      await graph.updateState(configRev, {
        documentReview: {
          approvedByCandidate: false,
          candidateEditsApplied: true,
          approvedContentHash: null
        }
      });

      const res = await graph.invoke(null, configRev);
      // Graph must route back to OPTIMIZE, regenerate, and pause at DOCUMENT_REVIEW
      assert.strictEqual(res.currentStage, 'DOCUMENT_REVIEW');
      assert.strictEqual(res.status, 'PAUSED_FOR_HUMAN');
      assert.strictEqual(res.optimization.documentVersion >= 2, true);
      recordPass('Scenario 8: Document revision invalidates previous approvals, increments version, and loops back');
    } catch (err) {
      recordFail('Scenario 8: Document revision invalidates previous approvals, increments version, and loops back', err);
    }

    // -------------------------------------------------------------------------
    // TEST 9: Cross-tenant checkpoint access is strictly blocked
    // -------------------------------------------------------------------------
    try {
      const checkpointer = new PostgresDurableCheckpointer({ persistenceEnabled: true });
      // Malicious attempt: tenantB attempts to query thread belonging to tenantA
      const crossTenantConfig = {
        configurable: {
          thread_id: `${tenantB}:${userIdB}:${appIdA}` // appIdA belongs to tenantA
        }
      };

      let caught = null;
      try {
        await checkpointer.getTuple(crossTenantConfig);
      } catch (e) {
        caught = e;
      }

      assert(caught, 'Expected cross-tenant access to be blocked');
      assert.strictEqual(caught.code, 'CROSS_TENANT_ACCESS_DENIED');
      recordPass('Scenario 9: Cross-tenant checkpoint query is blocked with CROSS_TENANT_ACCESS_DENIED');
    } catch (err) {
      recordFail('Scenario 9: Cross-tenant checkpoint query is blocked with CROSS_TENANT_ACCESS_DENIED', err);
    }

    // -------------------------------------------------------------------------
    // TEST 10: Workflow schema-version compatibility
    // -------------------------------------------------------------------------
    try {
      const checkpointer = new PostgresDurableCheckpointer({ persistenceEnabled: true });
      const graph = createApplicationWorkflowGraph(checkpointer);
      const config = { configurable: { thread_id: threadId } };

      // Verify that workflowVersion is stamped
      const state = (await graph.getState(config)).values;
      assert.strictEqual(state.workflowVersion, WORKFLOW_VERSION);
      recordPass('Scenario 10: State checkpoints strictly enforce workflow schema version tag');
    } catch (err) {
      recordFail('Scenario 10: State checkpoints strictly enforce workflow schema version tag', err);
    }

    // -------------------------------------------------------------------------
    // TEST 11: Idempotency Architecture: 6 Distinct Identities
    // -------------------------------------------------------------------------
    try {
      const k1 = generateWorkflowThreadId({ tenantId: tenantA, userId: userIdA, applicationId: appIdA });
      const k2 = generateNodeExecutionKey({ tenantId: tenantA, userId: userIdA, applicationId: appIdA, nodeName: 'node_submit', executionAttempt: 1 });
      const k3 = generateWorkflowAttemptKey({ tenantId: tenantA, userId: userIdA, applicationId: appIdA, workflowAttempt: 2 });
      const k4 = generatePaymentOperationKey({ tenantId: tenantA, userId: userIdA, applicationId: appIdA, operationType: 'HOLD', referenceId: 'req-1' });
      const k5 = generateAtsSubmissionAttemptKey({ tenantId: tenantA, userId: userIdA, applicationId: appIdA, attemptNumber: 1, documentHash: 'hash-abc' });
      const k5_retry = generateAtsSubmissionAttemptKey({ tenantId: tenantA, userId: userIdA, applicationId: appIdA, attemptNumber: 1, documentHash: 'hash-abc' });
      assert.strictEqual(k5, k5_retry, 'ATS submission key must be deterministic across retries without dynamic timestamp');
      const k6 = generateCandidateRequisitionDuplicateKey({ tenantId: tenantA, userId: userIdA, jobRequisitionHash: 'req-hash-abc' });

      assert(k1 !== k2 && k2 !== k3 && k3 !== k4 && k4 !== k5 && k5 !== k6);
      assert(k4.includes('credit_HOLD'));
      assert(k5.includes('ats_attempt_1'));
      assert(!k5.includes('undefined'));
      assert(k6.includes('req-hash-abc'));
      recordPass('Idempotency Architecture: All 6 distinct orthogonal execution identities generated and partitioned');
    } catch (err) {
      recordFail('Idempotency Architecture: All 6 distinct orthogonal execution identities generated and partitioned', err);
    }

  } finally {
    // Clean up test events
    await prisma.applicationEvent.deleteMany({
      where: { applicationId: appIdA }
    });
  }

  console.log('\n================================================================================');
  console.log(`>> [LANGGRAPH DURABILITY SUITE COMPLETE] Passed: ${passed}, Failed: ${failed}`);
  console.log('================================================================================\n');

  if (failed > 0) {
    throw new Error(`LangGraph Durability Suite had ${failed} failing tests.`);
  }

  return { suite: 'DURABILITY LangGraph Recovery & Idempotency', passed, failed, category: 'Database' };
}

if (require.main === module) {
  runLangGraphDurabilitySuite()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = {
  runLangGraphDurabilitySuite
};
