// Rolevia AI · Application Workflow State Contract & Schema (Phase 1)
// Architecture: Typed, versioned workflow state contract governing the 10-stage
// autonomous job application lifecycle with strict idempotency and side-effect boundaries.

const { z } = require('zod');

const WORKFLOW_VERSION = '1.0.0';

/**
 * 10-Stage Pipeline Lifecycle
 */
const WorkflowStageEnum = z.enum([
  'DISCOVER',
  'MATCH',
  'OPTIMIZE',
  'DOCUMENT_REVIEW',
  'SUBMISSION_AUTHORIZATION',
  'PREPARE_APPLICATION',
  'HUMAN_REVIEW',
  'SUBMIT',
  'VERIFY',
  'TRACK'
]);

/**
 * Workflow Termination & Escalation Statuses
 */
const WorkflowStatusEnum = z.enum([
  'INITIALIZED',
  'IN_PROGRESS',
  'PAUSED_FOR_HUMAN',
  'INELIGIBLE_STOP',
  'NEEDS_VERIFICATION',
  'HUMAN_ESCALATION_MFA',
  'HUMAN_ESCALATION_QUESTIONS',
  'OUTCOME_UNKNOWN_QUARANTINE',
  'FAILED_CONFIRMED',
  'SUBMITTED_CONFIRMED',
  'COMPLETED_TRACKED'
]);

/**
 * Execution Mode: Dry-Run Staging vs Live Candidate-Authorized Submit
 */
const ExecutionModeEnum = z.enum(['DRY_RUN', 'LIVE']);

/**
 * Zod Schema for Application Workflow State
 */
const ApplicationWorkflowStateSchema = z.object({
  // Versioning & Identification
  workflowVersion: z.string().default(WORKFLOW_VERSION),
  tenantId: z.string().min(1, 'tenantId is required'),
  userId: z.string().min(1, 'userId is required'),
  applicationId: z.string().min(1, 'applicationId is required'),
  jobId: z.string().optional().nullable(),
  jobRequisitionHash: z.string().optional().nullable(),
  executionMode: ExecutionModeEnum.default('DRY_RUN'),

  // Stage & Status
  currentStage: WorkflowStageEnum.default('DISCOVER'),
  status: WorkflowStatusEnum.default('INITIALIZED'),

  // Candidate FactStore Context: All fields must represent UNKNOWN (null) unless verified
  candidateProfile: z.object({
    skills: z.array(z.string()).default([]),
    experienceYears: z.number().optional().nullable().default(null),
    educationLevel: z.string().optional().nullable().default(null),
    graduationYear: z.number().optional().nullable().default(null),
    workAuthorization: z.string().optional().nullable().default(null), // e.g. CITIZEN, PERMANENT_RESIDENT, OPT, H1B, or null (UNKNOWN)
    needsSponsorship: z.boolean().optional().nullable().default(null), // Must NEVER default to false
    expectedSalary: z.object({
      currency: z.string().default('USD'),
      min: z.number().optional().nullable(),
      max: z.number().optional().nullable()
    }).optional().nullable().default(null),
    contradictionsDetected: z.boolean().default(false),
    contradictionReasons: z.array(z.string()).default([]),
    unverifiedFields: z.array(z.string()).default([]),
    factIds: z.array(z.string()).default([])
  }).default({}),

  // Job Requisition Data
  jobData: z.object({
    company: z.string().default(''),
    position: z.string().default(''),
    ats: z.string().default(''),
    url: z.string().default(''),
    applyUrl: z.string().optional().nullable(),
    requiredSkills: z.array(z.string()).default([]),
    preferredSkills: z.array(z.string()).default([]),
    minYearsExp: z.number().optional().nullable(),
    sponsorshipAvailable: z.boolean().optional().nullable()
  }).default({}),

  // Match Engine Evaluation
  matchEvaluation: z.object({
    eligibility: z.enum(['ELIGIBLE', 'INELIGIBLE', 'NEEDS_VERIFICATION']).default('NEEDS_VERIFICATION'),
    score: z.number().min(0).max(100).default(0),
    reason: z.string().default(''),
    unmetRequirements: z.array(z.string()).default([])
  }).optional().nullable(),

  // Resume & Cover Letter Optimization
  optimization: z.object({
    diffData: z.record(z.any()).optional().nullable(),
    tailoredSummary: z.string().optional().nullable(),
    tailoredCoverLetter: z.string().optional().nullable(),
    documentHash: z.string().default(''),
    documentVersion: z.number().default(1),
    claimValidations: z.array(z.record(z.any())).default([])
  }).optional().nullable(),

  // Human Review & Document Approval
  documentReview: z.object({
    approvedByCandidate: z.boolean().default(false),
    approvedAt: z.string().optional().nullable(),
    candidateEditsApplied: z.boolean().default(false),
    approvedContentHash: z.string().optional().nullable()
  }).default({}),

  // Submission Authorization (HMAC-SHA256 Token)
  submissionAuthorization: z.object({
    isAuthorized: z.boolean().default(false),
    authorizationToken: z.string().optional().nullable(),
    authorizedAt: z.string().optional().nullable(),
    expiresAt: z.string().optional().nullable(),
    authorizationScope: z.string().default('SINGLE_APPLICATION')
  }).default({}),

  // Application Preparation & Screening Questions
  screeningQuestions: z.array(
    z.object({
      questionText: z.string(),
      category: z.enum(['FACTUAL', 'NARRATIVE', 'LEGAL_ATTESTATION', 'SENSITIVE_DISCLOSURE', 'UNKNOWN']),
      answer: z.string().optional().nullable(),
      requiresCandidateAction: z.boolean().default(false),
      groundedFactId: z.string().optional().nullable()
    })
  ).default([]),

  // Execution & Credit Management
  execution: z.object({
    creditHeld: z.boolean().default(false),
    creditHoldId: z.string().optional().nullable(),
    creditCommitted: z.boolean().default(false),
    creditReleased: z.boolean().default(false),
    attempts: z.number().default(0),
    lastError: z.string().optional().nullable(),
    humanInterventionReason: z.string().optional().nullable()
  }).default({}),

  // Verification & Receipt
  receipt: z.object({
    confirmed: z.boolean().default(false),
    confirmationNumber: z.string().optional().nullable(),
    receiptType: z.enum(['DRY_RUN_DIAGNOSTIC', 'FORM_COMPLETION', 'ATTEMPT', 'CONFIRMED']).default('DRY_RUN_DIAGNOSTIC'),
    evidenceScreenshot: z.string().optional().nullable(),
    verifiedAt: z.string().optional().nullable()
  }).optional().nullable(),

  // Audit Logs & Telemetry
  events: z.array(
    z.object({
      timestamp: z.string(),
      fromStage: z.string().optional().nullable(),
      toStage: z.string(),
      eventType: z.string(),
      details: z.record(z.any()).optional().nullable()
    })
  ).default([])
});

const idempotency = require('./idempotency');

/**
 * Generate Strict Idempotency Key for a Workflow Execution Node
 */
function generateNodeIdempotencyKey(state, nodeName) {
  return `${state.tenantId}:${state.userId}:${state.applicationId}:${state.workflowVersion}:${nodeName}`;
}

/**
 * Factory to create valid initial workflow state
 */
function createInitialWorkflowState(params) {
  return ApplicationWorkflowStateSchema.parse({
    workflowVersion: WORKFLOW_VERSION,
    tenantId: params.tenantId,
    userId: params.userId,
    applicationId: params.applicationId,
    jobId: params.jobId || null,
    jobRequisitionHash: params.jobRequisitionHash || null,
    executionMode: params.executionMode || 'DRY_RUN',
    currentStage: 'DISCOVER',
    status: 'INITIALIZED',
    candidateProfile: params.candidateProfile || {},
    jobData: params.jobData || {},
    events: [
      {
        timestamp: new Date().toISOString(),
        toStage: 'DISCOVER',
        eventType: 'WORKFLOW_INITIALIZED',
        details: { executionMode: params.executionMode || 'DRY_RUN' }
      }
    ]
  });
}

module.exports = {
  WORKFLOW_VERSION,
  WorkflowStageEnum,
  WorkflowStatusEnum,
  ExecutionModeEnum,
  ApplicationWorkflowStateSchema,
  generateNodeIdempotencyKey,
  createInitialWorkflowState,
  ...idempotency
};
