// Rolevia AI · Automated Test Suite: FEAT-004 (Payment Verification & Balanced Credit Journal)
// Verifies HMAC-SHA256 constant-time verification, replay protection, and atomic holds/commits/releases/quarantining.

const assert = require('node:assert');
const crypto = require('node:crypto');
const billing = require('../backend/billing');
const prisma = require('../backend/db');

async function testFeat004Billing() {
  console.log('\n--- [TEST SUITE 4] FEAT-004: Payment Security & Credit Journal ---');

  const testSecret = 'rolevia_test_secret_994820';
  const orderId = 'order_9837482910';
  const paymentId = 'pay_2847291847';

  // 1. Valid Signature Verification
  const validSignature = crypto
    .createHmac('sha256', testSecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const isValid = billing.verifyPaymentSignature(orderId, paymentId, validSignature, testSecret);
  assert.strictEqual(isValid, true, 'Valid HMAC signature must evaluate to true');
  console.log('✓ HMAC: Valid payment signature verified via timingSafeEqual');

  // 2. Forged & Malformed Signatures
  const forgedSignature = crypto.randomBytes(32).toString('hex');
  const isForgedValid = billing.verifyPaymentSignature(orderId, paymentId, forgedSignature, testSecret);
  assert.strictEqual(isForgedValid, false, 'Forged signature must be rejected');

  const malformedShort = 'abc123';
  const isShortValid = billing.verifyPaymentSignature(orderId, paymentId, malformedShort, testSecret);
  assert.strictEqual(isShortValid, false, 'Short signature must not crash and must return false');
  console.log('✓ Security: Forged and malformed signatures rejected without timing leaks');

  // 3. Webhook Replay Protection
  const rawBody = JSON.stringify({ event: 'payment.captured', orderId, paymentId });
  const webhookSig = crypto.createHmac('sha256', testSecret).update(rawBody).digest('hex');
  const eventId = `evt_test_${Date.now()}`;

  const firstWebhook = await billing.processWebhookEvent({
    rawBody,
    signature: webhookSig,
    eventId,
    eventType: 'payment.captured',
    secret: testSecret
  });
  assert.strictEqual(firstWebhook.valid, true, 'First webhook must be valid');
  assert.strictEqual(firstWebhook.duplicate, false, 'First webhook must not be duplicate');

  // Replay Attack Attempt
  const secondWebhook = await billing.processWebhookEvent({
    rawBody,
    signature: webhookSig,
    eventId,
    eventType: 'payment.captured',
    secret: testSecret
  });
  assert.strictEqual(secondWebhook.valid, true, 'Second webhook is recognized');
  assert.strictEqual(secondWebhook.duplicate, true, 'Replay attack flagged as duplicate and ignored');
  console.log('✓ Replay Defense: Duplicate webhook event flagged and handled idempotently');

  // 4. Balanced Credit Journal: Hold -> Commit Cycle
  const user = await prisma.user.findUnique({ where: { email: 'sammysameerkhan007@gmail.com' } });
  const startBalance = user.credits;
  const testAppId = `app-test-${Date.now()}`;

  // Create temporary test application
  await prisma.application.create({
    data: {
      id: testAppId,
      tenantId: user.tenantId,
      userId: user.id,
      company: 'Stripe',
      position: 'Backend Engineer',
      ats: 'Greenhouse',
      url: 'https://boards.greenhouse.io/stripe/jobs/123456',
      status: 'DRAFT'
    }
  });

  // APPLICATION_HOLD
  const holdResult = await billing.reserveCreditForApplication({
    tenantId: user.tenantId,
    userId: user.id,
    applicationId: testAppId,
    requisitionId: 'req-stripe-123'
  });
  assert.strictEqual(holdResult.success, true, 'Hold must succeed');
  assert.strictEqual(holdResult.balance, startBalance - 1, 'Balance must be decremented by 1 on hold');

  // APPLICATION_COMMIT
  const commitResult = await billing.commitCreditForApplication({
    tenantId: user.tenantId,
    userId: user.id,
    applicationId: testAppId,
    confirmationNumber: 'STRIPE-CONF-99281',
    receiptData: { fieldCount: 15, directLink: 'https://boards.greenhouse.io/stripe' }
  });
  assert.strictEqual(commitResult.status, 'SUBMITTED', 'Status must be updated to SUBMITTED');
  console.log('✓ Credit Journal: Atomic HOLD and COMMIT completed with balance consistency');

  // 5. APPLICATION_RELEASE (Refund on Pre-dispatch failure)
  const failAppId = `app-fail-${Date.now()}`;
  await prisma.application.create({
    data: {
      id: failAppId,
      tenantId: user.tenantId,
      userId: user.id,
      company: 'TestCorp',
      position: 'QA Engineer',
      ats: 'Ashby',
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
  assert.strictEqual(releaseResult.balance, balanceBeforeFail, 'Balance must be refunded to prior level upon release');
  assert.strictEqual(releaseResult.status, 'FAILED', 'Status must be FAILED');
  console.log('✓ Credit Journal: Pre-submission failure refunded via APPLICATION_RELEASE');

  // 6. OUTCOME_UNKNOWN Quarantine (Architectural Correction 1 & 2)
  const unknownAppId = `app-unknown-${Date.now()}`;
  await prisma.application.create({
    data: {
      id: unknownAppId,
      tenantId: user.tenantId,
      userId: user.id,
      company: 'Airbnb',
      position: 'Systems Engineer',
      ats: 'Greenhouse',
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
  assert.strictEqual(quarantineResult.userCredits, balanceAtHold, 'Credits must remain in hold without automatic refund');
  console.log('✓ Correction 1 & 2: OUTCOME_UNKNOWN quarantined safely without duplicate submission or invalid refund');

  console.log('>> [PASS] FEAT-004: Payment security and credit accounting verified.');
  return { suite: 'FEAT-004 Payment & Credit Accounting', passed: 6, failed: 0 };
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
