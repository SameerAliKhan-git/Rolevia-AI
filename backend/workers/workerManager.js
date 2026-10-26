/**
 * Rolevia AI · Distributed Worker Runner (Release 0.4)
 * Runs independent Playwright browser automation and LangGraph AI workers
 * with bounded concurrency, dead-letter recovery, and graceful shutdown.
 */

const { Worker } = require('bullmq');
const Redis = require('ioredis');
const prisma = require('../db');
const atsAutomation = require('../atsAutomation');
const resumeOptimizer = require('../resumeOptimizer');

const QUEUE_REDIS_URL = process.env.REDIS_QUEUE_URL || 'redis://127.0.0.1:6380';
const DEFAULT_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);

let workerConnection = null;

function getWorkerConnection() {
  if (!workerConnection || workerConnection.status === 'end') {
    workerConnection = new Redis(QUEUE_REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectTimeout: 5000
    });
  }
  return workerConnection;
}

let applicationWorker = null;
let resumeWorker = null;
let isShuttingDown = false;

// Metrics tracking
const workerTelemetry = {
  applicationJobsProcessed: 0,
  applicationJobsFailed: 0,
  resumeJobsProcessed: 0,
  resumeJobsFailed: 0,
  activeExecutions: 0,
  startedAt: new Date().toISOString()
};

/**
 * Initialize and start the BullMQ Worker pools
 */
function startWorkers(options = {}) {
  isShuttingDown = false;
  const appConcurrency = options.appConcurrency || DEFAULT_CONCURRENCY;
  const resumeConcurrency = options.resumeConcurrency || (DEFAULT_CONCURRENCY * 2);
  const conn = getWorkerConnection();

  // 1. Playwright ATS Automation Worker Pool
  applicationWorker = new Worker(
    'rolevia-application-automation',
    async (job) => {
      workerTelemetry.activeExecutions++;
      const startTime = Date.now();
      const { applicationId, options: execOptions } = job.data;

      try {
        console.log(`[Worker:Playwright] Processing application job ${job.id} for app ${applicationId} (Attempt ${job.attemptsMade + 1})`);
        
        // Execute workflow via Playwright modular engine
        const result = await atsAutomation.executeApplicationWorkflow(applicationId, execOptions || { mode: 'DRY_RUN' });
        
        const durationMs = Date.now() - startTime;
        workerTelemetry.applicationJobsProcessed++;
        
        console.log(`[Worker:Playwright] Completed job ${job.id} in ${durationMs}ms with status: ${result.status}`);
        return { success: result.success, status: result.status, durationMs };
      } catch (err) {
        workerTelemetry.applicationJobsFailed++;
        console.error(`[Worker:Playwright] Job ${job.id} failed: ${err.message}`);

        // Check current application status in database
        let currentStatus = null;
        try {
          const currentApp = await prisma.application.findUnique({
            where: { id: applicationId },
            select: { status: true }
          });
          currentStatus = currentApp?.status;
        } catch (fetchErr) {
          console.error('[Worker:Playwright] Failed to query application status:', fetchErr.message);
        }

        const isIrreversibleOrAmbiguous = (
          currentStatus === atsAutomation.APPLICATION_STATES.SUBMISSION_IN_FLIGHT ||
          currentStatus === atsAutomation.APPLICATION_STATES.OUTCOME_UNKNOWN ||
          currentStatus === atsAutomation.APPLICATION_STATES.SUBMITTED_CONFIRMED ||
          currentStatus === atsAutomation.APPLICATION_STATES.NEEDS_USER_ACTION
        );

        // Record dead-letter / failure audit event in PostgreSQL
        try {
          await prisma.applicationEvent.create({
            data: {
              applicationId,
              fromStatus: currentStatus,
              toStatus: currentStatus || 'FAILED_CONFIRMED',
              eventType: isIrreversibleOrAmbiguous ? 'WORKER_AMBIGUOUS_HALT_NO_RETRY' : 'WORKER_EXECUTION_FAILURE',
              payload: {
                error: err.message,
                statusAtFailure: currentStatus,
                isIrreversibleOrAmbiguous,
                attemptsMade: job.attemptsMade + 1,
                jobId: job.id
              }
            }
          });
        } catch (dbErr) {
          console.error('[Worker:Playwright] Failed to write failure audit to DB:', dbErr.message);
        }

        // SIDE-EFFECT BOUNDARY ENFORCEMENT:
        // Post-submission ambiguous or in-flight states MUST NEVER trigger blind automatic queue retries!
        if (isIrreversibleOrAmbiguous) {
          console.warn(`[Worker:Playwright] Suppressing automatic BullMQ retry for app ${applicationId} (status: ${currentStatus}) to prevent duplicate employer submission.`);
          job.opts.attempts = job.attemptsMade; // Clamp attempts to prevent BullMQ from rescheduling retry
          return {
            success: false,
            status: currentStatus,
            error: err.message,
            retriesSuppressed: true
          };
        }

        throw err; // Safe pre-submit transient errors may re-attempt up to default max attempts
      } finally {
        workerTelemetry.activeExecutions--;
      }
    },
    {
      connection: conn,
      concurrency: appConcurrency,
      limiter: {
        max: 50,
        duration: 1000 // Rate-limit admission to max 50 jobs per second
      }
    }
  );

  // 2. LangGraph AI / Resume Optimization Worker Pool
  resumeWorker = new Worker(
    'rolevia-resume-tailoring',
    async (job) => {
      workerTelemetry.activeExecutions++;
      const startTime = Date.now();
      const { userId, tenantId, resumeText, jobDescription } = job.data;

      try {
        console.log(`[Worker:LangGraph] Processing resume tailoring job ${job.id} for user ${userId}`);
        
        // Execute truth-grounded resume optimization
        const result = await resumeOptimizer.optimizeResume(
          { rawText: resumeText, userId },
          { rawDescription: jobDescription },
          { tenantId }
        );

        const durationMs = Date.now() - startTime;
        workerTelemetry.resumeJobsProcessed++;
        return { success: true, diffBullets: result.diff?.length || 0, durationMs };
      } catch (err) {
        workerTelemetry.resumeJobsFailed++;
        console.error(`[Worker:LangGraph] Job ${job.id} failed: ${err.message}`);
        throw err;
      } finally {
        workerTelemetry.activeExecutions--;
      }
    },
    {
      connection: conn,
      concurrency: resumeConcurrency
    }
  );

  // Worker Error Handlers
  applicationWorker.on('error', (err) => console.error('[Worker:Playwright Error]', err));
  resumeWorker.on('error', (err) => console.error('[Worker:LangGraph Error]', err));

  console.log(`✓ Rolevia Distributed Workers Online: Playwright concurrency=${appConcurrency}, LangGraph concurrency=${resumeConcurrency}`);
  return { applicationWorker, resumeWorker };
}

/**
 * Retrieve current worker telemetry and status
 */
function getWorkerStatus() {
  return {
    ...workerTelemetry,
    isShuttingDown,
    applicationWorkerRunning: !!applicationWorker && !applicationWorker.isPaused(),
    resumeWorkerRunning: !!resumeWorker && !resumeWorker.isPaused()
  };
}

/**
 * Graceful shutdown for workers
 */
async function stopWorkers(timeoutMs = 15000) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('[Worker] Graceful shutdown initiated. Draining in-flight jobs...');

  const closePromises = [];
  if (applicationWorker) closePromises.push(applicationWorker.close());
  if (resumeWorker) closePromises.push(resumeWorker.close());

  // Timeout guard
  const timeoutPromise = new Promise((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([Promise.all(closePromises), timeoutPromise]);

  if (workerConnection && workerConnection.status !== 'end') {
    await workerConnection.quit().catch(() => {});
    workerConnection = null;
  }
  console.log('[Worker] Worker pools stopped cleanly.');
}

// Handle termination signals if executed directly
if (require.main === module) {
  startWorkers();

  process.on('SIGINT', async () => {
    await stopWorkers();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await stopWorkers();
    process.exit(0);
  });
}

module.exports = {
  startWorkers,
  stopWorkers,
  getWorkerStatus
};
