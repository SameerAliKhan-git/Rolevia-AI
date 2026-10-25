# ROLEVIA AI · AGENT WORKFLOW STATE CONTRACT
**Document Version:** 1.0.0  
**Contract Version:** `1.0.0` (`WORKFLOW_VERSION`)  
**Product:** Rolevia AI (`RoleviaAI`)  
**Domain:** https://roleviaai.co.in  
**Module:** `backend/workflows/applicationWorkflowTypes.js`  
**Validation Library:** `zod`  

---

## 1. Overview & Invariants

This document establishes the typed contract for Rolevia AI's autonomous application lifecycle. Any execution node within the LangGraph orchestrator must adhere to this contract.

### Fundamental System Invariants:
1. **Immutable Scoping:** `tenantId`, `userId`, and `applicationId` are required on all non-initial payloads and must never mutate during graph execution.
2. **Version Pinning:** Every state transition carries `workflowVersion: '1.0.0'`. Future schema migrations increment this semver string.
3. **Deterministic Idempotency:** Each node execution computes a deterministic idempotency key (`${tenantId}:${userId}:${applicationId}:${workflowVersion}:${nodeName}`) preventing duplicate execution.
4. **Approval Invalidation:** Modifying tailored document text immediately clears candidate approval and loops back to optimization.

---

## 2. Enums and Types

### 2.1 Workflow Stages
```typescript
type WorkflowStage =
  | 'DISCOVER'
  | 'MATCH'
  | 'OPTIMIZE'
  | 'DOCUMENT_REVIEW'
  | 'SUBMISSION_AUTHORIZATION'
  | 'PREPARE_APPLICATION'
  | 'HUMAN_REVIEW'
  | 'SUBMIT'
  | 'VERIFY'
  | 'TRACK';
```

### 2.2 Workflow Statuses
```typescript
type WorkflowStatus =
  | 'INITIALIZED'
  | 'IN_PROGRESS'
  | 'PAUSED_FOR_HUMAN'
  | 'INELIGIBLE_STOP'
  | 'NEEDS_VERIFICATION'
  | 'HUMAN_ESCALATION_MFA'
  | 'HUMAN_ESCALATION_QUESTIONS'
  | 'OUTCOME_UNKNOWN_QUARANTINE'
  | 'FAILED_CONFIRMED'
  | 'SUBMITTED_CONFIRMED'
  | 'COMPLETED_TRACKED';
```

### 2.3 Execution Mode
```typescript
type ExecutionMode = 'DRY_RUN' | 'LIVE';
```

---

## 3. Zod State Schema Definition

```javascript
const ApplicationWorkflowStateSchema = z.object({
  // Versioning & Identification
  workflowVersion: z.string().default('1.0.0'),
  tenantId: z.string({ required_error: 'tenantId is required' }).min(1),
  userId: z.string({ required_error: 'userId is required' }).min(1),
  applicationId: z.string({ required_error: 'applicationId is required' }).min(1),
  jobId: z.string().optional().nullable(),
  jobRequisitionHash: z.string().optional().nullable(),
  executionMode: z.enum(['DRY_RUN', 'LIVE']).default('DRY_RUN'),

  // Stage & Status
  currentStage: WorkflowStageEnum.default('DISCOVER'),
  status: WorkflowStatusEnum.default('INITIALIZED'),

  // Candidate Fact Profile
  candidateProfile: z.object({
    skills: z.array(z.string()).default([]),
    experienceYears: z.number().default(0),
    educationLevel: z.string().default("Bachelor's"),
    needsSponsorship: z.boolean().default(false),
    factIds: z.array(z.string()).default([])
  }).default({}),

  // Target Job Requisition
  jobData: z.object({
    company: z.string(),
    position: z.string(),
    ats: z.string().default('greenhouse'),
    url: z.string().default(''),
    applyUrl: z.string().optional(),
    requiredSkills: z.array(z.string()).default([]),
    minYearsExp: z.number().optional().nullable(),
    sponsorshipAvailable: z.boolean().optional().nullable()
  }),

  // Stage 2 Match Evaluation
  matchEvaluation: z.object({
    eligibility: z.enum(['ELIGIBLE', 'INELIGIBLE', 'NEEDS_VERIFICATION']),
    reasons: z.array(z.string()).default([]),
    score: z.number(),
    recommendation: z.string()
  }).optional().nullable(),

  // Stage 3 Document Optimization
  optimization: z.object({
    diffData: z.any().optional(),
    tailoredSummary: z.string().optional(),
    tailoredCoverLetter: z.string().optional(),
    documentHash: z.string(),
    documentVersion: z.number().default(1),
    claimValidations: z.array(z.any()).default([])
  }).optional().nullable(),

  // Stage 4 Candidate Document Review
  documentReview: z.object({
    approvedByCandidate: z.boolean().default(false),
    approvedAt: z.string().optional().nullable(),
    approvedContentHash: z.string().optional().nullable(),
    candidateEditsApplied: z.boolean().default(false)
  }).default({}),

  // Stage 5 Candidate Submission Authorization
  submissionAuthorization: z.object({
    isAuthorized: z.boolean().default(false),
    authorizationToken: z.string().optional().nullable(),
    authorizedAt: z.string().optional().nullable(),
    expiresAt: z.string().optional().nullable()
  }).default({}),

  // Stage 6 Screening Question Preparation
  screeningQuestions: z.array(z.object({
    questionText: z.string(),
    category: z.enum(['FACTUAL', 'NARRATIVE', 'SENSITIVE_DISCLOSURE']),
    draftAnswer: z.string().optional().nullable(),
    requiresCandidateReview: z.boolean().default(false),
    resolvedAnswer: z.string().optional().nullable()
  })).default([]),

  // Stage 8 Execution Telemetry
  execution: z.object({
    creditHeld: z.boolean().default(false),
    creditHoldId: z.string().optional().nullable(),
    creditCommitted: z.boolean().default(false),
    creditReleased: z.boolean().default(false),
    attempts: z.number().default(0),
    lastError: z.string().optional().nullable(),
    humanInterventionReason: z.string().optional().nullable()
  }).default({}),

  // Stage 9 Verification & Authoritative Receipt
  receipt: z.object({
    confirmed: z.boolean().default(false),
    confirmationNumber: z.string().optional().nullable(),
    receiptType: z.enum(['AUTHORITATIVE_ATS', 'DRY_RUN_DIAGNOSTIC', 'OUTCOME_UNKNOWN']),
    evidenceScreenshot: z.string().optional().nullable(),
    verifiedAt: z.string().optional().nullable()
  }).optional().nullable(),

  // Full Event Transition Journal
  events: z.array(z.object({
    timestamp: z.string(),
    fromStage: z.string(),
    toStage: z.string(),
    eventType: z.string(),
    details: z.any().optional()
  })).default([])
});
```

---

## 4. State Transition Matrix & Edge Routing

| Source Stage | Trigger / Condition | Destination Stage | Final State / Status |
|---|---|---|---|
| `DISCOVER` | Ingestion complete | `MATCH` | `IN_PROGRESS` |
| `MATCH` | Candidate is `ELIGIBLE` | `OPTIMIZE` | `IN_PROGRESS` |
| `MATCH` | Candidate is `INELIGIBLE` | `END` | `INELIGIBLE_STOP` |
| `OPTIMIZE` | Synthesis complete | `DOCUMENT_REVIEW` | `PAUSED_FOR_HUMAN` |
| `DOCUMENT_REVIEW` | Candidate edits text | `OPTIMIZE` | `IN_PROGRESS` (Re-hash) |
| `DOCUMENT_REVIEW` | Candidate approves content | `SUBMISSION_AUTHORIZATION` | `IN_PROGRESS` |
| `DOCUMENT_REVIEW` | Pending candidate sign-off | `END` | `PAUSED_FOR_HUMAN` |
| `SUBMISSION_AUTHORIZATION` | Valid HMAC signature | `PREPARE_APPLICATION` | `IN_PROGRESS` |
| `SUBMISSION_AUTHORIZATION` | Missing / invalid token | `END` | `PAUSED_FOR_HUMAN` |
| `PREPARE_APPLICATION` | Workday / MFA portal | `HUMAN_REVIEW` | `HUMAN_ESCALATION_MFA` |
| `PREPARE_APPLICATION` | Credit held & standard ATS | `SUBMIT` | `IN_PROGRESS` |
| `SUBMIT` | Browser run succeeds | `VERIFY` | `IN_PROGRESS` |
| `SUBMIT` | Browser runner fails | `END` | `FAILED_CONFIRMED` |
| `VERIFY` | Valid confirmation extracted | `TRACK` | `SUBMITTED_CONFIRMED` |
| `VERIFY` | Confirmation ambiguous | `END` | `OUTCOME_UNKNOWN_QUARANTINE` |
| `TRACK` | Record persisted in Kanban | `END` | `COMPLETED_TRACKED` |
