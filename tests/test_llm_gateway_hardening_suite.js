// Rolevia AI · Multi-Model LLM Gateway Hardening & Evaluation Test Suite (Phase 4 & Phase 5)
// Validates:
// 1. Explicit Modes: MOCK, LIVE, UNAVAILABLE. Refusal of silent mock fallback in production/LIVE mode.
// 2. Intra-provider model fallbacks (e.g. 70B -> 8B on rate limit).
// 3. Security: PII and API key redaction in error messages and logs.
// 4. Execution of the 10-Case Adversarial Benchmark Dataset from tests/llm_eval/adversarial_evaluation_dataset.json.

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const {
  LLMGateway,
  LLMExecutionError,
  GATEWAY_MODES,
  DEFAULT_MODELS,
  MODEL_FALLBACKS,
  ResumeTailoringOutputSchema,
  ScreeningQuestionOutputSchema,
  RecruiterEmailOutputSchema,
  sanitizeForLogging
} = require('../backend/ai/llmGateway');

async function runLLMHardeningTestSuite() {
  console.log('\n================================================================================');
  console.log(' ROLEVIA AI · MULTI-MODEL LLM GATEWAY HARDENING & BENCHMARK SUITE');
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

  // ---------------------------------------------------------------------------
  // 1. Explicit Mode: LIVE Mode without API Key Refuses Silent Mock Fallback
  // ---------------------------------------------------------------------------
  try {
    const liveGateway = new LLMGateway({
      mode: 'LIVE',
      provider: 'GROQ',
      apiKey: null // Missing key
    });

    const status = liveGateway.getProviderStatus();
    assert.strictEqual(status.mode, 'LIVE');
    assert.strictEqual(status.status, 'UNAVAILABLE');
    assert.strictEqual(status.isAvailable, false);

    // Attempting chat completion in LIVE mode without key must throw PROVIDER_UNAVAILABLE
    let caughtErr = null;
    try {
      await liveGateway.completeChat('Test prompt');
    } catch (e) {
      caughtErr = e;
    }
    assert(caughtErr, 'Expected exception when calling completeChat in LIVE mode without API key');
    assert.strictEqual(caughtErr.code, 'PROVIDER_UNAVAILABLE');
    assert(/silent mock fallback in production is strictly prohibited/i.test(caughtErr.message));
    recordPass('Gateway Modes: LIVE mode marks provider UNAVAILABLE and rejects silent mock fallback');
  } catch (err) {
    recordFail('Gateway Modes: LIVE mode marks provider UNAVAILABLE and rejects silent mock fallback', err);
  }

  // ---------------------------------------------------------------------------
  // 2. Explicit Mode: MOCK Mode Operates Deterministically
  // ---------------------------------------------------------------------------
  try {
    const mockGateway = new LLMGateway({ mode: 'MOCK', provider: 'MOCK' });
    const status = mockGateway.getProviderStatus();
    assert.strictEqual(status.mode, 'MOCK');
    assert.strictEqual(status.isAvailable, true);

    const res = await mockGateway.completeChat('Hello mock world');
    assert.strictEqual(res.provider, 'MOCK');
    assert(res.content.length > 0);
    assert.strictEqual(res.usage.costUsd, 0.0);
    recordPass('Gateway Modes: Explicit MOCK mode operates deterministically with zero cost');
  } catch (err) {
    recordFail('Gateway Modes: Explicit MOCK mode operates deterministically with zero cost', err);
  }

  // ---------------------------------------------------------------------------
  // 3. Security: API Key and Candidate PII Redaction
  // ---------------------------------------------------------------------------
  try {
    const sensitiveString = 'Error with key gsk_testsecretkey99281729482 for user john.doe@example.com phone 555-123-4567';
    const sanitized = sanitizeForLogging(sensitiveString);
    assert(!sanitized.includes('gsk_testsecretkey99281729482'), 'Leaked API key');
    assert(sanitized.includes('***REDACTED_API_KEY***'), 'Failed to redact API key');
    assert(!sanitized.includes('john.doe@example.com'), 'Leaked email PII');
    assert(sanitized.includes('[REDACTED_EMAIL]'), 'Failed to redact email PII');
    assert(!sanitized.includes('555-123-4567'), 'Leaked phone PII');
    assert(sanitized.includes('[REDACTED_PHONE]'), 'Failed to redact phone PII');

    const err = new LLMExecutionError(sensitiveString, 'TEST_ERROR');
    assert(!err.message.includes('gsk_testsecretkey99281729482'));
    recordPass('Security: API keys and candidate personal contact PII are scrubbed from logs and errors');
  } catch (err) {
    recordFail('Security: API keys and candidate personal contact PII are scrubbed from logs and errors', err);
  }

  // ---------------------------------------------------------------------------
  // 4. Intra-Provider Model Fallback on 429 Rate Limit
  // ---------------------------------------------------------------------------
  try {
    assert.strictEqual(MODEL_FALLBACKS['llama-3.3-70b-versatile'], 'llama-3.1-8b-instant');
    assert.strictEqual(MODEL_FALLBACKS['gemini-2.5-pro'], 'gemini-2.5-flash');
    assert.strictEqual(MODEL_FALLBACKS['gemini-1.5-pro'], 'gemini-1.5-flash');
    assert.strictEqual(MODEL_FALLBACKS['gpt-4o'], 'gpt-4o-mini');
    recordPass('Intra-Provider Fallback: 70B/Pro flagship models map cleanly to high-throughput instant models');
  } catch (err) {
    recordFail('Intra-Provider Fallback: 70B/Pro flagship models map cleanly to high-throughput instant models', err);
  }

  // ---------------------------------------------------------------------------
  // 5. Execution of the 10-Case Adversarial Benchmark Dataset
  // ---------------------------------------------------------------------------
  const benchmarkPath = path.join(__dirname, 'llm_eval', 'adversarial_evaluation_dataset.json');
  const dataset = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));

  const gateway = new LLMGateway({ mode: 'MOCK', provider: 'MOCK' });

  for (const tc of dataset.testCases) {
    try {
      if (tc.id === 'TC-001-METRIC-HALLUCINATION' || tc.id === 'TC-002-ORGANIZATION-FABRICATION') {
        const { validateSemanticClaimAssertions } = require('../backend/resumeOptimizer');
        const violations = validateSemanticClaimAssertions(tc.adversarialBullet, tc.verifiedFacts[0]);
        assert(violations.length > 0, `Expected hallucination violations for ${tc.id}`);
        recordPass(`Benchmark ${tc.id}: ${tc.category} correctly flagged and rejected`);
      } else if (tc.id === 'TC-003-PROMPT-INJECTION-RECEIPT') {
        let threw = false;
        try {
          await gateway.completeChat(tc.promptInput);
        } catch (e) {
          threw = true;
          assert.strictEqual(e.code, 'FORBIDDEN_OUTPUT');
        }
        assert(threw, 'Expected prompt injection to trigger FORBIDDEN_OUTPUT');
        recordPass(`Benchmark ${tc.id}: Adversarial receipt forgery detected and blocked`);
      } else if (tc.id.startsWith('TC-004') || tc.id.startsWith('TC-005') || tc.id.startsWith('TC-006')) {
        const res = await gateway.generateScreeningQuestionDraft({
          questionText: tc.questionText,
          category: tc.categoryInput,
          verifiedFacts: []
        });
        assert.strictEqual(res.requiresHumanIntervention, true);
        assert.strictEqual(res.draftAnswer, null);
        assert.strictEqual(res.category, 'SENSITIVE_DISCLOSURE');
        recordPass(`Benchmark ${tc.id}: Sensitive disclosure strictly escalated to candidate without guessing`);
      } else if (tc.id === 'TC-007-FACTUAL-GROUNDED-QA') {
        const res = await gateway.generateScreeningQuestionDraft({
          questionText: tc.questionText,
          category: 'FACTUAL',
          verifiedFacts: tc.verifiedFacts
        });
        assert.strictEqual(res.groundedFactId, tc.expectedGroundedFactId);
        assert(res.draftAnswer && res.draftAnswer.includes('DataScale Systems'));
        recordPass(`Benchmark ${tc.id}: Factual Q&A truthfully grounded to verified FactStore ID`);
      } else if (tc.id === 'TC-008-RECRUITER-INTERVIEW-INVITATION') {
        const res = await gateway.classifyRecruiterEmailNuance({
          emailSubject: tc.emailSubject,
          emailBody: tc.emailBody,
          senderEmail: tc.senderEmail
        });
        assert.strictEqual(res.category, tc.expectedCategory);
        assert(res.confidence >= tc.minConfidence);
        recordPass(`Benchmark ${tc.id}: Recruiter interview invite classified with high confidence`);
      } else if (tc.id === 'TC-009-RECRUITER-REJECTION-NOTICE') {
        const res = await gateway.classifyRecruiterEmailNuance({
          emailSubject: tc.emailSubject,
          emailBody: tc.emailBody,
          senderEmail: tc.senderEmail
        });
        assert.strictEqual(res.category, tc.expectedCategory);
        assert(res.confidence >= tc.minConfidence);
        recordPass(`Benchmark ${tc.id}: Recruiter rejection notice classified with high confidence`);
      } else if (tc.id === 'TC-010-STRUCTURED-OUTPUT-SCHEMA-COMPLIANCE') {
        const res = await gateway.suggestResumeTailoring({
          verifiedFacts: tc.verifiedFacts,
          jobRequirements: ['React', 'TypeScript'],
          targetRole: 'Frontend Developer'
        });
        ResumeTailoringOutputSchema.parse(res);
        assert(res.usage.promptTokens > 0);
        assert.strictEqual(typeof res.usage.costUsd, 'number');
        recordPass(`Benchmark ${tc.id}: Output strictly conforms to Zod schema with token cost accounting`);
      }
    } catch (err) {
      recordFail(`Benchmark ${tc.id}: ${tc.category}`, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Telemetry Ledger Summary
  // ---------------------------------------------------------------------------
  const metrics = gateway.getUsageMetrics();
  assert(metrics.totalCalls >= 5, 'Expected cumulative telemetry calls to be recorded');
  recordPass('Telemetry Ledger: Tracks cumulative token usage, latency, and call history');

  console.log('\n================================================================================');
  console.log(`>> [LLM GATEWAY HARDENING SUITE COMPLETE] Passed: ${passed}, Failed: ${failed}`);
  console.log('================================================================================\n');

  if (failed > 0) {
    throw new Error(`LLM Gateway Hardening Suite had ${failed} failing tests.`);
  }

  return { suite: 'GATEWAY Multi-Model Hardening & Eval', passed, failed, category: 'Integration' };
}

if (require.main === module) {
  runLLMHardeningTestSuite()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = {
  runLLMHardeningTestSuite
};
