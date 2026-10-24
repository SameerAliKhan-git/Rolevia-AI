// Rolevia AI · Cryptographic Payment Verification & Balanced Credit Journal Engine (FEAT-004 Hardened)
// Implements constant-time HMAC-SHA256 signature verification, webhook idempotency, atomic credit transactions,
// and strict negative-balance prevention at the database boundary.

const crypto = require('node:crypto');
const prisma = require('./db');

const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'rolevia_ai_rzp_mock_secret_key_884920';

class InsufficientCreditsError extends Error {
  constructor(message = 'Insufficient credits to reserve application') {
    super(message);
    this.name = 'InsufficientCreditsError';
    this.statusCode = 402;
  }
}

/**
 * Verify Razorpay payment signature using timing-safe HMAC-SHA256 comparison
 * Resists timing attacks, length mismatch exceptions, and malformed hex strings
 */
function verifyPaymentSignature(orderId, paymentId, signature, secret = RAZORPAY_KEY_SECRET) {
  if (!orderId || !paymentId || !signature || typeof signature !== 'string') {
    return false;
  }

  try {
    const payload = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const actualBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch (err) {
    return false;
  }
}

/**
 * Verify Razorpay Webhook signature and enforce idempotency (replay attack prevention)
 */
async function processWebhookEvent({ rawBody, signature, eventId, eventType, secret = RAZORPAY_KEY_SECRET }) {
  if (!rawBody || !signature || !eventId) {
    return { valid: false, error: 'Missing required webhook parameters' };
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const actualBuf = Buffer.from(signature, 'utf8');

  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, error: 'Invalid webhook signature' };
  }

  const existing = await prisma.processedWebhookEvent.findUnique({
    where: { eventId }
  });

  if (existing) {
    return { valid: true, duplicate: true, message: 'Event already processed (Idempotent replay protection)' };
  }

  await prisma.processedWebhookEvent.create({
    data: {
      eventId,
      eventType: eventType || 'payment.captured',
      signature
    }
  });

  return { valid: true, duplicate: false, message: 'Webhook verified and recorded' };
}

/**
 * Credit Accounting: Grant credits atomically with CreditJournal audit entry
 */
async function grantCredits({ tenantId, userId, amount, referenceType = 'SUBSCRIPTION', referenceId, idempotencyKey }) {
  if (amount <= 0) {
    throw new Error('Grant amount must be greater than zero');
  }

  const key = idempotencyKey || `grant-${userId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  return prisma.$transaction(async (tx) => {
    const existingEntry = await tx.creditJournal.findUnique({
      where: { idempotencyKey: key }
    });
    if (existingEntry) {
      return { success: true, duplicate: true, balance: existingEntry.balanceAfter };
    }

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const newBalance = user.credits + amount;

    await tx.user.update({
      where: { id: userId },
      data: { credits: newBalance }
    });

    const journalEntry = await tx.creditJournal.create({
      data: {
        tenantId,
        userId,
        entryType: 'SUBSCRIPTION_GRANT',
        amount: amount,
        balanceAfter: newBalance,
        idempotencyKey: key,
        referenceType,
        referenceId: referenceId || null
      }
    });

    return {
      success: true,
      amountGranted: amount,
      balance: newBalance,
      journalId: journalEntry.id
    };
  });
}

/**
 * Credit Accounting: Reserve credit for an application attempt (APPLICATION_HOLD)
 * Enforces strict database-level negative balance prevention
 */
async function reserveCreditForApplication({ tenantId, userId, applicationId, requisitionId }) {
  const key = `hold-${applicationId}-${userId}`;

  return prisma.$transaction(async (tx) => {
    const existingHold = await tx.creditJournal.findUnique({
      where: { idempotencyKey: key }
    });
    if (existingHold) {
      return { success: true, holdAlreadyActive: true, balance: existingHold.balanceAfter };
    }

    // Atomic conditional decrement with PostgreSQL row-level lock
    const updatedCount = await tx.$executeRaw`
      UPDATE "User"
      SET "credits" = "credits" - 1
      WHERE "id" = ${userId} AND "credits" >= 1
    `;

    if (updatedCount === 0) {
      const u = await tx.user.findUnique({ where: { id: userId } });
      const currentBal = u ? u.credits : 0;
      throw new InsufficientCreditsError(`Cannot reserve credit: available balance is ${currentBal}`);
    }

    const user = await tx.user.findUnique({ where: { id: userId } });
    const newBalance = user.credits;

    const entry = await tx.creditJournal.create({
      data: {
        tenantId,
        userId,
        entryType: 'APPLICATION_HOLD',
        amount: -1,
        balanceAfter: newBalance,
        idempotencyKey: key,
        referenceType: 'REQUISITION',
        referenceId: requisitionId || applicationId
      }
    });

    await tx.application.update({
      where: { id: applicationId },
      data: { status: 'EXECUTING' }
    });

    return {
      success: true,
      balance: newBalance,
      journalId: entry.id
    };
  });
}

/**
 * Credit Accounting: Commit reserved credit upon verified application submission (APPLICATION_COMMIT)
 */
async function commitCreditForApplication({ tenantId, userId, applicationId, confirmationNumber, receiptData }) {
  const key = `commit-${applicationId}-${userId}`;

  return prisma.$transaction(async (tx) => {
    const existingCommit = await tx.creditJournal.findUnique({
      where: { idempotencyKey: key }
    });
    if (existingCommit) {
      return { success: true, alreadyCommitted: true };
    }

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const entry = await tx.creditJournal.create({
      data: {
        tenantId,
        userId,
        entryType: 'APPLICATION_COMMIT',
        amount: 0, // balance was decremented during hold
        balanceAfter: user.credits,
        idempotencyKey: key,
        referenceType: 'APPLICATION',
        referenceId: applicationId
      }
    });

    await tx.application.update({
      where: { id: applicationId },
      data: {
        status: 'SUBMITTED',
        confirmationNumber: confirmationNumber || null,
        receiptData: typeof receiptData === 'object' ? JSON.stringify(receiptData) : receiptData
      }
    });

    return {
      success: true,
      status: 'SUBMITTED',
      journalId: entry.id
    };
  });
}

/**
 * Credit Accounting: Release reserved credit if application failed before submission (APPLICATION_RELEASE)
 */
async function releaseCreditForApplication({ tenantId, userId, applicationId, reason }) {
  const key = `release-${applicationId}-${userId}`;

  return prisma.$transaction(async (tx) => {
    const existingRelease = await tx.creditJournal.findUnique({
      where: { idempotencyKey: key }
    });
    if (existingRelease) {
      return { success: true, alreadyReleased: true, balance: existingRelease.balanceAfter };
    }

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const newBalance = user.credits + 1;

    await tx.user.update({
      where: { id: userId },
      data: { credits: newBalance }
    });

    const entry = await tx.creditJournal.create({
      data: {
        tenantId,
        userId,
        entryType: 'APPLICATION_RELEASE',
        amount: 1,
        balanceAfter: newBalance,
        idempotencyKey: key,
        referenceType: 'FAILURE_REFUND',
        referenceId: applicationId
      }
    });

    await tx.application.update({
      where: { id: applicationId },
      data: { status: 'FAILED' }
    });

    return {
      success: true,
      balance: newBalance,
      status: 'FAILED',
      journalId: entry.id
    };
  });
}

/**
 * Credit Accounting & Quarantine: Handle OUTCOME_UNKNOWN without premature debit, credit refund, or re-submission
 * Enforces Architectural Correction 1 & 2
 */
async function quarantineOutcomeUnknown({ tenantId, userId, applicationId, reason }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const updatedApp = await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: 'OUTCOME_UNKNOWN',
      receiptData: JSON.stringify({
        quarantinedAt: new Date().toISOString(),
        reason: reason || 'Submission dispatched; worker disconnected before confirmation receipt parsed.',
        actionRequired: 'Manual or automated mailbox receipt reconciliation required.'
      })
    }
  });

  return {
    success: true,
    status: 'OUTCOME_UNKNOWN',
    quarantined: true,
    applicationId: updatedApp.id,
    userCredits: user.credits,
    message: 'Application quarantined in OUTCOME_UNKNOWN. Requisition locked; no duplicate submission permitted.'
  };
}

module.exports = {
  InsufficientCreditsError,
  verifyPaymentSignature,
  processWebhookEvent,
  grantCredits,
  reserveCreditForApplication,
  commitCreditForApplication,
  releaseCreditForApplication,
  quarantineOutcomeUnknown
};
