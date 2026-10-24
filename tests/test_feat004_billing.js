// Rolevia AI · Automated Test Suite: FEAT-004 (Payment Security & Transactional Credit Journal)
// Verifies HMAC-SHA256 signature verification, webhook idempotency, atomic credit lifecycle
// (HOLD -> COMMIT -> RELEASE), OUTCOME_UNKNOWN quarantine, and strict negative-balance prevention under concurrency.

const assert = require('node:assert');
const crypto = require('node:crypto');
const billing = require('../backend/billing');
const prisma = require('../backend/db');

async function testFeat004Billing() {
  console.log('\n--- [TEST SUITE 4] FEAT-004: Payment Security, Credit Journal & Concurrency ---');
  let testsPassed = 0;

  const testSecret = 'rolevia_test_secret_rzp_production_994820';
  const orderId = 'order_9837482910';
  const paymentId = 'pay_2847291847';

  // 1. Valid Signature Verification via timingSafeEqual
  const validSignature = crypto
    .createHmac('sha256', testSecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const isValid = billing.verifyPaymentSignature(orderId, paymentId, validSignature, testSecret);
  assert.strictEqual(isValid, true, 'Valid HMAC signature must evaluate to true');
  console.log('✓ [SECURITY] HMAC: Valid Razorpay payment signature verified via timingSafeEqual');
  testsPassed++;

  // 2. Forged & Malformed Signatures
  const forgedSignature = crypto.randomBytes(32).toString('hex');
  const isForgedValid = billing.verifyPaymentSignature(orderId, paymentId, forgedSignature, testSecret);
  assert.strictEqual(isForgedValid, false, 'Forged signature must be rejected');

  const malformedShort = 'abc123short';
  const isShortValid = billing.verifyPaymentSignature(orderId, paymentId, malformedShort, testSecret);
  assert.strictEqual(isShortValid, false, 'Short signature must not crash and must return false');
  console.log('✓ [SECURITY] Signature Defense: Forged, tampered, and malformed signatures rejected safely');
  testsPassed++;

  // 3. Webhook Idempotency & Replay Attack Protection
  const rawBody = JSON.stringify({ event: 'payment.captured', orderId, paymentId });
  const webhookSig = crypto.createHmac('sha256', testSecret).update(rawBody).digest('hex');
  const eventId = `evt_rzp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const firstWebhook = await billing.processWebhookEvent({
    rawBody,
    signature: webhookSig,
    eventId,
    eventType: 'payment.captured',
    secret: testSecret
  });
  assert.strictEqual(firstWebhook.valid, true, 'First webhook must be valid');
  assert.strictEqual(firstWebhook.duplicate, false, 'First webhook must not be duplicate');

  // Replay Attack Attempt with exact same eventId
  const secondWebhook = await billing.processWebhookEvent({
    rawBody,
    signature: webhookSig,
    eventId,
    eventType: 'payment.captured',
    secret: testSecret
  });
  assert.strictEqual(secondWebhook.valid, true, 'Second webhook recognized');
  assert.strictEqual(secondWebhook.duplicate, true, 'Replay attack flagged as duplicate and ignored');
  console.log('✓ [SECURITY] Replay Defense: Webhook idempotency ledger prevents double-crediting');
  testsPassed++;

  // 4. Balanced Credit Journal: HOLD -> COMMIT Cycle
  const user = await prisma.user.findUnique({ where: { email: 'sammysameerkhan007@gmail.com' } });
  const startBalance = user.credits;
  const testAppId = `app-test-commit-${Date.now()}`;

  await prisma.application.create({
    data: {
      id: testAppId,
      tenantId: user.tenantId,
      userId: user.id,
      company: 'Stripe',
      position: 'Backend Engineer',
      ats: 'greenhouse',
      url: 'https://boards.greenhouse.io/stripe/jobs/123456',
      status: 'DRAFT'
    }
  });

  // Step A: APPLICATION_HOLD
  const holdResult = await billing.reserveCreditForApplication({
    tenantId: user.tenantId,
    userId: user.id,
    applicationId: testAppId,
    requisitionId: 'req-stripe-123'
  });
  assert.strictEqual(holdResult.success, true, 'Hold must succeed');
  assert.strictEqual(holdResult.availableCredits, startBalance - 1, 'Available balance decremented by 1 during hold');
  assert.strictEqual(holdResult.reservedCredits >= 1, true, 'Reserved credits incremented to at least 1');

  // Step B: APPLICATION_COMMIT upon verified ATS confirmation
  const commitResult = await billing.commitCreditForApplication({
    tenantId: user.tenantId,
    userId: user.id,
    applicationId: testAppId,
    confirmationNumber: 'STRIPE-CONF-99281',
    receiptData: { fieldCount: 15, directLink: 'https://boards.greenhouse.io/stripe' }
  });
  assert.strictEqual(commitResult.status, 'SUBMITTED', 'Status updated to SUBMITTED');
  assert.strictEqual(commitResult.availableCredits, startBalance - 1, 'Available credits must NOT be deducted again upon commit');
  assert.strictEqual(commitResult.consumedCredits >= 1, true, 'Consumed credits incremented to reflect confirmed submission');
  console.log('✓ [DB] Credit Journal: Triple-reconciliation (available/reserved/consumed) verified with 0 double-deductions');
  testsPassed++;

  // 5. APPLICATION_RELEASE (Refund on Pre-dispatch failure)
  const failAppId = `app-test-fail-${Date.now()}`;
  await prisma.application.create({
    data: {
      id: failAppId,
      tenantId: user.tenantId,
      userId: user.id,
      company: 'TestCorp',
      position: 'QA Engineer',
      ats: 'ashby',
      url: 'https://jobs.ashbyhq.com/testcorp/789',
      status: 'DRAFT'
    }
  });
  const balanceBeforeFail = (await prisma.user.findUnique({ where: { id: user.id } })).credits;
  await billing.reserveCreditForApplication({
    tenantId: user.tenantId,
    userId: user.id,
    applicationId: failAppId,
    requisitionId: 'req-fail-001'
  });
  const releaseResult = await billing.releaseCreditForApplication({
    tenantId: user.tenantId,
    userId: user.id,
    applicationId: failAppId,
    reason: 'Application link returned HTTP 404'
  });
  assert.strictEqual(releaseResult.balance, balanceBeforeFail, 'Balance refunded upon release');
  assert.strictEqual(releaseResult.status, 'FAILED', 'Status set to FAILED');
  console.log('✓ [DB] Credit Journal: Pre-submission failure refunded cleanly via APPLICATION_RELEASE');
  testsPassed++;

  // 6. OUTCOME_UNKNOWN Quarantine (Prevent Duplicate Submissions & Invalid Refunds)
  const unknownAppId = `app-unknown-${Date.now()}`;
  await prisma.application.create({
    data: {
      id: unknownAppId,
      tenantId: user.tenantId,
      userId: user.id,
      company: 'Airbnb',
      position: 'Systems Engineer',
      ats: 'greenhouse',
      url: 'https://careers.airbnb.com/positions/99182',
      status: 'DRAFT'
    }
  });
  await billing.reserveCreditForApplication({
    tenantId: user.tenantId,
    userId: user.id,
    applicationId: unknownAppId,
    requisitionId: 'req-airbnb-001'
  });
  const balanceAtHold = (await prisma.user.findUnique({ where: { id: user.id } })).credits;

  const quarantineResult = await billing.quarantineOutcomeUnknown({
    tenantId: user.tenantId,
    userId: user.id,
    applicationId: unknownAppId,
    reason: 'Cloud worker disconnected at submit boundary'
  });
  assert.strictEqual(quarantineResult.status, 'OUTCOME_UNKNOWN', 'Application must enter OUTCOME_UNKNOWN status');
  assert.strictEqual(quarantineResult.quarantined, true, 'Quarantine flag must be true');
  assert.strictEqual(quarantineResult.userCredits, balanceAtHold, 'Credits remain held without automatic refund');
  console.log('✓ [ARCH] OUTCOME_UNKNOWN: Quarantined safely without duplicate submission or invalid refund');
  testsPassed++;

  // 7. Negative-Balance Prevention & Concurrent Reservation Stress Test
  // Create a test user with exactly 1 credit
  const scarceTenant = await prisma.tenant.create({
    data: { name: 'Scarce Tenant', subdomain: `scarce-${Date.now()}` }
  });
  const scarceUser = await prisma.user.create({
    data: {
      tenantId: scarceTenant.id,
      email: `scarce-user-${Date.now()}@test.com`,
      passwordHash: '$2a$10$samplehash',
      name: 'Scarce Balance User',
      credits: 1 // Only 1 credit!
    }
  });

  // Create 3 application records
  const appIds = [];
  for (let i = 0; i < 3; i++) {
    const aid = `app-concurrent-${i}-${Date.now()}`;
    await prisma.application.create({
      data: {
        id: aid,
        tenantId: scarceTenant.id,
        userId: scarceUser.id,
        company: `Concurrent Co ${i}`,
        position: 'Engineer',
        ats: 'custom',
        url: `https://company.test/job/${i}`,
        status: 'DRAFT'
      }
    });
    appIds.push(aid);
  }

  // Fire 3 simultaneous credit reservation requests
  const concurrentHoldPromises = appIds.map(aid =>
    billing.reserveCreditForApplication({
      tenantId: scarceTenant.id,
      userId: scarceUser.id,
      applicationId: aid,
      requisitionId: `req-${aid}`
    })
  );

  const results = await Promise.allSettled(concurrentHoldPromises);
  const fulfilled = results.filter(r => r.status === 'fulfilled');
  const rejected = results.filter(r => r.status === 'rejected');

  // Verify that exactly 1 succeeded and 2 were rejected due to insufficient credits
  assert.strictEqual(fulfilled.length, 1, `Exactly 1 concurrent reservation should succeed, got ${fulfilled.length}`);
  assert.strictEqual(rejected.length, 2, `Exactly 2 concurrent reservations should fail, got ${rejected.length}`);

  // Verify error type is InsufficientCreditsError
  for (const rej of rejected) {
    assert(rej.reason.name === 'InsufficientCreditsError' || rej.reason.message.includes('Insufficient credits'), 'Rejected reason must be InsufficientCreditsError');
  }

  // Verify user balance in PostgreSQL is strictly 0 and NOT negative
  const finalScarceUser = await prisma.user.findUnique({ where: { id: scarceUser.id } });
  assert.strictEqual(finalScarceUser.credits, 0, `User balance must be 0, found: ${finalScarceUser.credits}`);
  assert(finalScarceUser.credits >= 0, 'Negative balance invariant violated');
  console.log('✓ [SECURITY] Negative-Balance Invariant: 3 concurrent requests resolved (1 granted, 2 rejected, final balance: 0)');
  testsPassed++;

  // Clean up scarce tenant
  await prisma.tenant.delete({ where: { id: scarceTenant.id } });

  console.log(`>> [PASS] FEAT-004: All ${testsPassed} payment and credit accounting tests passed.`);
  return {
    suite: 'FEAT-004 Payment Security & Credit Ledger',
    passed: testsPassed,
    failed: 0,
    category: 'Security'
  };
}

if (require.main === module) {
  testFeat004Billing()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('>> [FAIL] FEAT-004 Test Failure:', err);
      process.exit(1);
    });
}

module.exports = testFeat004Billing;
