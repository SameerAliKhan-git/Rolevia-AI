// Rolevia AI · Release 0.3: Workflow Idempotency & Identity Architecture (Phase 3)
// Architecture: Strictly separates 6 orthogonal identities across workflow execution,
// state transitions, financial credit journals, ATS attempts, and duplicate requisitions.
// Invariant: Irreversible operations (credits, submissions) must have database-level uniqueness.

/**
 * 1. Workflow Thread Identity
 * Represents the persistent lifecycle of an application workflow across all nodes and steps.
 */
function generateWorkflowThreadId({ tenantId, userId, applicationId }) {
  if (!tenantId || !userId || !applicationId) {
    throw new Error('tenantId, userId, and applicationId are required for workflow thread ID');
  }
  return `${tenantId}:${userId}:${applicationId}`;
}

/**
 * 2. Node Execution Identity
 * Uniquely identifies a single node execution or retry within a workflow thread.
 */
function generateNodeExecutionKey({ tenantId, userId, applicationId, workflowVersion = '1.0.0', nodeName, executionAttempt = 1 }) {
  if (!tenantId || !userId || !applicationId || !nodeName) {
    throw new Error('tenantId, userId, applicationId, and nodeName are required for node execution key');
  }
  return `${tenantId}:${userId}:${applicationId}:${workflowVersion}:${nodeName}:attempt_${executionAttempt}`;
}

/**
 * 3. Workflow Attempt Identity
 * Tracks full workflow restarts or authorized resume cycles.
 */
function generateWorkflowAttemptKey({ tenantId, userId, applicationId, workflowAttempt = 1 }) {
  if (!tenantId || !userId || !applicationId) {
    throw new Error('tenantId, userId, and applicationId are required for workflow attempt key');
  }
  return `${tenantId}:${userId}:${applicationId}:wf_attempt_${workflowAttempt}`;
}

/**
 * 4. Payment Operation Identity
 * Mapped directly to CreditJournal @unique idempotencyKey to prevent double-charging or duplicate refunds.
 */
function generatePaymentOperationKey({ tenantId, userId, applicationId, operationType, referenceId = 'ref' }) {
  if (!tenantId || !userId || !applicationId || !operationType) {
    throw new Error('tenantId, userId, applicationId, and operationType are required for payment operation key');
  }
  return `${tenantId}:${userId}:${applicationId}:credit_${operationType}:${referenceId}`;
}

/**
 * 5. ATS Submission Attempt Identity
 * Identifies each browser automation run, bound to the candidate-approved document hash and timestamp.
 */
function generateAtsSubmissionAttemptKey({ tenantId, userId, applicationId, attemptNumber = 1, documentHash, timestamp }) {
  if (!tenantId || !userId || !applicationId || !documentHash) {
    throw new Error('tenantId, userId, applicationId, and documentHash are required for ATS submission key');
  }
  const ts = timestamp || Date.now();
  return `${tenantId}:${userId}:${applicationId}:ats_attempt_${attemptNumber}:${documentHash.slice(0, 16)}:${ts}`;
}

/**
 * 6. Employer-Candidate-Requisition Duplicate Identity
 * Guards against submitting duplicate applications to the exact same job requisition.
 */
function generateCandidateRequisitionDuplicateKey({ tenantId, userId, jobRequisitionHash }) {
  if (!tenantId || !userId || !jobRequisitionHash) {
    throw new Error('tenantId, userId, and jobRequisitionHash are required for duplicate key check');
  }
  return `${tenantId}:${userId}:${jobRequisitionHash}`;
}

module.exports = {
  generateWorkflowThreadId,
  generateNodeExecutionKey,
  generateWorkflowAttemptKey,
  generatePaymentOperationKey,
  generateAtsSubmissionAttemptKey,
  generateCandidateRequisitionDuplicateKey
};
