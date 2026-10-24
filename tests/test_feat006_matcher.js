// Rolevia AI · Automated Test Suite: FEAT-006 Explainable AI Job Matching
// Verifies:
// 1. Transparent multi-factor scoring (Skills 40%, Preferred 20%, Experience 25%, Domain 15%)
// 2. Tri-state eligibility: ELIGIBLE, INELIGIBLE, NEEDS_VERIFICATION
// 3. Sponsorship: Explicit denial -> INELIGIBLE, Missing/Unstated info -> NEEDS_VERIFICATION (Never auto-rejected!)
// 4. Degree equivalence: Master's/PhD satisfies Bachelor's requirements
// 5. Seniority cutoffs & location policy
// 6. Multi-tenant isolation at PostgreSQL query boundary

const assert = require('node:assert');
const jobMatcher = require('../backend/jobMatcher');
const prisma = require('../backend/db');

async function testFeat006JobMatcher() {
  console.log('\n--- [TEST SUITE 6] FEAT-006: Explainable AI Job Matching Engine ---');
  let testsPassed = 0;

  // =========================================================================
  // TEST 1: Highly Qualified Senior Candidate -> High Score & Strong Match
  // =========================================================================
  const seniorCandidate = {
    skills: JSON.stringify(['Node.js', 'PostgreSQL', 'Docker', 'Kubernetes', 'TypeScript', 'AWS']),
    yearsExperience: 6.5,
    needsSponsorship: false,
    targetRoles: 'Senior Backend Engineer, Systems Engineer',
    preferredLocations: JSON.stringify(['Remote', 'San Francisco']),
    education: 'Bachelor of Science in Computer Science'
  };

  const seniorJob = {
    title: 'Senior Backend Engineer',
    company: 'Stripe',
    requirements: JSON.stringify([
      '5+ years of experience with backend systems',
      'Proficiency in Node.js, TypeScript, and PostgreSQL',
      'Hands-on experience with Docker and Kubernetes is preferred',
      'Remote (US/Canada)'
    ]),
    location: 'Remote',
    jobType: 'Remote'
  };

  const matchSenior = jobMatcher.computeJobMatch(seniorCandidate, seniorJob);
  assert.strictEqual(matchSenior.eligibility.status, 'ELIGIBLE');
  assert.strictEqual(matchSenior.eligibility.passed, true, 'Senior candidate must pass eligibility');
  assert(matchSenior.compositeScore >= 85, `Senior match score must be >= 85, got ${matchSenior.compositeScore}`);
  assert.strictEqual(matchSenior.recommendation, 'STRONG_MATCH');
  assert.strictEqual(matchSenior.breakdown.requiredSkills.score, 40, 'Required skills should be 40/40');
  assert.strictEqual(matchSenior.breakdown.experienceAlignment.score, 25, 'Experience should be 25/25');
  assert(matchSenior.summaryReason.includes('Strong match'), 'Summary reason should identify strong fit');
  console.log(`✓ [MATCH 1/8] Highly qualified Senior profile: Score ${matchSenior.compositeScore}/100, status ELIGIBLE, STRONG_MATCH`);
  testsPassed++;

  // =========================================================================
  // TEST 2: Junior Candidate applied to Staff Role -> Seniority Ineligible
  // =========================================================================
  const juniorCandidate = {
    skills: JSON.stringify(['JavaScript', 'HTML', 'CSS']),
    yearsExperience: 1.0,
    needsSponsorship: false,
    targetRoles: 'Junior Web Developer',
    preferredLocations: JSON.stringify(['Remote']),
    education: 'Coding Bootcamp Certificate'
  };

  const staffJob = {
    title: 'Staff Distributed Systems Architect',
    company: 'Databricks',
    requirements: JSON.stringify([
      '8+ years of experience architecting large scale distributed systems',
      'Expertise in Go, Kubernetes, and Distributed Systems',
      'Remote'
    ]),
    location: 'Remote',
    jobType: 'Remote'
  };

  const matchStaff = jobMatcher.computeJobMatch(juniorCandidate, staffJob);
  assert.strictEqual(matchStaff.eligibility.status, 'INELIGIBLE');
  assert.strictEqual(matchStaff.eligibility.passed, false, 'Junior candidate must fail Staff role eligibility');
  assert(matchStaff.compositeScore <= 35, `Ineligible candidate score must be capped at 35, got ${matchStaff.compositeScore}`);
  assert.strictEqual(matchStaff.recommendation, 'NOT_RECOMMENDED');
  assert(matchStaff.eligibility.reasons.some(r => r.includes('Staff/Principal seniority')), 'Rejection reason must cite seniority cutoff');
  console.log(`✓ [MATCH 2/8] Seniority barrier: 1-yr candidate rejected from Staff position (score capped at ${matchStaff.compositeScore}/100)`);
  testsPassed++;

  // =========================================================================
  // TEST 3: Visa Sponsorship Hard Restriction -> INELIGIBLE
  // =========================================================================
  const sponsoredCandidate = {
    skills: JSON.stringify(['Node.js', 'PostgreSQL', 'Docker']),
    yearsExperience: 5.0,
    needsSponsorship: true,
    preferredLocations: JSON.stringify(['Remote'])
  };

  const noSponsorshipJob = {
    title: 'Senior Infrastructure Engineer',
    company: 'Defense Systems Corp',
    requirements: JSON.stringify([
      'Node.js and Docker required',
      'US Citizenship required due to ITAR compliance; cannot sponsor visas'
    ]),
    location: 'Remote',
    jobType: 'Remote'
  };

  const matchSponsorship = jobMatcher.computeJobMatch(sponsoredCandidate, noSponsorshipJob);
  assert.strictEqual(matchSponsorship.eligibility.status, 'INELIGIBLE');
  assert.strictEqual(matchSponsorship.eligibility.passed, false);
  assert.strictEqual(matchSponsorship.recommendation, 'NOT_RECOMMENDED');
  assert(matchSponsorship.eligibility.reasons.some(r => r.includes('visa sponsorship') || r.includes('citizenship')), 'Must explain visa mismatch');
  console.log(`✓ [MATCH 3/8] Sponsorship barrier: Explicit ITAR exclusion flags candidate INELIGIBLE`);
  testsPassed++;

  // =========================================================================
  // TEST 4: Visa Sponsorship UNSTATED -> NEEDS_VERIFICATION (Never Auto-Reject!)
  // =========================================================================
  const unstatedSponsorshipJob = {
    title: 'Senior Node.js Engineer',
    company: 'GrowthTech Startup',
    requirements: JSON.stringify([
      '5+ years experience',
      'Node.js and PostgreSQL required',
      'Remote'
    ]),
    location: 'Remote',
    jobType: 'Remote'
    // sponsorshipOffered NOT specified
  };

  const matchUnstated = jobMatcher.computeJobMatch(sponsoredCandidate, unstatedSponsorshipJob);
  assert.strictEqual(matchUnstated.eligibility.status, 'NEEDS_VERIFICATION', 'Unstated sponsorship MUST NOT auto-reject; must be NEEDS_VERIFICATION');
  assert.strictEqual(matchUnstated.eligibility.passed, true, 'NEEDS_VERIFICATION must remain actionable (passed: true)');
  assert(matchUnstated.compositeScore >= 60, `Score should reflect true qualifications without penalty, got ${matchUnstated.compositeScore}`);
  assert(matchUnstated.recommendation.includes('VERIFY_ELIGIBILITY'), 'Recommendation flags verification need');
  assert(matchUnstated.eligibility.details.sponsorship.status === 'NEEDS_VERIFICATION');
  console.log(`✓ [MATCH 4/8] Sponsorship grace: Missing employer sponsorship info marked NEEDS_VERIFICATION, score preserved (${matchUnstated.compositeScore}/100)`);
  testsPassed++;

  // =========================================================================
  // TEST 5: Degree Equivalence: Master's in CS satisfies Bachelor's requirement
  // =========================================================================
  const mastersCandidate = {
    skills: JSON.stringify(['Node.js', 'PostgreSQL', 'TypeScript']),
    yearsExperience: 5.0,
    needsSponsorship: false,
    targetRoles: 'Senior Backend Engineer',
    preferredLocations: JSON.stringify(['Remote']),
    education: 'M.S. in Computer Science & Distributed Systems'
  };

  const bachelorsJob = {
    title: 'Senior Backend Engineer',
    company: 'Fintech Corp',
    requirements: JSON.stringify([
      '5+ years experience',
      'Bachelor degree in Computer Science required',
      'Node.js and PostgreSQL required',
      'Remote'
    ]),
    location: 'Remote',
    jobType: 'Remote'
  };

  const matchMasters = jobMatcher.computeJobMatch(mastersCandidate, bachelorsJob);
  assert.strictEqual(matchMasters.eligibility.details.degree.status, 'ELIGIBLE');
  assert.strictEqual(matchMasters.breakdown.domainEducation.degreeEquivalenceSatisfied, true, 'Master degree must satisfy Bachelor requirement');
  assert.strictEqual(matchMasters.breakdown.domainEducation.score, 15, 'Should receive full domain and degree points');
  console.log(`✓ [MATCH 5/8] Degree Equivalence: Master's candidate satisfies Bachelor's requirement (15/15 domain points)`);
  testsPassed++;

  // =========================================================================
  // TEST 6: Strict Onsite Geographic Location Mismatch -> INELIGIBLE
  // =========================================================================
  const sfCandidate = {
    skills: JSON.stringify(['Python', 'AWS']),
    yearsExperience: 4.0,
    needsSponsorship: false,
    preferredLocations: JSON.stringify(['San Francisco, CA'])
  };

  const tokyoOnsiteJob = {
    title: 'Site Reliability Engineer',
    company: 'Tokyo Financial',
    requirements: JSON.stringify(['Python, AWS']),
    location: 'Tokyo, Japan',
    jobType: 'Full-time Onsite'
  };

  const matchLocation = jobMatcher.computeJobMatch(sfCandidate, tokyoOnsiteJob);
  assert.strictEqual(matchLocation.eligibility.status, 'INELIGIBLE', 'Candidate in SF must fail strictly Onsite Tokyo role');
  assert(matchLocation.eligibility.reasons.some(r => r.includes('Tokyo, Japan')), 'Reason must cite location mismatch');
  console.log(`✓ [MATCH 6/8] Geographic gate: Onsite Tokyo role rejected for remote SF-only candidate`);
  testsPassed++;

  // =========================================================================
  // TEST 7: Explainability Telemetry & Mathematical Integrity
  // =========================================================================
  const midCandidate = {
    skills: JSON.stringify(['Node.js', 'PostgreSQL']),
    yearsExperience: 3.5,
    needsSponsorship: false,
    preferredLocations: JSON.stringify(['Remote'])
  };

  const midJob = {
    title: 'Backend Engineer',
    company: 'MidScale',
    requirements: JSON.stringify([
      '3+ years experience',
      'Node.js and PostgreSQL required',
      'Docker is preferred',
      'Remote'
    ]),
    location: 'Remote',
    jobType: 'Remote'
  };

  const matchTelemetry = jobMatcher.computeJobMatch(midCandidate, midJob);
  const bd = matchTelemetry.breakdown;
  const computedSum = Math.round(bd.requiredSkills.score + bd.preferredSkills.score + bd.experienceAlignment.score + bd.domainEducation.score);
  assert.strictEqual(matchTelemetry.compositeScore, computedSum, 'Composite score must exactly equal sum of component scores');
  assert(bd.requiredSkills.matched.includes('node.js') && bd.requiredSkills.matched.includes('postgresql'));
  assert(bd.preferredSkills.missing.includes('docker'));
  console.log(`✓ [MATCH 7/8] Explainability Telemetry: All components mathematically balanced (Sum: ${computedSum} = Score: ${matchTelemetry.compositeScore})`);
  testsPassed++;

  // =========================================================================
  // TEST 8: Database Integration & Multi-Tenant Boundary Enforcement
  // =========================================================================
  const testTenant = await prisma.tenant.create({
    data: { name: 'Matcher Test Tenant', subdomain: `matcher-${Date.now()}` }
  });

  const testUser = await prisma.user.create({
    data: {
      tenantId: testTenant.id,
      email: `matcher_${Date.now()}@test.com`,
      passwordHash: '$2a$10$samplehash',
      name: 'Matcher Candidate',
      credits: 20
    }
  });

  const testProfile = await prisma.candidateProfile.create({
    data: {
      userId: testUser.id,
      skills: JSON.stringify(['Go', 'Kubernetes', 'Docker', 'Distributed Systems', 'PostgreSQL']),
      certifications: '[]',
      targetRoles: JSON.stringify(['Senior Systems Engineer']),
      preferredLocations: JSON.stringify(['Remote']),
      needsSponsorship: false,
      education: 'B.S. in Computer Engineering',
      atsReadinessScore: 95
    }
  });

  const jobHigh = await prisma.job.create({
    data: {
      company: 'HighMatch Systems',
      title: 'Senior Systems Engineer',
      url: `https://test.com/job-high-${Date.now()}`,
      ats: 'greenhouse',
      atsName: 'Greenhouse',
      location: 'Remote',
      requirements: JSON.stringify(['5+ years experience', 'Go, Kubernetes, Distributed Systems required', 'Remote']),
      requisitionHash: `hash-high-${Date.now()}`,
      status: 'ACTIVE'
    }
  });

  const jobLow = await prisma.job.create({
    data: {
      company: 'LowMatch Marketing',
      title: 'Junior Copywriter & SEO Specialist',
      url: `https://test.com/job-low-${Date.now()}`,
      ats: 'lever',
      atsName: 'Lever',
      location: 'Remote',
      requirements: JSON.stringify(['SEO, Copywriting, Marketing']),
      requisitionHash: `hash-low-${Date.now()}`,
      status: 'ACTIVE'
    }
  });

  // 8A. Authorized matching within tenant
  const rankedResults = await jobMatcher.matchCandidateAgainstJobs(testProfile.id, { limit: 100, tenantId: testTenant.id });
  assert(rankedResults.length >= 2, 'Should return at least 2 ranked jobs');
  
  const highResult = rankedResults.find(r => r.job.id === jobHigh.id);
  const lowResult = rankedResults.find(r => r.job.id === jobLow.id);

  assert(highResult, 'High match job must be in results');
  assert(lowResult, 'Low match job must be in results');
  assert(highResult.compositeScore > lowResult.compositeScore, `High match score (${highResult.compositeScore}) must exceed low match (${lowResult.compositeScore})`);

  // 8B. Cross-Tenant isolation check (prohibits foreign tenant access)
  let tenantViolationCaught = false;
  try {
    await jobMatcher.matchCandidateAgainstJobs(testProfile.id, { tenantId: 'rogue-tenant-999' });
  } catch (err) {
    tenantViolationCaught = true;
    assert(err.message.includes('Tenant boundary violation'));
  }
  assert.strictEqual(tenantViolationCaught, true, 'Cross-tenant candidate profile matching must be blocked');

  // Clean up test data
  await prisma.job.delete({ where: { id: jobHigh.id } });
  await prisma.job.delete({ where: { id: jobLow.id } });
  await prisma.tenant.delete({ where: { id: testTenant.id } });

  console.log(`✓ [MATCH 8/8] Database & Security: Multi-tenant boundary enforced (cross-tenant rejected); jobs ranked by score`);
  testsPassed++;

  console.log(`>> [PASS] FEAT-006: All ${testsPassed} Explainable AI Job Matching tests passed.`);
  return {
    suite: 'FEAT-006: Explainable AI Job Matching',
    passed: testsPassed,
    failed: 0,
    category: 'Unit'
  };
}

if (require.main === module) {
  testFeat006JobMatcher()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('>> [FAIL] FEAT-006 Test Failure:', err);
      process.exit(1);
    });
}

module.exports = testFeat006JobMatcher;
