// Rolevia AI · Master ATS Automation & Execution Engine
// Orchestrates multi-platform Playwright automation, PostgreSQL state machine, 
// cryptographic approval verification, two-phase credit commit, and non-stealth dry-run safety gates.

const crypto = require('crypto');
const prisma = require('../db');
const billingService = require('../billing');
const BrowserDriver = require('./browserDriver');
const adapterRegistry = require('./adapterRegistry');
const { verifyApprovalSignature, exportWorkspaceBinaryDocument } = require('../resumeWorkspace');

class AtsAutomationEngine {
  constructor() {
    this.inFlightLocks = new Set();
  }

  /**
   * Generates a collision-resistant idempotency key bound to the candidate, tenant, employer, and requisition.
   * Crucially, this key does NOT change if the resume is re-tailored, preventing duplicate submissions to the same requisition.
   */
  generateSubmissionIdempotencyKey({ tenantId, userId, company, jobId, reqId }) {
    const normCompany = (company || '').toLowerCase().trim();
    const normReq = (reqId || jobId || '').toLowerCase().trim();
    return crypto.createHash('sha256')
      .update(`${tenantId}:${userId}:${normCompany}:${normReq}`)
      .digest('hex');
  }

  /**
   * Executes an application lifecycle: validates cryptographic approval, navigates ATS,
   * maps fields, uploads resume, and completes dry-run or submission.
   * 
   * @param {Object} params
   * @param {string} params.applicationId
   * @param {string} params.userId
   * @param {string} params.tenantId
   * @param {string} [params.executionMode='DRY_RUN'] - 'DRY_RUN' | 'LIVE'
   * @param {boolean} [params.finalSubmissionConsent=false] - Explicit final authorization
   * @returns {Promise<Object>} Execution result & updated application record
   */
  async executeApplication({ applicationId, userId, tenantId, executionMode = 'DRY_RUN', finalSubmissionConsent = false }) {
    const lockKey = `${tenantId}:${applicationId}`;
    if (this.inFlightLocks.has(lockKey)) {
      throw new Error(`CONCURRENCY_CONFLICT: Application ${applicationId} is already executing`);
    }
    this.inFlightLocks.add(lockKey);

    let session = null;
    const logs = [];

    const logEvent = (stage, details = {}) => {
      const entry = { stage, timestamp: new Date().toISOString(), details };
      logs.push(entry);
    };

    try {
      logEvent('INIT', { applicationId, executionMode });

      // 1. Load application & verify tenant/user ownership from PostgreSQL
      const application = await prisma.application.findFirst({
        where: { id: applicationId, tenantId, userId },
        include: { user: true, job: true }
      });

      if (!application) {
        throw new Error('APPLICATION_NOT_FOUND: Application does not exist or access is forbidden');
      }

      // 2. Duplicate submission prevention (Idempotency Key Check)
      const idempotencyKey = this.generateSubmissionIdempotencyKey({
        tenantId,
        userId,
        company: application.company,
        jobId: application.jobId,
        reqId: application.job ? application.job.requisitionHash : null
      });

      const existingSubmission = await prisma.application.findFirst({
        where: {
          idempotencyKey,
          id: { not: applicationId },
          status: { in: ['SUBMITTED_CONFIRMED', 'SUBMISSION_IN_FLIGHT'] }
        }
      });

      if (existingSubmission) {
        const err = new Error(`DUPLICATE_SUBMISSION_PREVENTED: Candidate has already applied to ${application.company} (Req ID: ${existingSubmission.id}).`);
        err.code = 'DUPLICATE_SUBMISSION_PREVENTED';
        throw err;
      }

      // 3. Cryptographic Approval Verification
      if (!application.diffData) {
        throw new Error('UNAPPROVED_DOCUMENT: Application has no tailored workspace or diff');
      }

      const diffJson = JSON.parse(application.diffData);
      const approvalRecord = diffJson.approvalRecord;

      if (!approvalRecord) {
        throw new Error('APPROVAL_REQUIRED: Document has not received candidate cryptographic approval');
      }

      if (diffJson.status !== 'APPROVED' && application.status === 'DRAFT') {
        throw new Error('APPROVAL_REVOKED: Resume content was modified after approval; renew authorization');
      }

      const candidateSecret = process.env.APPROVAL_HMAC_SECRET || 'rolevia-candidate-approval-gate';
      const currentDocText = diffJson.optimizedResumeText || '';
      const cryptoCheck = verifyApprovalSignature(approvalRecord, candidateSecret, currentDocText);

      if (!cryptoCheck.valid) {
        throw new Error(`INVALID_APPROVAL_SIGNATURE: ${cryptoCheck.reason || 'Cryptographic check failed'}`);
      }

      logEvent('APPROVAL_VERIFIED', {
        documentHash: approvalRecord.documentHash,
        versionId: approvalRecord.versionId,
        approvedAt: approvalRecord.approvedAt
      });

      // 4. Load Candidate Profile & FactStore
      const candidateProfile = await prisma.candidateProfile.findUnique({
        where: { userId },
        include: { facts: true }
      });

      if (!candidateProfile) {
        throw new Error('CANDIDATE_PROFILE_MISSING: Incomplete profile');
      }

      const candidateData = {
        user: application.user,
        profile: {
          ...candidateProfile,
          skills: JSON.parse(candidateProfile.skills || '[]')
        },
        facts: candidateProfile.facts.map(f => ({
          ...f,
          highlights: JSON.parse(f.highlights || '[]')
        }))
      };

      // 5. Generate approved binary PDF for upload
      const pdfExportResult = await exportWorkspaceBinaryDocument({
        workspaceId: diffJson.workspaceId || applicationId,
        format: 'pdf',
        targetApp: application
      });
      const pdfBuffer = Buffer.isBuffer(pdfExportResult) ? pdfExportResult : (pdfExportResult && pdfExportResult.buffer);

      logEvent('PDF_GENERATED', { sizeBytes: pdfBuffer ? pdfBuffer.length : 0 });

      // 6. Launch Browser & Match ATS Adapter
      session = await BrowserDriver.createSession({ headless: true });
      const targetUrl = application.url;

      logEvent('NAVIGATING', { url: targetUrl });
      await session.page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

      const adapter = adapterRegistry.resolveAdapter(targetUrl, await session.page.content());
      logEvent('ADAPTER_MATCHED', { ats: adapter.name });

      // 7. Inspect & Populate Form
      const formInfo = await adapter.inspectForm(session.page);
      logEvent('FORM_INSPECTED', formInfo);

      const popResult = await adapter.populateFields(session.page, candidateData);
      logEvent('FIELDS_POPULATED', popResult);

      // Handle multi-step progression if supported
      if (adapter.advanceStep) {
        await adapter.advanceStep(session.page);
        logEvent('STEP_ADVANCED');
      }

      // 8. Upload Resume PDF
      const uploadResult = await adapter.uploadResume(session.page, pdfBuffer, `${application.user.name.replace(/\s+/g, '_')}_Resume.pdf`);
      logEvent('RESUME_UPLOADED', uploadResult);

      // 9. Answer Screening Questions using Verified Facts
      const questionsResult = await adapter.answerScreeningQuestions(session.page, candidateData);
      logEvent('SCREENING_ANSWERED', questionsResult);

      // 11. Form Validation Check
      const validation = await adapter.validateForm(session.page);
      logEvent('FORM_VALIDATED', validation);

      // 12. Capture Diagnostic Evidence Screenshot
      const screenshotPath = await BrowserDriver.captureEvidenceScreenshot(session.page, `ats_${adapter.engineId}`);
      logEvent('SCREENSHOT_CAPTURED', { screenshotPath });

      // 13. DRY_RUN Execution Boundary
      if (executionMode === 'DRY_RUN' || !finalSubmissionConsent) {
        logEvent('DRY_RUN_HALTED', { reason: 'Dry run completed. Awaiting explicit candidate consent for final submit.' });

        // Update database to FORM_FILLED
        const updatedApp = await prisma.application.update({
          where: { id: applicationId },
          data: {
            status: 'FORM_FILLED',
            executionMode: 'DRY_RUN',
            idempotencyKey,
            documentHash: approvalRecord.documentHash,
            documentVersionId: approvalRecord.versionId,
            approvalSignature: approvalRecord.signature,
            screenshotPath,
            executionLogs: JSON.stringify(logs)
          }
        });

        return {
          status: 'FORM_FILLED',
          dryRun: true,
          validation,
          screenshotPath,
          unhandledQuestions: questionsResult.unhandled,
          application: updatedApp
        };
      }

      // 14. LIVE Final Submission Execution
      // Reserve Credits via Two-Phase Commit (Hold)
      await billingService.reserveCreditForApplication({
        tenantId,
        userId,
        applicationId,
        requisitionId: application.job ? application.job.requisitionHash : applicationId
      });
      logEvent('CREDIT_HELD', { amount: 1 });

      // Transition to SUBMISSION_IN_FLIGHT in DB
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: 'SUBMISSION_IN_FLIGHT',
          submissionConsent: true,
          executionMode: 'LIVE'
        }
      });

      // Click submit
      let submitResult;
      try {
        submitResult = await adapter.submit(session.page);
        logEvent('SUBMIT_TRIGGERED', submitResult);
      } catch (submitErr) {
        // Quarantine or Fail
        logEvent('SUBMIT_ERROR', { error: submitErr.message });
        await billingService.releaseCreditForApplication({
          tenantId,
          userId,
          applicationId,
          reason: submitErr.message
        });

        await prisma.application.update({
          where: { id: applicationId },
          data: {
            status: 'FAILED',
            failureReason: submitErr.message,
            executionLogs: JSON.stringify(logs)
          }
        });
        throw submitErr;
      }

      // 15. Parse Receipt & Verify Confirmation
      const receipt = await adapter.parseReceipt(session.page);
      logEvent('RECEIPT_PARSED', receipt);

      if (!receipt.confirmed) {
        // Unknown outcome -> Quarantine!
        logEvent('OUTCOME_UNKNOWN_QUARANTINED', { reason: 'Portal response ambiguous' });

        await billingService.quarantineOutcomeUnknown({
          tenantId,
          userId,
          applicationId,
          reason: 'Submission executed but receipt confirmation text not verified.'
        });

        await prisma.application.update({
          where: { id: applicationId },
          data: {
            status: 'OUTCOME_UNKNOWN',
            quarantineReason: 'Submission executed but receipt confirmation text not verified.',
            executionLogs: JSON.stringify(logs)
          }
        });

        return {
          status: 'OUTCOME_UNKNOWN',
          quarantined: true,
          receipt
        };
      }

      // 16. Confirmed Success -> Commit Credit
      await billingService.commitCreditForApplication({
        tenantId,
        userId,
        applicationId,
        confirmationNumber: receipt.confirmationNumber,
        receiptData: receipt
      });
      logEvent('CREDIT_COMMITTED', { amount: 1 });

      const finalApp = await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: 'SUBMITTED_CONFIRMED',
          confirmationNumber: receipt.confirmationNumber,
          receiptData: JSON.stringify(receipt),
          executionLogs: JSON.stringify(logs)
        }
      });

      return {
        status: 'SUBMITTED_CONFIRMED',
        confirmed: true,
        receipt,
        application: finalApp
      };

    } catch (err) {
      logEvent('EXECUTION_EXCEPTION', { error: err.message });
      throw err;
    } finally {
      this.inFlightLocks.delete(lockKey);
      if (session) {
        await BrowserDriver.safeClose(session);
      }
    }
  }

  /**
   * Reconciles quarantined or in-flight applications after an unexpected worker interruption.
   */
  async recoverInterruptedExecutions() {
    const stuckApps = await prisma.application.findMany({
      where: {
        status: { in: ['SUBMISSION_IN_FLIGHT'] },
        updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) }
      }
    });

    const recovered = [];
    for (const app of stuckApps) {
      const updated = await prisma.application.update({
        where: { id: app.id },
        data: {
          status: 'OUTCOME_UNKNOWN',
          quarantineReason: 'Worker interrupted during in-flight submission. Quarantined for manual confirmation.'
        }
      });
      recovered.push(updated.id);
    }

    return { recoveredCount: recovered.length, recovered };
  }
}

module.exports = new AtsAutomationEngine();
