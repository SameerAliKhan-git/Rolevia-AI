// Rolevia AI · Persistent Application Kanban Tracker & Verified Receipts Engine (FEAT-010)
// Provides Kanban state aggregation, multi-tenant application feeds, stage transitions
// (Interviewing, Offer, Rejected), human-action resolution, and cryptographic submission receipt verification.

const crypto = require('node:crypto');
const prisma = require('./db');
const atsAutomation = require('./atsAutomation');

// Kanban Filter Buckets
const KANBAN_BUCKETS = {
  ALL: 'all',
  SUBMITTED: 'submitted',
  IN_FLIGHT: 'in_flight',
  NEEDS: 'needs',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

const BUCKET_STATUS_MAP = {
  [KANBAN_BUCKETS.SUBMITTED]: [atsAutomation.APPLICATION_STATES.SUBMITTED_CONFIRMED],
  [KANBAN_BUCKETS.IN_FLIGHT]: [
    atsAutomation.APPLICATION_STATES.QUEUED_RESERVED,
    atsAutomation.APPLICATION_STATES.RUNNING_PRE_SUBMIT,
    atsAutomation.APPLICATION_STATES.READY_FOR_SUBMISSION,
    atsAutomation.APPLICATION_STATES.SUBMISSION_IN_FLIGHT
  ],
  [KANBAN_BUCKETS.NEEDS]: [
    atsAutomation.APPLICATION_STATES.PENDING_REVIEW,
    atsAutomation.APPLICATION_STATES.NEEDS_USER_ACTION
  ],
  [KANBAN_BUCKETS.FAILED]: [
    atsAutomation.APPLICATION_STATES.FAILED_CONFIRMED,
    atsAutomation.APPLICATION_STATES.OUTCOME_UNKNOWN
  ],
  [KANBAN_BUCKETS.SKIPPED]: [
    atsAutomation.APPLICATION_STATES.SKIPPED
  ]
};

const VALID_STAGES = [
  'APPLIED',
  'SCREENING',
  'INTERVIEWING',
  'OFFER',
  'REJECTED',
  'WITHDRAWN'
];

/**
 * List Applications with Filtering, Search, and Pagination
 */
async function listApplications({
  userId,
  tenantId,
  filter = 'all',
  query = '',
  stage = null,
  page = 1,
  limit = 20,
  sort = 'updatedAt',
  order = 'desc'
}) {
  const where = {
    userId,
    tenantId
  };

  // Filter bucket
  if (filter && filter !== 'all' && BUCKET_STATUS_MAP[filter]) {
    where.status = { in: BUCKET_STATUS_MAP[filter] };
  }

  // Stage filter
  if (stage && VALID_STAGES.includes(stage.toUpperCase())) {
    where.stage = stage.toUpperCase();
  }

  // Search Query
  if (query && query.trim() !== '') {
    const q = query.trim();
    where.OR = [
      { company: { contains: q, mode: 'insensitive' } },
      { position: { contains: q, mode: 'insensitive' } },
      { ats: { contains: q, mode: 'insensitive' } }
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [total, applications] = await prisma.$transaction([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { [sort]: order },
      include: {
        job: true
      }
    })
  ]);

  const totalPages = Math.ceil(total / limitNum) || 1;

  return {
    applications: applications.map(app => formatApplicationOutput(app)),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1
    }
  };
}

/**
 * Get Aggregated Application Counts per Bucket
 */
async function getApplicationCounts({ userId, tenantId }) {
  const whereBase = { userId, tenantId };

  const [totalAll, totalSubmitted, totalInFlight, totalNeeds, totalFailed, totalSkipped] = await Promise.all([
    prisma.application.count({ where: whereBase }),
    prisma.application.count({ where: { ...whereBase, status: { in: BUCKET_STATUS_MAP[KANBAN_BUCKETS.SUBMITTED] } } }),
    prisma.application.count({ where: { ...whereBase, status: { in: BUCKET_STATUS_MAP[KANBAN_BUCKETS.IN_FLIGHT] } } }),
    prisma.application.count({ where: { ...whereBase, status: { in: BUCKET_STATUS_MAP[KANBAN_BUCKETS.NEEDS] } } }),
    prisma.application.count({ where: { ...whereBase, status: { in: BUCKET_STATUS_MAP[KANBAN_BUCKETS.FAILED] } } }),
    prisma.application.count({ where: { ...whereBase, status: { in: BUCKET_STATUS_MAP[KANBAN_BUCKETS.SKIPPED] } } })
  ]);

  return {
    all: totalAll,
    submitted: totalSubmitted,
    in_flight: totalInFlight,
    needs: totalNeeds,
    failed: totalFailed,
    skipped: totalSkipped
  };
}

/**
 * Get Detailed Application with Event Timeline
 */
async function getApplicationDetail({ applicationId, userId, tenantId }) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      job: true,
      events: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!application) {
    throw new Error('Application not found');
  }

  // Cross-tenant and cross-user authorization enforcement
  if (application.userId !== userId || application.tenantId !== tenantId) {
    throw new Error('Forbidden: Unauthorized application access across tenant or candidate boundaries');
  }

  return formatApplicationOutput(application, true);
}

/**
 * Create a New Application Record from a Job Requisition
 */
async function createApplication({
  userId,
  tenantId,
  jobId,
  company,
  position,
  url,
  ats = 'greenhouse'
}) {
  let job = null;
  if (jobId) {
    job = await prisma.job.findUnique({ where: { id: jobId } });
  }

  const finalCompany = company || (job && job.company) || 'Target Employer';
  const finalPosition = position || (job && job.title) || 'Software Engineer';
  const finalUrl = url || (job && job.url) || 'https://jobs.example.com';
  const finalAts = ats || (job && job.ats) || 'greenhouse';

  const newApp = await prisma.application.create({
    data: {
      userId,
      tenantId,
      jobId: job ? job.id : null,
      company: finalCompany,
      position: finalPosition,
      url: finalUrl,
      ats: finalAts,
      status: atsAutomation.APPLICATION_STATES.DRAFT,
      stage: 'APPLIED'
    }
  });

  await prisma.applicationEvent.create({
    data: {
      applicationId: newApp.id,
      fromStatus: null,
      toStatus: atsAutomation.APPLICATION_STATES.DRAFT,
      eventType: 'APPLICATION_CREATED',
      payload: { company: finalCompany, position: finalPosition, ats: finalAts }
    }
  });

  return formatApplicationOutput(newApp);
}

/**
 * Update Application Lifecycle Stage (e.g. Interviewing, Offer, Rejected)
 */
async function updateApplicationStage({ applicationId, userId, tenantId, stage }) {
  const normalizedStage = (stage || '').toUpperCase();
  if (!VALID_STAGES.includes(normalizedStage)) {
    throw new Error(`Invalid stage: "${stage}". Valid stages: ${VALID_STAGES.join(', ')}`);
  }

  const application = await prisma.application.findUnique({
    where: { id: applicationId }
  });

  if (!application) {
    throw new Error('Application not found');
  }

  if (application.userId !== userId || application.tenantId !== tenantId) {
    throw new Error('Forbidden: Unauthorized application stage modification');
  }

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { stage: normalizedStage }
  });

  await prisma.applicationEvent.create({
    data: {
      applicationId,
      fromStatus: application.status,
      toStatus: application.status,
      eventType: 'STAGE_UPDATED',
      payload: { previousStage: application.stage, newStage: normalizedStage }
    }
  });

  return formatApplicationOutput(updated);
}

/**
 * Resolve Human Action Escalation (NEEDS_USER_ACTION)
 */
async function resolveCandidateAction({ applicationId, userId, tenantId, resolvedAnswers = [], instructions = '' }) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId }
  });

  if (!application) {
    throw new Error('Application not found');
  }

  if (application.userId !== userId || application.tenantId !== tenantId) {
    throw new Error('Forbidden: Cross-tenant application action resolution');
  }

  if (application.status !== atsAutomation.APPLICATION_STATES.NEEDS_USER_ACTION) {
    throw new Error(`Application is not currently awaiting action (current status: ${application.status})`);
  }

  // Merge candidate answers with existing screening answers
  let existingAnswers = [];
  try {
    existingAnswers = application.screeningAnswers ? (Array.isArray(application.screeningAnswers) ? application.screeningAnswers : JSON.parse(application.screeningAnswers)) : [];
  } catch (e) {}

  const mergedMap = new Map();
  existingAnswers.forEach(a => mergedMap.set(a.fieldId, a));
  resolvedAnswers.forEach(a => mergedMap.set(a.fieldId, { ...a, source: 'CANDIDATE_MANUAL_INPUT' }));

  const merged = Array.from(mergedMap.values());

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: atsAutomation.APPLICATION_STATES.READY_FOR_SUBMISSION,
      screeningAnswers: merged,
      lastError: null
    }
  });

  await prisma.applicationEvent.create({
    data: {
      applicationId,
      fromStatus: atsAutomation.APPLICATION_STATES.NEEDS_USER_ACTION,
      toStatus: atsAutomation.APPLICATION_STATES.READY_FOR_SUBMISSION,
      eventType: 'CANDIDATE_ACTION_RESOLVED',
      payload: { answersResolved: resolvedAnswers.length, instructions }
    }
  });

  return formatApplicationOutput(updated);
}

/**
 * Retrieve Cryptographic Verified Submission Receipt
 * Invariant: NEVER represents dry-run artifacts or unconfirmed submissions as employer acknowledgment.
 */
async function getVerifiedReceipt({ applicationId, userId, tenantId }) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { job: true, user: true }
  });

  if (!application) {
    throw new Error('Application not found');
  }

  if (application.userId !== userId || application.tenantId !== tenantId) {
    throw new Error('Forbidden: Cross-tenant receipt access');
  }

  let receiptData = null;
  if (application.receiptData) {
    try {
      receiptData = typeof application.receiptData === 'object' ? application.receiptData : JSON.parse(application.receiptData);
    } catch (e) {}
  }

  // Invariant check: Reject dry-run diagnostic artifacts
  if (receiptData && (receiptData.mode === 'DRY_RUN' || receiptData.type === atsAutomation.RECEIPT_TYPES.DRY_RUN_DIAGNOSTIC || receiptData.dryRun === true)) {
    throw new Error('NOT_AN_EMPLOYER_RECEIPT: Application was executed as a dry-run diagnostic. No employer receipt exists. Request diagnostic proof instead.');
  }

  if (application.status !== atsAutomation.APPLICATION_STATES.SUBMITTED_CONFIRMED) {
    throw new Error(`NO_SUBMISSION_RECEIPT: No verified submission receipt exists. Application has not been confirmed by employer ATS. Current status: ${application.status}`);
  }

  if (!receiptData) {
    // Generate authoritative fallback receipt if confirmed but raw JSON missing
    const confNumber = application.confirmationNumber || null;
    const timestamp = application.updatedAt ? application.updatedAt.toISOString() : new Date().toISOString();
    const hash = atsAutomation.generateReceiptHash(
      application.id,
      application.userId,
      application.job ? application.job.requisitionHash : application.id,
      confNumber || 'EMPLOYER_ACKNOWLEDGED',
      timestamp
    );

    receiptData = {
      type: atsAutomation.RECEIPT_TYPES.EMPLOYER_CONFIRMED,
      verified: true,
      employerConfirmed: true,
      receiptHash: hash,
      confirmationNumber: confNumber,
      timestamp,
      ats: application.ats,
      company: application.company,
      position: application.position,
      candidateName: application.user.name,
      candidateEmail: application.user.email,
      evidenceArtifact: application.submissionEvidence
    };
  }

  return {
    applicationId: application.id,
    company: application.company,
    position: application.position,
    status: application.status,
    stage: application.stage,
    receipt: receiptData
  };
}

/**
 * Retrieve Staging Diagnostic Proof (Dry-Run Artifacts)
 */
async function getDiagnosticProof({ applicationId, userId, tenantId }) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { job: true, user: true }
  });

  if (!application) {
    throw new Error('Application not found');
  }

  if (application.userId !== userId || application.tenantId !== tenantId) {
    throw new Error('Forbidden: Cross-tenant diagnostic access');
  }

  let receiptData = null;
  if (application.receiptData) {
    try {
      receiptData = typeof application.receiptData === 'object' ? application.receiptData : JSON.parse(application.receiptData);
    } catch (e) {}
  }

  return {
    applicationId: application.id,
    company: application.company,
    position: application.position,
    status: application.status,
    stage: application.stage,
    diagnostic: receiptData || {
      type: atsAutomation.RECEIPT_TYPES.DRY_RUN_DIAGNOSTIC,
      mode: 'DRY_RUN',
      employerConfirmed: false,
      screenshotArtifact: application.submissionEvidence
    }
  };
}

/**
 * Format Application Entity for API Output
 */
function formatApplicationOutput(app, includeEvents = false) {
  let parsedReceipt = null;
  if (app.receiptData) {
    try {
      parsedReceipt = typeof app.receiptData === 'object' ? app.receiptData : JSON.parse(app.receiptData);
    } catch (e) {}
  }

  let parsedDiff = null;
  if (app.diffData) {
    try {
      parsedDiff = typeof app.diffData === 'object' ? app.diffData : JSON.parse(app.diffData);
    } catch (e) {}
  }

  const out = {
    id: app.id,
    applicationId: app.id,
    company: app.company,
    position: app.position,
    url: app.url,
    ats: app.ats,
    status: app.status,
    stage: app.stage || 'APPLIED',
    confirmationNumber: app.confirmationNumber,
    receiptUrl: app.receiptUrl,
    submissionEvidence: app.submissionEvidence,
    executionAttempts: app.executionAttempts,
    lastError: app.lastError,
    quarantineReason: app.quarantineReason,
    receipt: parsedReceipt,
    diff: parsedDiff,
    screeningAnswers: app.screeningAnswers || [],
    hasApproval: Boolean(app.approvalSignature),
    approvalTimestamp: app.approvalTimestamp,
    createdAt: app.createdAt ? app.createdAt.toISOString() : null,
    updatedAt: app.updatedAt ? app.updatedAt.toISOString() : null
  };

  if (includeEvents && app.events) {
    out.timeline = app.events.map(ev => ({
      id: ev.id,
      fromStatus: ev.fromStatus,
      toStatus: ev.toStatus,
      eventType: ev.eventType,
      payload: ev.payload,
      createdAt: ev.createdAt ? ev.createdAt.toISOString() : null
    }));
  }

  return out;
}

module.exports = {
  KANBAN_BUCKETS,
  BUCKET_STATUS_MAP,
  VALID_STAGES,
  listApplications,
  getApplicationCounts,
  getApplicationDetail,
  createApplication,
  updateApplicationStage,
  resolveCandidateAction,
  getVerifiedReceipt,
  getDiagnosticProof
};
