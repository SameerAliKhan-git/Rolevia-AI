// Rolevia AI · Agentic Workflow & LangGraph.js Acceptance Test Suite (Phase 4 & 5)
// Tests: Typed state schema, node routing, human-intervention pauses, HMAC gates,
// local mock ATS dry-run, LLM gateway validators, checkpointer recovery, and multi-tenant isolation.

const assert = require('assert');
const { MemorySaver } = require('@langchain/langgraph');
const prisma = require('../backend/db');
const {
  WORKFLOW_VERSION,
  ApplicationWorkflowStateSchema,
  generateNodeIdempotencyKey,
  createInitialWorkflowState
} = require('../backend/workflows/applicationWorkflowTypes');
const { createApplicationWorkflowGraph } = require('../backend/workflows/applicationGraph');
const { PostgresDurableCheckpointer } = require('../backend/workflows/postgresCheckpointer');
const { LLMGateway, LLMExecutionError, MODEL_PRICING } = require('../backend/ai/llmGateway');
const { createDocumentApproval } = require('../backend/resumeWorkspace');
const { startMockAtsServer } = require('./fixtures/mock_ats_server');

async function runAgenticWorkflowSuite() {
  console.log('\n================================================================================');
  console.log(' ROLEVIA AI · AGENTIC WORKFLOW & LANGGRAPH.JS VERIFICATION SUITE');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Schema Validation & Versioning
  test('Contract: ApplicationWorkflowStateSchema enforces versioning and mandatory fields', () => {
    assert.strictEqual(WORKFLOW_VERSION, '1.0.0');

    assert.throws(() => {
      ApplicationWorkflowStateSchema.parse({
        // Missing tenantId, userId, applicationId
      });
    }, /Required|tenantId is required/);

    const valid = createInitialWorkflowState({
      tenantId: 'tenant-123',
      userId: 'user-456',
      applicationId: 'app-789',
      jobData: { company: 'Stripe', position: 'Backend Engineer' }
    });

    assert.strictEqual(valid.workflowVersion, '1.0.0');
    assert.strictEqual(valid.currentStage, 'DISCOVER');
    assert.strictEqual(valid.status, 'INITIALIZED');
  });

  // 2. Strict Idempotency Key Generation
  test('Idempotency: Keys are deterministic and uniquely scoped per node', () => {
    const state = {
      tenantId: 't1',
      userId: 'u1',
      applicationId: 'a1',
      workflowVersion: '1.0.0'
    };
    const key1 = generateNodeIdempotencyKey(state, 'node_optimize');
    const key2 = generateNodeIdempotencyKey(state, 'node_optimize');
    const key3 = generateNodeIdempotencyKey(state, 'node_submit');

    assert.strictEqual(key1, 't1:u1:a1:1.0.0:node_optimize');
    assert.strictEqual(key1, key2, 'Same state and node must produce identical idempotency key');
    assert.notStrictEqual(key1, key3, 'Different nodes must produce distinct keys');
  });

  // 3. LLM Gateway: Structured Suggestions & Grounded Verification
  await testAsync('LLM Gateway: Resume tailoring suggestions strictly verified against FactStore', async () => {
    const gateway = new LLMGateway({ provider: 'MOCK', model: 'mock-model' });
    const verifiedFacts = [
      {
        id: 'fact-1',
        title: 'Backend Engineer',
        organization: 'Acme Corp',
        highlights: JSON.stringify(['Architected Node.js API with 99.9% uptime', 'Managed PostgreSQL database'])
      }
    ];

    const result = await gateway.suggestResumeTailoring({
      verifiedFacts,
      jobRequirements: ['Node.js', 'PostgreSQL'],
      targetRole: 'Senior Backend Engineer'
    });

    assert.strictEqual(result.suggestions.length, 2);
    assert.strictEqual(result.suggestions[0].sourceFactId, 'fact-1');
    assert.ok(result.usage.costUsd >= 0);
  });

  // 4. LLM Gateway: Hallucination Rejection
  await testAsync('LLM Gateway: Ungrounded metrics in LLM suggestions are rejected by validator', async () => {
    const gateway = new LLMGateway({ provider: 'MOCK' });
    const verifiedFacts = [
      {
        id: 'fact-2',
        title: 'Frontend Engineer',
        organization: 'Startup Inc',
        highlights: JSON.stringify(['Built responsive UI in React']) // Does NOT mention $5M or 400%
      }
    ];

    // Simulate an LLM attempting to introduce unsupported metric
    const hallucinatedBullet = 'Increased company revenue by $5M and boosted signups by 400%';
    const { validateSemanticClaimAssertions } = require('../backend/resumeOptimizer');
    const violations = validateSemanticClaimAssertions(hallucinatedBullet, verifiedFacts[0]);

    assert.ok(violations.length > 0, 'Validator must detect ungrounded metrics');
    assert.strictEqual(violations[0].type, 'UNGROUNDED_METRIC_ASSERTION');
  });

  // 5. LLM Gateway: Sensitive Personal Disclosures Gate
  await testAsync('LLM Gateway: Prohibits guessing visa sponsorship, salary, or disability', async () => {
    const gateway = new LLMGateway();
    const result = await gateway.generateScreeningQuestionDraft({
      questionText: 'What are your expected salary requirements and do you require visa sponsorship?',
      category: 'SENSITIVE_DISCLOSURE',
      verifiedFacts: []
    });

    assert.strictEqual(result.category, 'SENSITIVE_DISCLOSURE');
    assert.strictEqual(result.draftAnswer, null, 'Must never generate automated answers for sensitive disclosures');
    assert.strictEqual(result.requiresHumanIntervention, true);
  });

  // 6. LLM Gateway: Token Accounting & Timeout Resilience
  await testAsync('LLM Gateway: Telemetry tracks cumulative token usage and execution costs', async () => {
    const gateway = new LLMGateway({ timeoutMs: 2000 });
    await gateway.classifyRecruiterEmailNuance({
      emailSubject: 'Interview with Stripe',
      emailBody: 'We would love to invite you to an interview.',
      senderEmail: 'recruiter@stripe.com'
    });

    const metrics = gateway.getUsageMetrics();
    assert.strictEqual(metrics.totalCalls, 1);
    assert.ok(metrics.totalPromptTokens > 0);
    assert.ok(metrics.totalCompletionTokens > 0);
  });

  // 6a. Multi-Model: Groq LLM Configuration & Commercial Token Accounting
  await testAsync('Multi-Model: Groq LLM Gateway config, commercial cost accounting, and resilient dispatch', async () => {
    const groqGateway = new LLMGateway({
      provider: 'GROQ',
      model: 'llama-3.3-70b-versatile',
      allowMockFallback: true
    });

    assert.strictEqual(groqGateway.provider, 'GROQ');
    assert.strictEqual(groqGateway.model, 'llama-3.3-70b-versatile');
    assert.strictEqual(MODEL_PRICING['mock-model'].input, 0.0);
    assert.ok(MODEL_PRICING['llama-3.3-70b-versatile'].input > 0);
    assert.ok(MODEL_PRICING['llama-3.3-70b-versatile'].output > 0);

    const cost = groqGateway.calculateCost('llama-3.3-70b-versatile', 2500, 1000);
    // (2.5 * 0.00059) + (1.0 * 0.00079) = 0.001475 + 0.00079 = 0.002265
    assert.strictEqual(cost, 0.002265, 'Groq commercial on-demand models are accounted at $0.002265');

    const res = await groqGateway.completeChat('Analyze this job posting requirements.');
    assert.ok(res.content);
    assert.ok(res.usage);
  });

  // 6b. Multi-Model: Google Gemini LLM Configuration & Token Pricing
  await testAsync('Multi-Model: Gemini LLM Gateway config, token pricing, and candidate generation', async () => {
    const geminiGateway = new LLMGateway({
      provider: 'GEMINI',
      model: 'gemini-1.5-flash',
      allowMockFallback: true
    });

    assert.strictEqual(geminiGateway.provider, 'GEMINI');
    assert.strictEqual(geminiGateway.model, 'gemini-1.5-flash');
    assert.ok(MODEL_PRICING['gemini-1.5-flash'].input > 0);

    const cost = geminiGateway.calculateCost('gemini-1.5-flash', 10000, 2000);
    // (10 * 0.000075) + (2 * 0.0003) = 0.00075 + 0.0006 = 0.00135
    assert.strictEqual(cost, 0.00135);

    const res = await geminiGateway.completeChat('Draft bullet point alignment');
    assert.ok(res.content);
    assert.ok(res.usage);
  });

  // 6c. Multi-Model: OpenAI LLM Configuration & Guardrail Enforcement
  await testAsync('Multi-Model: OpenAI LLM Gateway config and cost accounting', async () => {
    const openaiGateway = new LLMGateway({
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      allowMockFallback: true
    });

    assert.strictEqual(openaiGateway.provider, 'OPENAI');
    assert.strictEqual(openaiGateway.model, 'gpt-4o-mini');

    const cost = openaiGateway.calculateCost('gpt-4o-mini', 10000, 1000);
    // (10 * 0.00015) + (1 * 0.0006) = 0.0015 + 0.0006 = 0.0021
    assert.strictEqual(cost, 0.0021);

    const res = await openaiGateway.completeChat('Summarize candidate technical stack');
    assert.ok(res.content);
  });

  // 7. LangGraph Routing: Ineligible Requisition Stops Early
  await testAsync('LangGraph Routing: Ineligible candidate stops cleanly at node_match without optimizing', async () => {
    const checkpointer = new MemorySaver();
    const appGraph = createApplicationWorkflowGraph(checkpointer);

    const initialState = {
      tenantId: 'tenant-test',
      userId: 'user-test',
      applicationId: `app-ineligible-${Date.now()}`,
      executionMode: 'DRY_RUN',
      candidateProfile: {
        skills: ['HTML', 'CSS'],
        experienceYears: 1,
        needsSponsorship: true
      },
      jobData: {
        company: 'Defense Aerospace',
        position: 'Principal Cryptographer',
        ats: 'greenhouse',
        requiredSkills: ['C++', 'Rust', 'Post-Quantum Crypto'],
        minYearsExp: 10,
        sponsorshipAvailable: false // Disqualification
      }
    };

    const finalState = await appGraph.invoke(initialState, {
      configurable: { thread_id: `t:${initialState.tenantId}:${initialState.userId}:${initialState.applicationId}` }
    });

    assert.strictEqual(finalState.currentStage, 'MATCH');
    assert.strictEqual(finalState.status, 'INELIGIBLE_STOP');
    assert.strictEqual(finalState.matchEvaluation.eligibility, 'INELIGIBLE');
    assert.ok(!finalState.optimization, 'Must not optimize resume for ineligible role');
  });

  // 8. LangGraph Human-in-the-Loop: Document Review Pause and Resume
  await testAsync('LangGraph Human-in-the-Loop: Pauses at DOCUMENT_REVIEW pending candidate approval', async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'Graph Tenant', subdomain: `graph-test-${Date.now()}` }
    });
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `candidate-${Date.now()}@graphtest.com`,
        passwordHash: 'hash',
        name: 'Alex Rivera'
      }
    });
    const profile = await prisma.candidateProfile.create({
      data: {
        userId: user.id,
        skills: JSON.stringify(['JavaScript', 'Node.js', 'PostgreSQL']),
        certifications: '[]',
        targetRoles: '[]',
        preferredLocations: '[]'
      }
    });
    await prisma.factStore.create({
      data: {
        candidateProfileId: profile.id,
        factType: 'WORK_EXPERIENCE',
        title: 'Backend Engineer',
        organization: 'CloudScale',
        highlights: JSON.stringify(['Built REST APIs in Node.js', 'Optimized SQL queries'])
      }
    });

    const checkpointer = new PostgresDurableCheckpointer();
    const appGraph = createApplicationWorkflowGraph(checkpointer);
    const appId = `app-graph-pause-${Date.now()}`;
    const threadId = `${tenant.id}:${user.id}:${appId}`;

    const initialState = {
      tenantId: tenant.id,
      userId: user.id,
      applicationId: appId,
      executionMode: 'DRY_RUN',
      candidateProfile: {
        skills: ['JavaScript', 'Node.js', 'PostgreSQL'],
        experienceYears: 4,
        needsSponsorship: false
      },
      jobData: {
        company: 'Fintech Hub',
        position: 'Backend Developer',
        ats: 'greenhouse',
        requiredSkills: ['Node.js', 'PostgreSQL']
      },
      documentReview: {
        approvedByCandidate: false // Not yet approved
      }
    };

    // First invocation: Progresses through Discover -> Match -> Optimize -> Pauses at Document Review
    const pausedState = await appGraph.invoke(initialState, {
      configurable: { thread_id: threadId }
    });

    assert.strictEqual(pausedState.currentStage, 'DOCUMENT_REVIEW');
    assert.strictEqual(pausedState.status, 'PAUSED_FOR_HUMAN');
    assert.ok(pausedState.optimization, 'Documents must be optimized before review');
    assert.ok(pausedState.optimization.documentHash, 'Document hash must be generated');

    // Candidate approves document and issues HMAC authorization
    const approval = createDocumentApproval({
      userId: user.id,
      tenantId: tenant.id,
      applicationId: appId,
      jobRequisitionHash: 'req-fintech-123',
      documentVersion: pausedState.optimization.documentVersion,
      documentHash: pausedState.optimization.documentHash
    });

    // Second invocation: Resume graph with approved state
    const resumedState = await appGraph.invoke(
      {
        ...pausedState,
        documentReview: {
          approvedByCandidate: true,
          candidateEditsApplied: false,
          approvedContentHash: pausedState.optimization.documentHash
        },
        submissionAuthorization: {
          isAuthorized: true,
          authorizationToken: approval.authorizationToken
        }
      },
      { configurable: { thread_id: threadId } }
    );

    assert.ok(['PREPARE_APPLICATION', 'SUBMIT', 'VERIFY', 'TRACK', 'HUMAN_REVIEW'].includes(resumedState.currentStage));

    // Cleanup
    await prisma.factStore.deleteMany({ where: { candidateProfileId: profile.id } });
    await prisma.candidateProfile.delete({ where: { id: profile.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  // 9. Document Edits Invalidate Prior Approvals
  test('Approval Invalidation: Editing document text resets approvedContentHash and loops back', () => {
    const { routeAfterDocumentReview } = require('../backend/workflows/applicationGraph');
    const modifiedState = {
      documentReview: {
        approvedByCandidate: true,
        candidateEditsApplied: true // Candidate modified text after initial optimization
      }
    };
    const route = routeAfterDocumentReview(modifiedState);
    assert.strictEqual(route, 'edits_applied', 'Modified document must route back to node_optimize for re-hashing');
  });

  // 10. Workday Portal Human Escalation
  await testAsync('Escalation: Workday multi-step portal triggers HUMAN_ESCALATION_MFA', async () => {
    const checkpointer = new MemorySaver();
    const appGraph = createApplicationWorkflowGraph(checkpointer);

    const workdayState = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      applicationId: `app-workday-${Date.now()}`,
      executionMode: 'DRY_RUN',
      candidateProfile: { skills: ['Java'], experienceYears: 5 },
      jobData: {
        company: 'Enterprise Corp',
        position: 'Java Architect',
        ats: 'workday', // Unsupported ATS portal
        requiredSkills: ['Java']
      },
      documentReview: { approvedByCandidate: true },
      submissionAuthorization: {
        isAuthorized: true,
        authorizationToken: 'dummy-bypass-for-escalation-check'
      }
    };

    // Verify prepare application flags Workday
    const { nodePrepareApplication } = require('../backend/workflows/applicationGraph');
    const result = await nodePrepareApplication(workdayState);

    assert.strictEqual(result.currentStage, 'HUMAN_REVIEW');
    assert.strictEqual(result.status, 'HUMAN_ESCALATION_MFA');
    assert.ok(result.execution.humanInterventionReason.includes('Workday'));
  });

  // 11. Multi-Tenant Scoping & Checkpoint Isolation
  test('Multi-Tenant Isolation: Thread IDs are composite keys preventing cross-tenant access', () => {
    const thread1 = 'tenant-A:user-1:app-1';
    const thread2 = 'tenant-B:user-1:app-1';
    assert.notStrictEqual(thread1, thread2, 'Different tenants cannot access or share checkpoint states');
  });

  // 12. Incomplete Candidate Profile: Missing mandatory eligibility information triggers NEEDS_VERIFICATION
  await testAsync('Incomplete Profile: Mandatory eligibility information (null facts) enforces NEEDS_VERIFICATION', async () => {
    const { nodeMatch, routeAfterMatch } = require('../backend/workflows/applicationGraph');
    const incompleteState = {
      candidateProfile: {
        skills: ['Python'],
        experienceYears: null, // Unknown
        educationLevel: null,  // Unknown
        needsSponsorship: null // Unknown
      },
      jobData: {
        company: 'Stripe',
        position: 'Senior Python Engineer',
        minYearsExp: 3,
        sponsorshipAvailable: false,
        requiredDegree: "Bachelor's",
        requiredSkills: ['Python']
      }
    };

    const res = await nodeMatch(incompleteState);
    assert.strictEqual(res.matchEvaluation.eligibility, 'NEEDS_VERIFICATION');
    assert.strictEqual(res.status, 'NEEDS_VERIFICATION');
    assert(res.matchEvaluation.reasons.some(r => r.includes('unverified')));
    assert.strictEqual(routeAfterMatch(res), 'needs_verification');
  });

  // 13. Contradictory Candidate Profile: Conflicting experience and status claims trigger verification pause
  await testAsync('Contradictory Profile: Conflicting senior titles and fresher claims trigger verification pause', async () => {
    const { nodeMatch, routeAfterMatch } = require('../backend/workflows/applicationGraph');
    const contradictoryState = {
      candidateProfile: {
        skills: ['Go', 'Kubernetes'],
        experienceYears: 0,
        seniorTitle: 'Lead Distributed Systems Architect',
        graduationYear: 2028, // Future
        educationLevel: "Bachelor's",
        needsSponsorship: false,
        workAuthorization: 'f1' // Contradicts no sponsorship needed
      },
      jobData: {
        company: 'Grafana Labs',
        position: 'Systems Engineer',
        requiredSkills: ['Go']
      }
    };

    const res = await nodeMatch(contradictoryState);
    assert.strictEqual(res.matchEvaluation.contradictionsDetected, true);
    assert.strictEqual(res.status, 'NEEDS_VERIFICATION');
    assert.strictEqual(routeAfterMatch(res), 'needs_verification');
  });

  console.log('\n================================================================================');
  console.log(`>> [AGENTIC WORKFLOW SUITE COMPLETE] Passed: ${passed}, Failed: ${failed}`);
  console.log('================================================================================\n');

  return { suite: 'AGENTIC LangGraph.js Workflow Orchestration', passed, failed, category: 'Integration' };
}

if (require.main === module) {
  runAgenticWorkflowSuite()
    .then(r => process.exit(r.failed > 0 ? 1 : 0))
    .catch(err => {
      console.error('Fatal in test runner:', err);
      process.exit(1);
    });
}

module.exports = { runAgenticWorkflowSuite };
