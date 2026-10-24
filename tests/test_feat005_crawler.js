// Rolevia AI · Automated Test Suite: FEAT-005 (Multi-Source Job Ingestion, Freshness & Deduplication)
// Verifies SHA-256 requisition hashing, query parameter stripping, multi-source ATS normalizers
// (Greenhouse, Ashby, Lever), deduplication against PostgreSQL, and URL freshness scanning.

const assert = require('node:assert');
const http = require('node:http');
const jobCrawler = require('../backend/jobCrawler');
const prisma = require('../backend/db');

async function testFeat005Crawler() {
  console.log('\n--- [TEST SUITE 5] FEAT-005: Multi-Source Job Discovery & Deduplication ---');
  let testsPassed = 0;

  // 1. Requisition Hash Determinism & Tracking Param Stripping
  const urlWithParams = 'https://jobs.ashbyhq.com/openai/240d459b?utm_source=linkedin&gh_jid=99281&ref=candidate_portal';
  const cleanUrl = 'https://jobs.ashbyhq.com/openai/240d459b';
  
  const hash1 = jobCrawler.computeRequisitionHash('OpenAI', 'Research Engineer', urlWithParams);
  const hash2 = jobCrawler.computeRequisitionHash('  openai  ', 'research engineer', cleanUrl);
  assert.strictEqual(hash1, hash2, 'Requisition hashes must be invariant to casing, whitespace, and query parameters');
  assert.strictEqual(hash1.length, 64, 'SHA-256 hash must be 64 hexadecimal characters');
  console.log('✓ [NORMALIZATION] SHA-256 Requisition Hash: Invariant to query tracking params and casing');
  testsPassed++;

  // 2. Multi-Source ATS Feed Normalization (Greenhouse, Ashby, Lever)
  // A. Greenhouse
  const ghSample = {
    id: 991823,
    title: 'Senior Distributed Systems Engineer',
    absolute_url: 'https://boards.greenhouse.io/databricks/jobs/991823',
    location: { name: 'San Francisco, CA' },
    employment_type: 'Full-time',
    salary: '$180k - $240k',
    departments: [{ name: 'Core Infrastructure' }]
  };
  const normGH = jobCrawler.normalizeGreenhouseJob('Databricks', ghSample);
  assert.strictEqual(normGH.ats, 'greenhouse', 'ATS type greenhouse');
  assert.strictEqual(normGH.company, 'Databricks', 'Company match');
  assert.strictEqual(normGH.location, 'San Francisco, CA', 'Location match');

  // B. Ashby
  const ashbySample = {
    id: 'ashby-7712',
    title: 'Backend Infrastructure Engineer',
    jobUrl: 'https://jobs.ashbyhq.com/retool/ashby-7712',
    location: { name: 'Remote, US' },
    employmentType: 'Full-time',
    department: 'Platform'
  };
  const normAshby = jobCrawler.normalizeAshbyJob('Retool', ashbySample);
  assert.strictEqual(normAshby.ats, 'ashby', 'ATS type ashby');
  assert.strictEqual(normAshby.title, 'Backend Infrastructure Engineer', 'Title match');

  // C. Lever
  const leverSample = {
    id: 'lever-5510',
    text: 'Site Reliability Architect',
    hostedUrl: 'https://jobs.lever.co/figma/lever-5510',
    categories: { location: 'New York, NY', commitment: 'Full-time', team: 'Production Engineering' }
  };
  const normLever = jobCrawler.normalizeLeverJob('Figma', leverSample);
  assert.strictEqual(normLever.ats, 'lever', 'ATS type lever');
  assert.strictEqual(normLever.title, 'Site Reliability Architect', 'Title match');
  console.log('✓ [NORMALIZATION] Multi-Source Feeds: Greenhouse, Ashby, and Lever feeds normalized');
  testsPassed++;

  // 3. Multi-Source Ingestion & Deduplication in PostgreSQL
  const batchId = Date.now();
  const testAtsFeed = {
    jobs: [
      {
        id: `gh-${batchId}-1`,
        title: 'Cloud Security Engineer',
        absolute_url: `https://boards.greenhouse.io/stripe/jobs/sec-${batchId}`,
        location: { name: 'Seattle, WA' },
        employment_type: 'Full-time'
      },
      {
        // Duplicate posting with added query params
        id: `gh-${batchId}-1-dup`,
        title: 'Cloud Security Engineer',
        absolute_url: `https://boards.greenhouse.io/stripe/jobs/sec-${batchId}?utm_campaign=spring2026`,
        location: { name: 'Seattle, WA' },
        employment_type: 'Full-time'
      }
    ]
  };

  const feedIngest = await jobCrawler.ingestAtsFeed({
    ats: 'greenhouse',
    company: `Stripe-${batchId}`,
    feedData: testAtsFeed
  });

  assert.strictEqual(feedIngest.total, 2, 'Total submitted jobs: 2');
  assert.strictEqual(feedIngest.ingested, 1, 'Exactly 1 unique job ingested');
  assert.strictEqual(feedIngest.duplicates, 1, 'Exactly 1 duplicate identified and deduplicated');
  console.log('✓ [DEDUPLICATION] Multi-Portal Ingestion: Duplicate job caught via unique requisitionHash in PostgreSQL');
  testsPassed++;

  // 4. Live URL Health Verification (Mock Local HTTP Server)
  const mockServer = http.createServer((req, res) => {
    if (req.url === '/live-job') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><head><title>Senior Engineer - Active Posting</title></head><body>Apply Now</body></html>');
    } else if (req.url === '/expired-job-404') {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<html><head><title>Job Not Found</title></head><body>This job is no longer available</body></html>');
    } else if (req.url === '/taken-down-200') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>This posting is no longer available. Please check other roles.</body></html>');
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const serverPort = mockServer.address().port;
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  try {
    // Check Active 200
    const activeCheck = await jobCrawler.isJobUrlLive(`${baseUrl}/live-job`);
    assert.strictEqual(activeCheck.live, true, 'Active job URL must be reported live');
    assert.strictEqual(activeCheck.status, 200, 'Status code 200');

    // Check Dead 404
    const deadCheck = await jobCrawler.isJobUrlLive(`${baseUrl}/expired-job-404`);
    assert.strictEqual(deadCheck.live, false, '404 URL must be reported as not live');
    assert.strictEqual(deadCheck.status, 404, 'Status code 404');

    // Check Taken Down Pattern on HTTP 200
    const takenDownCheck = await jobCrawler.isJobUrlLive(`${baseUrl}/taken-down-200`);
    assert.strictEqual(takenDownCheck.live, false, 'Taken-down job pattern on HTTP 200 must be marked expired');
    console.log('✓ [FRESHNESS] Health Verification: HTTP 200 active, HTTP 404 dead, and taken-down patterns verified');
    testsPassed++;
  } finally {
    mockServer.close();
  }

  // 5. Periodic Freshness Scan in PostgreSQL
  const scanReport = await jobCrawler.runPeriodicFreshnessScan();
  assert(scanReport.totalScanned >= 10, 'Freshness scan should inspect all active database postings');
  assert(typeof scanReport.verifiedLive === 'number', 'Verified live count should be a number');
  console.log(`✓ [DB] Freshness Scan: Evaluated ${scanReport.totalScanned} opportunities (${scanReport.verifiedLive} active, ${scanReport.expiredMarked} expired)`);
  testsPassed++;

  // 6. Scheduled Job Ingestion Engine: Cycle Execution
  const engine = new jobCrawler.ScheduledJobIngestionEngine();
  const sampleFeeds = [
    {
      ats: 'lever',
      company: `SchedLever_${Date.now()}`,
      feedData: {
        postings: [
          { id: `sched-${Date.now()}`, text: 'SRE Lead', hostedUrl: 'https://jobs.lever.co/sched/1' }
        ]
      }
    }
  ];

  const cycleReport = await engine.runCycle(sampleFeeds);
  assert.strictEqual(cycleReport.cycleNumber, 1, 'Cycle number must be 1');
  assert.strictEqual(cycleReport.feedsProcessed, 1, '1 feed processed in cycle');
  assert.strictEqual(cycleReport.ingested, 1, '1 job ingested during scheduled cycle');
  assert(cycleReport.freshness !== null, 'Scheduled cycle must include freshness scan');
  console.log('✓ [SCHEDULER] Scheduled Engine: Cycle execution completed (ingestion + deduplication + freshness sweep)');
  testsPassed++;

  // 7. ATS Source Capabilities Matrix (Explicit Workday Incomplete Identification)
  const status = engine.getStatus();
  assert(status.supportedSources.includes('greenhouse'), 'Greenhouse must be marked SUPPORTED');
  assert(status.supportedSources.includes('ashby'), 'Ashby must be marked SUPPORTED');
  assert(status.supportedSources.includes('lever'), 'Lever must be marked SUPPORTED');
  assert(status.incompleteSources.includes('workday'), 'Workday must be explicitly identified in incompleteSources');
  
  const workdayCap = status.capabilities.workday;
  assert.strictEqual(workdayCap.status, 'INCOMPLETE_PLANNED_RELEASE_0_2', 'Workday status must be INCOMPLETE_PLANNED_RELEASE_0_2');
  assert(workdayCap.limitationNote.includes('Release 0.2'), 'Workday limitation note must explain deferral to Release 0.2 browser automation');
  console.log('✓ [CAPABILITY] ATS Matrix: Greenhouse/Ashby/Lever supported; Workday explicitly documented as incomplete (Release 0.2 scope)');
  testsPassed++;

  console.log(`>> [PASS] FEAT-005: All ${testsPassed} job discovery & deduplication tests passed.`);
  return {
    suite: 'FEAT-005 Job Ingestion & Freshness Scan',
    passed: testsPassed,
    failed: 0,
    category: 'Integration'
  };
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
