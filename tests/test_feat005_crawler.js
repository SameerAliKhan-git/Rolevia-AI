// Rolevia AI · Automated Test Suite: FEAT-005 (Job Ingestion, Freshness & Deduplication)
// Verifies SHA-256 requisition hashing, query parameter stripping, deduplication, and URL freshness validation.

const assert = require('node:assert');
const jobCrawler = require('../backend/jobCrawler');
const prisma = require('../backend/db');

async function testFeat005Crawler() {
  console.log('\n--- [TEST SUITE 5] FEAT-005: Job Ingestion & Deduplication ---');

  // 1. Requisition Hash Determinism & Query Param Stripping
  const urlWithParams = 'https://jobs.ashbyhq.com/openai/240d459b?utm_source=linkedin&gh_jid=99281';
  const cleanUrl = 'https://jobs.ashbyhq.com/openai/240d459b';
  
  const hash1 = jobCrawler.computeRequisitionHash('OpenAI', 'Research Engineer', urlWithParams);
  const hash2 = jobCrawler.computeRequisitionHash('openai', 'research engineer', cleanUrl);
  assert.strictEqual(hash1, hash2, 'Requisition hashes must be invariant to casing and query parameters');
  assert.strictEqual(hash1.length, 64, 'SHA-256 hash must be 64 hexadecimal characters');
  console.log('✓ Normalization: Deterministic SHA-256 requisition hash verified with tracking param stripping');

  // 2. Duplicate Ingestion Prevention
  const uniqueCompany = `TestCompany_${Date.now()}`;
  const batchJobs = [
    {
      company: uniqueCompany,
      title: 'Distributed Systems Engineer',
      url: `https://jobs.lever.co/${uniqueCompany.toLowerCase()}/pos-1`,
      ats: 'lever',
      atsName: 'Lever',
      location: 'Remote',
      salary: '$140k - $180k',
      requirements: ['Go', 'Kubernetes']
    },
    {
      // Exact duplicate
      company: uniqueCompany,
      title: 'Distributed Systems Engineer',
      url: `https://jobs.lever.co/${uniqueCompany.toLowerCase()}/pos-1?ref=jobboard`,
      ats: 'lever',
      atsName: 'Lever',
      location: 'Remote',
      salary: '$140k - $180k',
      requirements: ['Go', 'Kubernetes']
    }
  ];

  const ingestResult = await jobCrawler.ingestJobs(batchJobs);
  assert.strictEqual(ingestResult.total, 2, 'Total submitted jobs: 2');
  assert.strictEqual(ingestResult.ingested, 1, 'Exactly 1 unique job ingested');
  assert.strictEqual(ingestResult.duplicates, 1, 'Exactly 1 duplicate identified and deduplicated');
  console.log('✓ Deduplication: Duplicate job posting caught by unique requisitionHash constraint');

  // 3. Live URL Health Verification (using local server 404 route)
  const liveCheck = await jobCrawler.isJobUrlLive('http://localhost:3000/non-existent-job-404-check');
  assert.strictEqual(liveCheck.live, false, '404 URL must be reported as not live');
  assert.strictEqual(liveCheck.status, 404, 'Status code 404 captured');
  console.log('✓ Health Check: Dead external links (HTTP 404) correctly flagged');

  // 4. Periodic Freshness Scan in Prisma
  const scanReport = await jobCrawler.runPeriodicFreshnessScan();
  assert(scanReport.totalScanned >= 10, 'Freshness scan should inspect all active database postings');
  assert(typeof scanReport.verifiedLive === 'number', 'Verified live count should be a number');
  console.log(`✓ Freshness Scan: Scanned ${scanReport.totalScanned} opportunities (${scanReport.verifiedLive} verified live, ${scanReport.expiredMarked} expired)`);

  console.log('>> [PASS] FEAT-005: Job ingestion, freshness, and deduplication verified.');
  return { suite: 'FEAT-005 Job Ingestion & Freshness', passed: 4, failed: 0 };
}

if (require.main === module) {
  testFeat005Crawler()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('>> [FAIL] FEAT-005 Test Failure:', err);
      process.exit(1);
    });
}

module.exports = testFeat005Crawler;
