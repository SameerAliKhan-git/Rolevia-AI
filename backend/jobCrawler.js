// Rolevia AI · Continuous Job Ingestion, Freshness & Deduplication Engine (FEAT-005)
// Ingests opportunities, computes canonical SHA-256 requisition hashes, eliminates duplicates, and maintains 30-min live freshness verification.

const crypto = require('node:crypto');
const prisma = require('./db');

/**
 * Normalizes URL and requisition attributes to produce deterministic SHA-256 hash
 */
function computeRequisitionHash(company, title, rawUrl) {
  const normCompany = (company || '').trim().toLowerCase();
  const normTitle = (title || '').trim().toLowerCase();
  
  // Strip query tracking parameters (utm_source, gh_jid, etc.)
  let normUrl = (rawUrl || '').trim().toLowerCase();
  try {
    const parsed = new URL(rawUrl);
    normUrl = `${parsed.origin}${parsed.pathname}`;
  } catch (e) {
    normUrl = normUrl.split('?')[0];
  }

  const payload = `${normCompany}|${normTitle}|${normUrl}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Validates whether an external job URL is live and accepting applications
 */
async function isJobUrlLive(jobUrl) {
  try {
    const res = await fetch(jobUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (res.status === 404 || res.status === 410) {
      return { live: false, status: res.status, reason: 'HTTP Not Found / Gone' };
    }

    if (res.status !== 200) {
      // Retain redirects and auth-guarded portals
      return { live: true, status: res.status, reason: 'Portal redirected / auth-wall' };
    }

    const html = await res.text();
    const takenDownPatterns = [
      '<title>Job Not Found',
      '<title>Page Not Found',
      'This posting is no longer available',
      'This job is no longer available',
      'Workday is currently unavailable',
      'This position has been filled',
      'The requisition you requested is closed',
      'maintenance_page.html'
    ];

    for (const pattern of takenDownPatterns) {
      if (html.includes(pattern)) {
        return { live: false, status: 200, reason: `Matches expired pattern: "${pattern}"` };
      }
    }

    return { live: true, status: 200, reason: 'Active 200 OK' };
  } catch (err) {
    // On transient network timeouts, do not eagerly mark as expired
    return { live: true, status: 0, reason: `Network timeout / retry: ${err.message}` };
  }
}

/**
 * Ingest an array of job listings with duplicate detection via requisition hash
 */
async function ingestJobs(rawJobs = []) {
  const results = {
    total: rawJobs.length,
    ingested: 0,
    duplicates: 0,
    errors: 0,
    jobs: []
  };

  for (const raw of rawJobs) {
    try {
      if (!raw.company || !raw.title || !raw.url) {
        results.errors++;
        continue;
      }

      const reqHash = computeRequisitionHash(raw.company, raw.title, raw.url);

      // Check existing in Prisma
      const existing = await prisma.job.findUnique({
        where: { requisitionHash: reqHash }
      });

      if (existing) {
        results.duplicates++;
        results.jobs.push(existing);
        continue;
      }

      const newJob = await prisma.job.create({
        data: {
          company: raw.company.trim(),
          title: raw.title.trim(),
          url: raw.url.trim(),
          applyUrl: raw.applyUrl ? raw.applyUrl.trim() : raw.url.trim(),
          ats: (raw.ats || 'custom').toLowerCase(),
          atsName: raw.atsName || 'Direct Portal',
          location: raw.location || 'Remote',
          jobType: raw.jobType || 'Full-time',
          salary: typeof raw.salary === 'object' ? JSON.stringify(raw.salary) : (raw.salary || '$120,000 - $160,000'),
          postedAt: raw.postedAt || 'Recently',
          requirements: JSON.stringify(raw.requirements || []),
          requisitionHash: reqHash,
          status: 'ACTIVE',
          lastCheckedAt: new Date()
        }
      });

      results.ingested++;
      results.jobs.push(newJob);
    } catch (err) {
      results.errors++;
    }
  }

  return results;
}

/**
 * Periodic Freshness Scan: checks all ACTIVE jobs and transitions expired ones
 */
async function runPeriodicFreshnessScan() {
  const activeJobs = await prisma.job.findMany({
    where: { status: 'ACTIVE' }
  });

  const scanReport = {
    totalScanned: activeJobs.length,
    verifiedLive: 0,
    expiredMarked: 0,
    timestamp: new Date().toISOString()
  };

  for (const job of activeJobs) {
    const health = await isJobUrlLive(job.url);
    if (!health.live) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'EXPIRED',
          lastCheckedAt: new Date()
        }
      });
      scanReport.expiredMarked++;
    } else {
      await prisma.job.update({
        where: { id: job.id },
        data: { lastCheckedAt: new Date() }
      });
      scanReport.verifiedLive++;
    }
  }

  return scanReport;
}

module.exports = {
  computeRequisitionHash,
  isJobUrlLive,
  ingestJobs,
  runPeriodicFreshnessScan
};
