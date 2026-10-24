// Rolevia AI · Automated Test Suite: FEAT-007 Truth-Grounded Resume & Cover Letter Optimization
// Verifies:
// 1. Truth-grounded resume generation from verified FactStore facts.
// 2. Zero-Hallucination Assertion: Injected ungrounded skills or metrics throw HallucinationViolationError.
// 3. High ATS Readability: Generated linear resume achieves >= 90/100 ATS readiness score.
// 4. Job-Aligned Cover Letter: Formulates tailored cover letter referencing verified accomplishments.
// 5. Database Integration & Multi-Tenant Isolation: Cross-tenant access throws tenant boundary violation.

const assert = require('node:assert');
const resumeOptimizer = require('../backend/resumeOptimizer');
const prisma = require('../backend/db');

async function testFeat007Optimizer() {
  console.log('\n--- [TEST SUITE 7] FEAT-007: Truth-Grounded Resume & Cover Letter Optimizer ---');
  let testsPassed = 0;

  // Mock candidate profile with verified facts
  const candidateProfile = {
    id: 'prof-test-feat007',
    userId: 'user-test-feat007',
    user: {
      id: 'user-test-feat007',
      name: 'Alex Rivera',
      email: 'alex.rivera@example.com',
      phone: '+1 (555) 349-2810',
      location: 'San Francisco, CA',
      linkedin: 'https://linkedin.com/in/alex-rivera-tech',
      github: 'https://github.com/alexrivera-eng',
      roleTitle: 'Senior Backend Engineer',
      yearsExp: 6
    },
    skills: JSON.stringify(['Node.js', 'PostgreSQL', 'Docker', 'AWS', 'TypeScript', 'Redis']),
    rawResumeText: 'Experienced Senior Backend Engineer proficient in Node.js, PostgreSQL, Docker, AWS, TypeScript.',
    atsReadinessScore: 95
  };

  const verifiedFacts = [
    {
      factType: 'WORK_EXPERIENCE',
      title: 'Senior Backend Engineer',
      organization: 'CloudScale Technologies',
      startDate: '2021',
      endDate: 'Present',
      highlights: JSON.stringify([
        'Architected high-throughput microservices using Node.js, TypeScript, and PostgreSQL serving 10M DAU',
        'Optimized database queries and connection pooling, achieving 40% latency reduction',
        'Deployed containerized infrastructure on AWS ECS with Docker, maintaining 99.99% uptime'
      ]),
      metrics: '40% latency reduction; 10M DAU; 99.99% uptime',
      verified: true
    },
    {
      factType: 'WORK_EXPERIENCE',
      title: 'Software Engineer',
      organization: 'FinTech Core',
      startDate: '2018',
      endDate: '2021',
      highlights: JSON.stringify([
        'Engineered payment processing pipeline handling $2M daily transactional volume',
        'Implemented distributed Redis caching, reducing database load by 35%'
      ]),
      metrics: '$2M daily volume; 35% load reduction',
      verified: true
    },
    {
      factType: 'EDUCATION',
      title: 'Bachelor of Science in Computer Science',
      organization: 'University of California, Berkeley',
      startDate: '2014',
      endDate: '2018',
      highlights: JSON.stringify([
        'Graduated with Honors, GPA 3.85/4.0',
        'Coursework in Distributed Systems, Operating Systems, and Advanced Algorithms'
      ]),
      verified: true
    }
  ];

  const targetJob = {
    id: 'job-stripe-backend',
    company: 'Stripe',
    title: 'Senior Backend Engineer - Financial Infrastructure',
    location: 'Remote (US)',
    requirements: JSON.stringify([
      '5+ years building distributed backend infrastructure with Node.js and TypeScript',
      'Extensive hands-on experience with PostgreSQL and database performance optimization',
      'Experience with AWS, Docker, and caching solutions like Redis',
      'Proven track record of operating high-availability, low-latency microservices'
    ])
  };

  // =========================================================================
  // TEST 1: Truth-Grounded Optimization from Verified Facts
  // =========================================================================
  const result = resumeOptimizer.optimizeResumeAndCoverLetter({
    candidateProfile,
    verifiedFacts,
    job: targetJob
  });

  assert(result.success, 'Optimization result must be successful');
  assert(result.optimizedResume.markdown.includes('Alex Rivera'), 'Must include candidate name');
  assert(result.optimizedResume.markdown.includes('PROFESSIONAL SUMMARY'), 'Must include Professional Summary header');
  assert(result.optimizedResume.markdown.includes('TECHNICAL SKILLS'), 'Must include Technical Skills header');
  assert(result.optimizedResume.markdown.includes('WORK EXPERIENCE'), 'Must include Work Experience header');
  assert(result.optimizedResume.markdown.includes('EDUCATION'), 'Must include Education header');

  // Verify skill prioritization: matching skills must appear in jobAligned list
  const matchingSkills = result.optimizedResume.sections.technicalSkills.jobAligned;
  assert(matchingSkills.includes('Node.js'), 'Node.js must be a job-aligned skill');
  assert(matchingSkills.includes('PostgreSQL'), 'PostgreSQL must be a job-aligned skill');
  assert(matchingSkills.includes('TypeScript'), 'TypeScript must be a job-aligned skill');

  // Verify that bullet points contain verified metrics
  const expSection = result.optimizedResume.sections.workExperience;
  assert(expSection[0].highlights[0].includes('Node.js') || expSection[0].highlights[0].includes('10M DAU'),
    'Top highlight should feature matched skills and scale');

  console.log(`✓ [OPTIMIZER 1/6] Grounded resume generation: Created structured markdown with job-aligned skills (${matchingSkills.join(', ')})`);
  testsPassed++;

  // =========================================================================
  // TEST 2: Zero-Hallucination Assertion - Rejection of Injected Ungrounded Skill
  // =========================================================================
  let skillHallucinationCaught = false;
  try {
    resumeOptimizer.optimizeResumeAndCoverLetter({
      candidateProfile,
      verifiedFacts,
      job: targetJob,
      options: {
        injectedHallucination: { skill: 'Solidity' } // Candidate has never used Solidity
      }
    });
  } catch (err) {
    if (err instanceof resumeOptimizer.HallucinationViolationError || err.name === 'HallucinationViolationError') {
      skillHallucinationCaught = true;
      assert(err.violations.some(v => v.claim.toLowerCase().includes('solidity') || v.type === 'UNGROUNDED_SKILL'),
        'Violation must specifically identify ungrounded skill');
    }
  }
  assert(skillHallucinationCaught, 'Zero-Hallucination engine must throw HallucinationViolationError on ungrounded skill');
  console.log('✓ [OPTIMIZER 2/6] Anti-hallucination defense: Injected ungrounded skill ("Solidity") successfully caught and rejected');
  testsPassed++;

  // =========================================================================
  // TEST 3: Zero-Hallucination Assertion - Rejection of Injected Ungrounded Metric
  // =========================================================================
  let metricHallucinationCaught = false;
  try {
    // Audit a text block containing an invented metric
    const auditBundle = {
      verifiedSkills: ['Node.js', 'PostgreSQL', 'Docker', 'AWS'],
      verifiedOrganizations: ['CloudScale Technologies'],
      verifiedMetrics: ['40% latency reduction', '10M DAU'],
      rawFactText: 'Node.js PostgreSQL CloudScale Technologies 40% latency reduction 10M DAU'
    };
    const tamperedText = 'Architected cloud systems achieving 950% user growth and generated $15M revenue';
    resumeOptimizer.verifyTruthGrounding(tamperedText, auditBundle);
  } catch (err) {
    if (err instanceof resumeOptimizer.HallucinationViolationError || err.name === 'HallucinationViolationError') {
      metricHallucinationCaught = true;
      assert(err.violations.some(v => v.type === 'UNGROUNDED_METRIC'), 'Must flag ungrounded metric');
    }
  }
  assert(metricHallucinationCaught, 'Zero-Hallucination engine must throw HallucinationViolationError on fabricated metrics');
  console.log('✓ [OPTIMIZER 3/6] Anti-hallucination defense: Fabricated metrics ("950%", "$15M") caught and rejected');
  testsPassed++;

  // =========================================================================
  // TEST 4: ATS Readability Maximization (Score >= 90/100)
  // =========================================================================
  const atsScore = result.optimizedResume.atsScore;
  assert(atsScore >= 90, `ATS Readability score must be >= 90, got ${atsScore}`);
  assert.strictEqual(result.optimizedResume.grade, 'A+', 'Grade must be A+');
  assert(result.optimizedResume.wordCount >= 200, 'Word count must be >= 200 for healthy ATS readability');
  console.log(`✓ [OPTIMIZER 4/6] ATS Readability Maximization: Score ${atsScore}/100 (Grade ${result.optimizedResume.grade}, ${result.optimizedResume.wordCount} words)`);
  testsPassed++;

  // =========================================================================
  // TEST 5: Job-Aligned Cover Letter Generation
  // =========================================================================
  const cl = result.coverLetter;
  assert(cl.recipient === 'Stripe', 'Cover letter must address target employer');
  assert(cl.role.includes('Senior Backend Engineer'), 'Cover letter must reference target role');
  assert(cl.text.includes('Dear Hiring Team at Stripe'), 'Cover letter must include formal salutation');
  assert(cl.text.includes('CloudScale Technologies'), 'Cover letter must cite verified employer');
  assert(cl.text.includes('Node.js'), 'Cover letter must cite verified matching skill');
  assert(result.auditReport.isGrounded === true, 'Audit report must confirm 100% truth grounding');
  console.log(`✓ [OPTIMIZER 5/6] Cover Letter Verification: Formulated job-tailored letter for ${cl.recipient} with 0 ungrounded claims`);
  testsPassed++;

  // =========================================================================
  // TEST 6: PostgreSQL Database Integration & Multi-Tenant Boundary Guard
  // =========================================================================
  // Find or create test tenants, users, and candidate profile in PostgreSQL
  let dbTestPassed = false;
  try {
    const tenantA = await prisma.tenant.upsert({
      where: { subdomain: 'alpha-corp' },
      update: {},
      create: { name: 'Alpha Corp', subdomain: 'alpha-corp' }
    });

    const tenantB = await prisma.tenant.upsert({
      where: { subdomain: 'beta-corp' },
      update: {},
      create: { name: 'Beta Corp', subdomain: 'beta-corp' }
    });

    const dbUserA = await prisma.user.upsert({
      where: { email: 'alex.rivera.feat007@test.com' },
      update: { tenantId: tenantA.id },
      create: {
        tenantId: tenantA.id,
        email: 'alex.rivera.feat007@test.com',
        name: 'Alex Rivera',
        phone: '+1 (555) 349-2810',
        location: 'San Francisco, CA',
        linkedin: 'https://linkedin.com/in/alex-rivera-tech',
        github: 'https://github.com/alexrivera-eng',
        passwordHash: 'dummyhash',
        roleTitle: 'Senior Backend Engineer',
        yearsExp: 6,
        credits: 50
      }
    });

    const dbProfileA = await prisma.candidateProfile.upsert({
      where: { userId: dbUserA.id },
      update: {
        skills: JSON.stringify(['Node.js', 'PostgreSQL', 'Docker', 'AWS', 'TypeScript', 'Redis'])
      },
      create: {
        userId: dbUserA.id,
        skills: JSON.stringify(['Node.js', 'PostgreSQL', 'Docker', 'AWS', 'TypeScript', 'Redis']),
        certifications: JSON.stringify([]),
        targetRoles: JSON.stringify(['Senior Backend Engineer']),
        preferredLocations: JSON.stringify(['Remote']),
        atsReadinessScore: 95
      }
    });

    // Populate verified FactStore records
    await prisma.factStore.deleteMany({ where: { candidateProfileId: dbProfileA.id } });
    await prisma.factStore.create({
      data: {
        candidateProfileId: dbProfileA.id,
        factType: 'WORK_EXPERIENCE',
        title: 'Senior Backend Engineer',
        organization: 'CloudScale Technologies',
        startDate: '2021',
        endDate: 'Present',
        highlights: JSON.stringify([
          'Architected high-throughput microservices using Node.js and PostgreSQL serving 10M DAU',
          'Optimized database queries and connection pooling, achieving 40% latency reduction',
          'Deployed containerized infrastructure on AWS ECS with Docker, maintaining 99.99% uptime'
        ]),
        metrics: '40% latency reduction; 10M DAU; 99.99% uptime',
        verified: true,
        confidence: 0.98
      }
    });

    await prisma.factStore.create({
      data: {
        candidateProfileId: dbProfileA.id,
        factType: 'WORK_EXPERIENCE',
        title: 'Software Engineer',
        organization: 'FinTech Core',
        startDate: '2018',
        endDate: '2021',
        highlights: JSON.stringify([
          'Engineered payment processing pipeline handling $2M daily transactional volume',
          'Implemented distributed Redis caching, reducing database load by 35%'
        ]),
        metrics: '$2M daily volume; 35% load reduction',
        verified: true,
        confidence: 0.98
      }
    });

    await prisma.factStore.create({
      data: {
        candidateProfileId: dbProfileA.id,
        factType: 'EDUCATION',
        title: 'Bachelor of Science in Computer Science',
        organization: 'University of California, Berkeley',
        startDate: '2016',
        endDate: '2020',
        highlights: JSON.stringify([
          'Graduated with Honors, GPA 3.8/4.0',
          'Comprehensive coursework in Software Engineering, Database Systems, and Computer Architecture'
        ]),
        verified: true,
        confidence: 0.98
      }
    });

    // Fetch an existing job or create a test opportunity
    const dbJob = await prisma.job.findFirst({ where: { status: 'ACTIVE' } });
    assert(dbJob, 'Active job must exist in database');

    // 6A: Successful execution within tenant boundary
    const dbResult = await resumeOptimizer.optimizeForJob({
      candidateProfileId: dbProfileA.id,
      jobId: dbJob.id,
      callerTenantId: tenantA.id
    });
    assert(dbResult.success, 'Database-backed optimization must succeed');
    assert(dbResult.optimizedResume.atsScore >= 90, 'Database-backed resume must score >= 90');

    // 6B: Cross-tenant boundary rejection
    let crossTenantBlocked = false;
    try {
      await resumeOptimizer.optimizeForJob({
        candidateProfileId: dbProfileA.id,
        jobId: dbJob.id,
        callerTenantId: tenantB.id // Tenant B attempting to access Tenant A's candidate facts
      });
    } catch (crossErr) {
      if (crossErr.message.includes('Tenant boundary violation')) {
        crossTenantBlocked = true;
      }
    }
    assert(crossTenantBlocked, 'Cross-tenant candidate fact access must be strictly rejected');
    dbTestPassed = true;
  } catch (err) {
    console.error('Database integration test error:', err);
    throw err;
  }

  assert(dbTestPassed, 'Database integration and tenant isolation must pass');
  console.log('✓ [OPTIMIZER 6/6] Database & Multi-Tenant Integration: Ingested PostgreSQL facts, verified cross-tenant isolation');
  testsPassed++;

  console.log(`>> [PASS] FEAT-007: All ${testsPassed} Truth-Grounded Optimizer tests passed.`);
  return {
    suite: 'FEAT-007: Truth-Grounded Optimizer',
    passed: testsPassed,
    failed: 0,
    category: 'Integration'
  };
}

if (require.main === module) {
  testFeat007Optimizer()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Test execution failed:', err);
      process.exit(1);
    });
}

module.exports = testFeat007Optimizer;
