// Rolevia AI · Automated Test Suite: Negative-Path & Edge-Case Integration Testing
// Tests critical security and error boundaries:
// 1. Unauthorized Access & Token Tampering
// 2. Duplicate Billing Webhooks & Forged Signatures (Replay Defense)
// 3. Malformed, Corrupted & Non-PDF Documents
// 4. Failed Job Fetches, HTTP 404/410 & Partial Feed Payloads
// 5. Concurrent Reservations under Scarce Credit (Negative-Balance Barrier)

const assert = require('node:assert');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const auth = require('../backend/auth');
const resumeParser = require('../backend/resumeParser');
const billing = require('../backend/billing');
const jobCrawler = require('../backend/jobCrawler');
const prisma = require('../backend/db');

async function testNegativePaths() {
  console.log('\n--- [TEST SUITE NEGATIVE] Edge-Case & Adversarial Resistance Testing ---');
  let testsPassed = 0;

  // =========================================================================
  // 1. Unauthorized Access & Token Tampering
  // =========================================================================
  // 1A. Missing authorization header
  const authMissing = await auth.authenticateRequest({ headers: {} });
  assert.strictEqual(authMissing.authenticated, false, 'Missing auth header must fail');
  assert.strictEqual(authMissing.error, 'Authorization token required');

  // 1B. Malformed Bearer token
  const authMalformed = await auth.authenticateRequest({ headers: { authorization: 'Bearer invalid.token.payload' } });
  assert.strictEqual(authMalformed.authenticated, false, 'Malformed token must fail');

  // 1C. Expired JWT
  const secret = process.env.JWT_SECRET || 'rolevia_ai_super_secret_jwt_key_2026_production_ready';
  const expiredToken = jwt.sign(
    { userId: 'fake-user', tenantId: 'fake-tenant', email: 'exp@test.com', tokenType: 'access' },
    secret,
    { expiresIn: '-5s' }
  );
  const authExpired = await auth.authenticateRequest({ headers: { authorization: `Bearer ${expiredToken}` } });
  assert.strictEqual(authExpired.authenticated, false, 'Expired token must fail authentication');

  // 1D. Cross-Tenant Tampered JWT Claim
  const tamperedTenantToken = jwt.sign(
    { userId: 'fake-user', tenantId: 'rogue-tenant-999', email: 'rogue@test.com', tokenType: 'access' },
    secret,
    { expiresIn: '15m' }
  );
  const authTampered = await auth.authenticateRequest({ headers: { authorization: `Bearer ${tamperedTenantToken}` } });
  assert.strictEqual(authTampered.authenticated, false, 'Cross-tenant tampered token must fail');
  console.log('✓ [NEGATIVE 1/5] Security: Missing, malformed, expired, and cross-tenant tampered tokens rejected cleanly');
  testsPassed++;

  // =========================================================================
  // 2. Duplicate Billing Webhooks & Forged Signatures (Replay Defense)
  // =========================================================================
  const testSecret = 'rolevia_negative_secret_998822';
  const orderId = 'ord_negative_test';
  const paymentId = 'pay_negative_test';
  const rawBody = JSON.stringify({ event: 'payment.captured', orderId, paymentId });
  const validSig = crypto.createHmac('sha256', testSecret).update(rawBody).digest('hex');
  const eventId = `evt_neg_${Date.now()}`;

  // 2A. Forged signature
  const forgedRes = await billing.processWebhookEvent({
    rawBody,
    signature: 'bad_forged_signature_hex_1234567890abcdef1234567890abcdef12345678',
    eventId,
    eventType: 'payment.captured',
    secret: testSecret
  });
  assert.strictEqual(forgedRes.valid, false, 'Forged signature must be rejected');

  // 2B. First legitimate delivery
  const firstRes = await billing.processWebhookEvent({
    rawBody,
    signature: validSig,
    eventId,
    eventType: 'payment.captured',
    secret: testSecret
  });
  assert.strictEqual(firstRes.valid, true);
  assert.strictEqual(firstRes.duplicate, false);

  // 2C. Replay attack with same eventId
  const replayRes = await billing.processWebhookEvent({
    rawBody,
    signature: validSig,
    eventId,
    eventType: 'payment.captured',
    secret: testSecret
  });
  assert.strictEqual(replayRes.valid, true);
  assert.strictEqual(replayRes.duplicate, true, 'Replay attack flagged as duplicate and ignored');
  console.log('✓ [NEGATIVE 2/5] Billing: Forged signatures rejected; duplicate webhooks handled idempotently');
  testsPassed++;

  // =========================================================================
  // 3. Malformed, Corrupted & Non-PDF Documents
  // =========================================================================
  // 3A. Non-buffer input
  let nonBufferCaught = false;
  try {
    await resumeParser.extractTextFromPdf('not-a-buffer');
  } catch (err) {
    nonBufferCaught = true;
  }
  assert.strictEqual(nonBufferCaught, true, 'Non-buffer input must throw');

  // 3B. Zero-byte buffer
  let zeroByteCaught = false;
  try {
    await resumeParser.extractTextFromPdf(Buffer.alloc(0));
  } catch (err) {
    zeroByteCaught = true;
  }
  assert.strictEqual(zeroByteCaught, true, 'Zero-byte buffer must throw');

  // 3C. Corrupted random bytes
  let corruptCaught = false;
  try {
    await resumeParser.extractTextFromPdf(crypto.randomBytes(512));
  } catch (err) {
    corruptCaught = true;
  }
  assert.strictEqual(corruptCaught, true, 'Corrupted binary stream must be caught cleanly');
  console.log('✓ [NEGATIVE 3/5] Documents: Non-buffer, zero-byte, and corrupted streams rejected without crashing');
  testsPassed++;

  // =========================================================================
  // 4. Failed Job Fetches, HTTP 404/410 & Partial Ingestion Payloads
  // =========================================================================
  // 4A. Malformed job payload missing required company/title
  const badBatch = [
    { company: '', title: 'Missing Company', url: 'https://test.com/1' },
    { company: 'Valid Co', title: '', url: 'https://test.com/2' },
    { company: 'Valid Co', title: 'Valid Job', url: '' }
  ];
  const badIngestRes = await jobCrawler.ingestJobs(badBatch);
  assert.strictEqual(badIngestRes.ingested, 0, 'No malformed jobs should be ingested');
  assert.strictEqual(badIngestRes.errors, 3, 'All 3 malformed jobs flagged as errors');

  // 4B. Non-existent domain / dead connection
  const deadHostCheck = await jobCrawler.isJobUrlLive('http://127.0.0.1:59999/non-existent-port-job');
  // Should handle connection refusal / network error without unhandled promise rejection
  assert(typeof deadHostCheck.live === 'boolean', 'Connection failure handled gracefully');
  console.log('✓ [NEGATIVE 4/5] Crawler: Malformed job payloads and unreachable hosts handled safely without crash');
  testsPassed++;

  // =========================================================================
  // 5. Concurrent Reservations under Scarce Balance (Negative-Balance Barrier)
  // =========================================================================
  const scarceTenant = await prisma.tenant.create({
    data: { name: 'Negative Scarce Tenant', subdomain: `neg-scarce-${Date.now()}` }
  });
  const scarceUser = await prisma.user.create({
    data: {
      tenantId: scarceTenant.id,
      email: `neg_user_${Date.now()}@test.com`,
      passwordHash: '$2a$10$samplehash',
      name: 'Scarce Negative User',
      credits: 1 // Only 1 credit!
    }
  });

  const appIds = ['app-neg-1', 'app-neg-2', 'app-neg-3', 'app-neg-4'];
  for (const aid of appIds) {
    await prisma.application.create({
      data: {
        id: aid,
        tenantId: scarceTenant.id,
        userId: scarceUser.id,
        company: 'Parallel Co',
        position: 'SRE',
        ats: 'custom',
        url: `https://test.com/${aid}`,
        status: 'DRAFT'
      }
    });
  }

  // Fire 4 parallel reservation attempts
  const parallelReservations = appIds.map(aid =>
    billing.reserveCreditForApplication({
      tenantId: scarceTenant.id,
      userId: scarceUser.id,
      applicationId: aid,
      requisitionId: `req-${aid}`
    })
  );

  const settleResults = await Promise.allSettled(parallelReservations);
  const succeeded = settleResults.filter(r => r.status === 'fulfilled');
  const failed = settleResults.filter(r => r.status === 'rejected');

  assert.strictEqual(succeeded.length, 1, `Exactly 1 reservation must succeed, got ${succeeded.length}`);
  assert.strictEqual(failed.length, 3, `Exactly 3 reservations must fail, got ${failed.length}`);

  for (const f of failed) {
    assert(f.reason.name === 'InsufficientCreditsError' || f.reason.message.includes('Insufficient credits'));
  }

  // Assert user available balance is 0 (never negative) and reserved is 1
  const refreshedUser = await prisma.user.findUnique({ where: { id: scarceUser.id } });
  assert.strictEqual(refreshedUser.credits, 0, 'Available credits must be 0, never negative');
  assert.strictEqual(refreshedUser.reservedCredits, 1, 'Reserved credits must be 1');
  assert(refreshedUser.credits >= 0, 'Negative balance boundary invariant strictly maintained');

  await prisma.tenant.delete({ where: { id: scarceTenant.id } });
  console.log('✓ [NEGATIVE 5/5] Concurrency: 4 parallel requests resolved (1 granted, 3 rejected, 0 negative balance)');
  testsPassed++;

  console.log(`>> [PASS] Negative-Path Suite: All ${testsPassed} edge-case integration tests passed.`);
  return {
    suite: 'Negative-Path & Edge-Case Integration',
    passed: testsPassed,
    failed: 0,
    category: 'Security'
  };
}

if (require.main === module) {
  testNegativePaths()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('>> [FAIL] Negative-Path Test Failure:', err);
      process.exit(1);
    });
}

module.exports = testNegativePaths;
