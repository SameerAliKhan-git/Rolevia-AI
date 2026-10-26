/**
 * Rolevia AI · Distributed Queue Management (BullMQ + Redis)
 * Release 0.4: Queue Redis (noeviction, AOF persistence) isolation.
 */

const { Queue, QueueEvents } = require('bullmq');
const Redis = require('ioredis');

const QUEUE_REDIS_URL = process.env.REDIS_QUEUE_URL || 'redis://127.0.0.1:6380';
const CACHE_REDIS_URL = process.env.REDIS_CACHE_URL || 'redis://127.0.0.1:6379';

// Shared ioredis connection options
const redisConnectionOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  connectTimeout: 5000,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  }
};

// Queue Redis Client (port 6380)
const queueConnection = new Redis(QUEUE_REDIS_URL, redisConnectionOptions);
// Cache Redis Client (port 6379)
const cacheConnection = new Redis(CACHE_REDIS_URL, {
  enableReadyCheck: true,
  connectTimeout: 5000,
  maxRetriesPerRequest: 3
});

// Default Job Options: 3 attempts with exponential backoff for resilience
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  },
  removeOnComplete: {
    age: 3600, // keep completed jobs for 1 hour for telemetry
    count: 1000
  },
  removeOnFail: {
    age: 86400 // keep failed dead-letter jobs for 24 hours for inspection
  }
};

// Initialize BullMQ Queues
const applicationQueue = new Queue('rolevia-application-automation', {
  connection: queueConnection,
  defaultJobOptions
});

const resumeQueue = new Queue('rolevia-resume-tailoring', {
  connection: queueConnection,
  defaultJobOptions
});

const emailQueue = new Queue('rolevia-email-intelligence', {
  connection: queueConnection,
  defaultJobOptions
});

// Event Listeners for telemetry
const applicationEvents = new QueueEvents('rolevia-application-automation', { connection: queueConnection });

/**
 * Admission Control / Backpressure check:
 * Returns false if the queue backlog exceeds maximum safe buffer (e.g. 10,000 jobs).
 */
async function canAdmitJob(queueName = 'application', maxBacklog = 10000) {
  const queue = queueName === 'resume' ? resumeQueue : applicationQueue;
  const waitingCount = await queue.getWaitingCount();
  return waitingCount < maxBacklog;
}

/**
 * Enqueue an ATS Application Automation job with strict deduplication
 */
async function enqueueApplicationJob(payload, options = {}) {
  const { tenantId, userId, applicationId } = payload;
  const rawId = options.jobId || `app__${tenantId || 'global'}__${userId}__${applicationId}`;
  const jobId = rawId.replace(/:/g, '_');

  const admits = await canAdmitJob('application', options.maxBacklog || 10000);
  if (!admits) {
    throw new Error('QUEUE_BACKPRESSURE_OVERLOAD: Application queue backlog exceeds safe threshold');
  }

  const job = await applicationQueue.add('execute-ats-application', payload, {
    jobId,
    priority: options.priority || 5,
    ...options
  });

  return job;
}

/**
 * Enqueue a Resume Tailoring job with deduplication
 */
async function enqueueResumeJob(payload, options = {}) {
  const { tenantId, userId, targetJobId } = payload;
  const rawId = options.jobId || `resume__${tenantId || 'global'}__${userId}__${targetJobId || Date.now()}`;
  const jobId = rawId.replace(/:/g, '_');

  const admits = await canAdmitJob('resume', options.maxBacklog || 5000);
  if (!admits) {
    throw new Error('QUEUE_BACKPRESSURE_OVERLOAD: Resume queue backlog exceeds safe threshold');
  }

  const job = await resumeQueue.add('tailor-resume', payload, {
    jobId,
    priority: options.priority || 5,
    ...options
  });

  return job;
}

/**
 * Retrieve queue metrics for telemetry and monitoring
 */
async function getQueueMetrics() {
  const [appWaiting, appActive, appCompleted, appFailed] = await Promise.all([
    applicationQueue.getWaitingCount(),
    applicationQueue.getActiveCount(),
    applicationQueue.getCompletedCount(),
    applicationQueue.getFailedCount()
  ]);

  const [resumeWaiting, resumeActive, resumeCompleted, resumeFailed] = await Promise.all([
    resumeQueue.getWaitingCount(),
    resumeQueue.getActiveCount(),
    resumeQueue.getCompletedCount(),
    resumeQueue.getFailedCount()
  ]);

  return {
    applicationQueue: {
      waiting: appWaiting,
      active: appActive,
      completed: appCompleted,
      failed: appFailed
    },
    resumeQueue: {
      waiting: resumeWaiting,
      active: resumeActive,
      completed: resumeCompleted,
      failed: resumeFailed
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Graceful shutdown for queues and connections
 */
async function closeQueues() {
  await Promise.all([
    applicationQueue.close(),
    resumeQueue.close(),
    emailQueue.close(),
    applicationEvents.close()
  ]);
  await queueConnection.quit();
  await cacheConnection.quit();
}

module.exports = {
  queueConnection,
  cacheConnection,
  applicationQueue,
  resumeQueue,
  emailQueue,
  applicationEvents,
  canAdmitJob,
  enqueueApplicationJob,
  enqueueResumeJob,
  getQueueMetrics,
  closeQueues
};
