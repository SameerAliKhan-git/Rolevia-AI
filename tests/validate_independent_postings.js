// Rolevia AI · Independent Real-World Classification Quality Validation
// Evaluates FEAT-016 on a previously unseen dataset of 30 employer postings across 10 complex dimensions.
// Reports per-field precision, recall, false-positive rate, false-negative rate, confusion matrices, and confidence calibration.

const assert = require('node:assert');
const path = require('node:path');
const experienceEngine = require('../backend/experienceEngine');
const unseenFixtures = require('./fixtures/unseen_validation_job_postings.json');

// Standard candidate profiles for scenario evaluation
const VALIDATION_CANDIDATE_PROFILES = {
  fresher_0yr: {
    name: 'Fresher (0 Years General)',
    yearsExp: 0.0,
    education: 'B.Tech in Computer Science, 2024',
    bachelors: 'B.Tech',
    requiresSponsorship: false,
    skills: ['JavaScript', 'HTML', 'CSS', 'Python'],
    facts: []
  },
  fresher_0yr_no_sponsor: {
    name: 'Fresher (0 Yrs, Domestic / No Visa Needed)',
    yearsExp: 0.0,
    education: 'B.Tech in Computer Science, 2025',
    bachelors: 'B.Tech',
    requiresSponsorship: false,
    skills: ['JavaScript', 'React', 'Node.js', 'Python'],
    facts: []
  },
  fresher_0yr_needs_sponsor: {
    name: 'Fresher (0 Yrs, Requires Visa Sponsorship)',
    yearsExp: 0.0,
    education: 'B.Tech in Computer Science, 2025',
    bachelors: 'B.Tech',
    requiresSponsorship: true,
    skills: ['Python', 'React', 'Node.js'],
    facts: []
  },
  fresher_2025_needs_sponsor: {
    name: 'Fresher 2025 Batch (Needs Sponsorship)',
    yearsExp: 0.0,
    education: 'B.Tech in Electrical & Electronics, 2025',
    bachelors: 'B.Tech',
    requiresSponsorship: true,
    skills: ['C++', 'Embedded C', 'Python'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Embedded Software Intern', startDate: '2024-06-01', endDate: '2024-12-01' }
    ]
  },
  fresher_2023_needs_sponsor: {
    name: 'Fresher 2023 Batch (Needs Sponsorship)',
    yearsExp: 0.0,
    education: 'B.Tech in Computer Science, 2023',
    bachelors: 'B.Tech',
    requiresSponsorship: true,
    skills: ['C++', 'C'],
    facts: []
  },
  fresher_2025_no_sponsor: {
    name: 'Fresher 2025 Batch (No Sponsorship Required)',
    yearsExp: 0.0,
    education: 'B.Tech in Computer Science, 2025',
    bachelors: 'B.Tech',
    requiresSponsorship: false,
    skills: ['Java', 'Python', 'SQL'],
    facts: []
  },
  fresher_2026_no_sponsor: {
    name: 'Fresher 2026 Batch (No Sponsorship Required)',
    yearsExp: 0.0,
    education: 'B.Sc in Computer Science, Expected 2026',
    bachelors: 'B.Sc',
    requiresSponsorship: false,
    skills: ['Python', 'SQL', 'Data Analytics'],
    facts: []
  },
  fresher_2024_no_sponsor: {
    name: 'Fresher 2024 Batch (No Sponsorship Required)',
    yearsExp: 0.0,
    education: 'B.Tech in Computer Science, 2024',
    bachelors: 'B.Tech',
    requiresSponsorship: false,
    skills: ['Java', 'SQL'],
    facts: []
  },
  fresher_0yr_no_intern: {
    name: 'Fresher (No Internships)',
    yearsExp: 0.0,
    education: 'B.Tech, 2025',
    bachelors: 'B.Tech',
    requiresSponsorship: false,
    skills: ['React Native', 'JavaScript'],
    facts: []
  },
  fresher_with_1yr_intern: {
    name: 'Fresher with 1 Year Internship Experience',
    yearsExp: 0.0,
    education: 'B.Tech in Information Technology, 2025',
    bachelors: 'B.Tech',
    requiresSponsorship: false,
    skills: ['React Native', 'JavaScript', 'Playwright', 'Cypress'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Software Engineering Intern', startDate: '2024-01-01', endDate: '2025-01-01' }
    ]
  },
  junior_1yr_no_sponsor: {
    name: 'Junior Developer (1.0 Yr Exp, Domestic)',
    yearsExp: 1.0,
    education: 'B.Tech, 2024',
    requiresSponsorship: false,
    skills: ['C++', 'Embedded C', 'Node.js', 'React'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Junior Software Engineer', startDate: '2024-06-01', endDate: 'present' }
    ]
  },
  junior_1yr_needs_sponsor: {
    name: 'Junior Developer (1.0 Yr Exp, Needs Sponsorship)',
    yearsExp: 1.0,
    education: 'B.Tech, 2024',
    requiresSponsorship: true,
    skills: ['Node.js', 'React', 'JavaScript'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Junior Full Stack Engineer', startDate: '2024-06-01', endDate: 'present' }
    ]
  },
  'junior_1.5yr_no_sponsor': {
    name: 'Junior QA (1.5 Yrs Exp)',
    yearsExp: 1.5,
    education: 'BCA, 2023',
    requiresSponsorship: false,
    skills: ['Playwright', 'Cypress', 'JavaScript'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'QA Automation Engineer', startDate: '2023-08-01', endDate: 'present' }
    ]
  },
  intern_1yr_only: {
    name: 'Candidate with Only Internship Experience (No Full-Time)',
    yearsExp: 0.0,
    education: 'B.Tech, 2024',
    requiresSponsorship: false,
    skills: ['Python', 'Django'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Python Development Intern', startDate: '2023-06-01', endDate: '2024-06-01' }
    ]
  },
  mid_2yr_mobile: {
    name: 'Mid Mobile Developer (2.0 Yrs Exp)',
    yearsExp: 2.0,
    education: 'B.Tech, 2023',
    requiresSponsorship: false,
    skills: ['React Native', 'JavaScript', 'iOS'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Mobile App Developer', startDate: '2023-01-01', endDate: 'present' }
    ]
  },
  mid_2yr_needs_sponsor: {
    name: 'Mid Firmware Dev (2.0 Yrs, Needs Sponsorship)',
    yearsExp: 2.0,
    education: 'B.Tech, 2023',
    requiresSponsorship: true,
    skills: ['C', 'C++'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Embedded Engineer', startDate: '2023-01-01', endDate: 'present' }
    ]
  },
  mid_2yr_citizen: {
    name: 'Mid Firmware Dev (2.0 Yrs, US Citizen)',
    yearsExp: 2.0,
    education: 'B.Tech, 2023',
    requiresSponsorship: false,
    skills: ['C', 'C++'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Embedded Engineer', startDate: '2023-01-01', endDate: 'present' }
    ]
  },
  mid_3yr_with_python: {
    name: 'Mid Backend Engineer (3.0 Yrs, Python)',
    yearsExp: 3.0,
    education: 'B.Tech, 2022',
    requiresSponsorship: false,
    skills: ['Python', 'PostgreSQL', 'Docker'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Backend Software Engineer', startDate: '2022-01-01', endDate: 'present' }
    ]
  },
  mid_3yr_needs_sponsor: {
    name: 'Mid Cloud Engineer (3.0 Yrs, Needs Sponsorship, Has Spark)',
    yearsExp: 3.0,
    education: 'B.Tech, 2022',
    requiresSponsorship: true,
    skills: ['Spark', 'PySpark', 'Python', 'React'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Data Engineer', startDate: '2022-01-01', endDate: 'present' }
    ]
  },
  mid_3yr_no_spark: {
    name: 'Mid Engineer (3.0 Yrs, Lacking Spark)',
    yearsExp: 3.0,
    education: 'B.Tech, 2022',
    requiresSponsorship: false,
    skills: ['Java', 'MySQL'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Software Engineer', startDate: '2022-01-01', endDate: 'present' }
    ]
  },
  mid_4yr: {
    name: 'Mid Engineer (4.0 Yrs Exp)',
    yearsExp: 4.0,
    education: 'B.Tech, 2021',
    requiresSponsorship: false,
    skills: ['Java', 'Distributed Systems'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Software Engineer', startDate: '2021-01-01', endDate: 'present' }
    ]
  },
  mid_4yr_no_sponsor: {
    name: 'Mid DevOps Engineer (4.0 Yrs Exp)',
    yearsExp: 4.0,
    education: 'B.Tech, 2021',
    requiresSponsorship: false,
    skills: ['Kubernetes', 'Terraform', 'Docker'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'DevOps Engineer', startDate: '2021-01-01', endDate: 'present' }
    ]
  },
  dba_3yr_no_sponsor: {
    name: 'Database Administrator (3.0 Yrs PostgreSQL)',
    yearsExp: 3.0,
    education: 'B.Tech, 2022',
    requiresSponsorship: false,
    skills: ['PostgreSQL', 'Redis'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Database Administrator', startDate: '2022-01-01', endDate: 'present' }
    ]
  },
  msc_cand_2yr_pytorch: {
    name: 'Master Graduate with 2 Yrs PyTorch (M.Sc CS)',
    yearsExp: 2.0,
    education: 'M.Sc. in Computer Science, 2023',
    bachelors: 'B.Sc in Mathematics, 2021',
    requiresSponsorship: false,
    skills: ['PyTorch', 'Python', 'Machine Learning'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'ML Research Engineer', startDate: '2023-01-01', endDate: 'present' }
    ]
  },
  senior_4yr_pytorch: {
    name: 'Senior ML Engineer (4.0 Yrs, PyTorch)',
    yearsExp: 4.0,
    education: 'B.Tech, 2021',
    requiresSponsorship: false,
    skills: ['PyTorch', 'Python', 'TensorFlow', 'Docker'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Senior ML Engineer', startDate: '2021-01-01', endDate: 'present' }
    ]
  },
  senior_5yr: {
    name: 'Senior Engineer (5.0 Yrs General)',
    yearsExp: 5.0,
    education: 'B.Tech, 2020',
    requiresSponsorship: false,
    skills: ['JavaScript', 'React', 'Node.js'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Senior Frontend Developer', startDate: '2020-01-01', endDate: 'present' }
    ]
  },
  senior_5yr_needs_sponsor: {
    name: 'Senior Security Engineer (5.0 Yrs, Needs Sponsorship)',
    yearsExp: 5.0,
    education: 'B.Tech, 2020',
    requiresSponsorship: true,
    skills: ['Cybersecurity', 'Linux', 'AWS'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Security Engineer', startDate: '2020-01-01', endDate: 'present' }
    ]
  },
  senior_5yr_citizen: {
    name: 'Senior Security Engineer (5.0 Yrs, US Citizen)',
    yearsExp: 5.0,
    education: 'B.Tech, 2020',
    requiresSponsorship: false,
    skills: ['Cybersecurity', 'Linux', 'AWS'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Security Engineer', startDate: '2020-01-01', endDate: 'present' }
    ]
  },
  senior_5yr_no_sponsor: {
    name: 'Senior Full Stack (5.0 Yrs, Ruby + TS)',
    yearsExp: 5.0,
    education: 'B.Tech, 2020',
    requiresSponsorship: false,
    skills: ['Ruby', 'TypeScript', 'PostgreSQL'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Senior Full Stack Engineer', startDate: '2020-01-01', endDate: 'present' }
    ]
  },
  senior_6yr: {
    name: 'Senior Developer (6.0 Yrs Exp)',
    yearsExp: 6.0,
    education: 'B.Tech, 2019',
    requiresSponsorship: false,
    skills: ['Java', 'AWS', 'Docker'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Senior Software Engineer', startDate: '2019-01-01', endDate: 'present' }
    ]
  },
  senior_6yr_needs_sponsor: {
    name: 'Senior SRE (6.0 Yrs, Needs Sponsorship)',
    yearsExp: 6.0,
    education: 'B.Tech, 2019',
    requiresSponsorship: true,
    skills: ['Kubernetes', 'Go', 'Linux'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Senior SRE', startDate: '2019-01-01', endDate: 'present' }
    ]
  },
  senior_6yr_no_sponsor: {
    name: 'Senior SRE (6.0 Yrs, Domestic / Has K8s + Go)',
    yearsExp: 6.0,
    education: 'B.Tech, 2019',
    requiresSponsorship: false,
    skills: ['Kubernetes', 'Go', 'Linux', 'Docker'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Senior SRE', startDate: '2019-01-01', endDate: 'present' }
    ]
  },
  senior_7yr: {
    name: 'Senior Team Lead (7.0 Yrs Exp)',
    yearsExp: 7.0,
    education: 'B.Tech, 2018',
    requiresSponsorship: false,
    skills: ['Java', 'Microservices', 'Spring'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Lead Software Engineer', startDate: '2018-01-01', endDate: 'present' }
    ]
  },
  senior_7yr_no_sponsor: {
    name: 'Senior Cloud Architect (7.0 Yrs Exp, Docker)',
    yearsExp: 7.0,
    education: 'B.Tech, 2018',
    requiresSponsorship: false,
    skills: ['Docker', 'AWS', 'Cloud Architecture'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Senior Cloud Architect', startDate: '2018-01-01', endDate: 'present' }
    ]
  },
  staff_8yr: {
    name: 'Staff Engineer (8.0 Yrs Exp)',
    yearsExp: 8.0,
    education: 'B.Tech, 2017',
    requiresSponsorship: false,
    skills: ['Distributed Systems', 'Go'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Staff Software Engineer', startDate: '2017-01-01', endDate: 'present' }
    ]
  },
  staff_8yr_needs_sponsor: {
    name: 'Staff Performance Engineer (8.0 Yrs, Needs Sponsorship)',
    yearsExp: 8.0,
    education: 'B.Tech, 2017',
    requiresSponsorship: true,
    skills: ['Linux', 'C++', 'Distributed Systems'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Staff Systems Engineer', startDate: '2017-01-01', endDate: 'present' }
    ]
  },
  staff_8yr_citizen: {
    name: 'Staff Performance Engineer (8.0 Yrs, US Citizen)',
    yearsExp: 8.0,
    education: 'B.Tech, 2017',
    requiresSponsorship: false,
    skills: ['Linux', 'C++', 'Distributed Systems'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Staff Systems Engineer', startDate: '2017-01-01', endDate: 'present' }
    ]
  },
  staff_9yr_needs_sponsor: {
    name: 'Staff Architect (9.0 Yrs, Needs Sponsorship)',
    yearsExp: 9.0,
    education: 'B.Tech, 2016',
    requiresSponsorship: true,
    skills: ['Distributed Systems', 'C++', 'Java'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Principal Architect', startDate: '2016-01-01', endDate: 'present' }
    ]
  },
  staff_9yr_citizen: {
    name: 'Staff Architect (9.0 Yrs, US Citizen)',
    yearsExp: 9.0,
    education: 'B.Tech, 2016',
    requiresSponsorship: false,
    skills: ['Distributed Systems', 'C++', 'Java'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Principal Architect', startDate: '2016-01-01', endDate: 'present' }
    ]
  },
  staff_11yr_aws: {
    name: 'Enterprise Architect (11.0 Yrs, AWS Expert)',
    yearsExp: 11.0,
    education: 'B.Tech, 2014',
    requiresSponsorship: false,
    skills: ['AWS', 'Cloud Architecture', 'Java'],
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Enterprise Architect', startDate: '2014-01-01', endDate: 'present' }
    ]
  }
};

/**
 * Runs independent real-world validation against 30 unseen postings
 */
async function runIndependentValidation() {
  console.log('\n================================================================================');
  console.log('    ROLEVIA AI · INDEPENDENT REAL-WORLD VALIDATION QUALITY HARNESS              ');
  console.log('    Dataset: 30 Previously Unseen Employer Job Postings across 10 Dimensions    ');
  console.log('================================================================================');

  let extractionTP = 0; // Correctly identified as fresher-friendly
  let extractionFP = 0; // Falsely identified non-fresher job as fresher-friendly
  let extractionTN = 0; // Correctly identified as NOT fresher-friendly
  let extractionFN = 0; // Missed a genuine fresher-friendly opportunity

  let minYearsCorrect = 0;
  let maxYearsCorrect = 0;
  let categoryCorrect = 0;
  let sponsorshipCorrect = 0;
  let internshipCorrect = 0;
  let batchCorrect = 0;

  let totalEligibilityScenarios = 0;
  let eligibilityTP = 0; // Correctly assessed ELIGIBLE
  let eligibilityFP = 0; // False positive: called ineligible candidate eligible
  let eligibilityTN = 0; // Correctly assessed INELIGIBLE
  let eligibilityFN = 0; // False negative: called eligible candidate ineligible
  let eligibilityExactMatches = 0; // Exact match across ELIGIBLE, INELIGIBLE, NEEDS_VERIFICATION

  let missingReqViolations = 0;
  const confidenceCalibration = {
    bins: { '0.0-0.5': { count: 0, correct: 0 }, '0.5-0.8': { count: 0, correct: 0 }, '0.8-1.0': { count: 0, correct: 0 } }
  };

  const sampleCount = unseenFixtures.length;

  for (const posting of unseenFixtures) {
    const classification = experienceEngine.classifyJobExperience(posting);
    const gt = posting.groundTruth;

    // 1. Fresher Classification Metric
    const predictedFresher = Boolean(classification.isFresherFriendly);
    const actualFresher = Boolean(gt.isFresherFriendly);

    if (predictedFresher && actualFresher) extractionTP++;
    else if (predictedFresher && !actualFresher) extractionFP++;
    else if (!predictedFresher && !actualFresher) extractionTN++;
    else if (!predictedFresher && actualFresher) extractionFN++;

    // 2. Minimum Experience Accuracy
    if (gt.minExperienceYears !== undefined) {
      if (classification.minExperienceYears === gt.minExperienceYears) {
        minYearsCorrect++;
      }
    } else {
      minYearsCorrect++;
    }

    // 3. Category Accuracy
    if (gt.experienceCategory) {
      if (classification.experienceCategory === gt.experienceCategory) {
        categoryCorrect++;
      }
    } else {
      categoryCorrect++;
    }

    // 4. Sponsorship Tri-State Accuracy
    if (gt.sponsorshipAvailable !== undefined) {
      if (classification.sponsorshipAvailable === gt.sponsorshipAvailable) {
        sponsorshipCorrect++;
      }
    } else {
      sponsorshipCorrect++;
    }

    // 5. Internship Acceptance Accuracy
    if (gt.acceptsInternships !== undefined) {
      if (classification.acceptsInternships === gt.acceptsInternships) {
        internshipCorrect++;
      }
    } else {
      internshipCorrect++;
    }

    // 6. Graduation Batch Accuracy
    if (gt.graduationYearRestrictions) {
      const predYears = (classification.graduationYearRestrictions || []).sort();
      const actualYears = (gt.graduationYearRestrictions || []).sort();
      if (JSON.stringify(predYears) === JSON.stringify(actualYears)) {
        batchCorrect++;
      }
    } else {
      batchCorrect++;
    }

    // 7. Missing Requirements Invariant (Zero-Assumption Rule)
    if (gt.minExperienceYears === null && !gt.isFresherFriendly) {
      if (classification.isFresherFriendly === true) {
        missingReqViolations++;
        console.error(`❌ Invariant Violation on ${posting.id}: unstated requirement inferred as fresher-friendly!`);
      }
    }

    // Confidence calibration binning
    const conf = classification.experienceExtractionConfidence || 0.0;
    const isAccurate = (predictedFresher === actualFresher) &&
      (gt.minExperienceYears === undefined || classification.minExperienceYears === gt.minExperienceYears);

    const binKey = conf < 0.5 ? '0.0-0.5' : (conf < 0.8 ? '0.5-0.8' : '0.8-1.0');
    confidenceCalibration.bins[binKey].count++;
    if (isAccurate) confidenceCalibration.bins[binKey].correct++;

    // 8. Candidate Eligibility Evaluation Scenarios
    if (gt.candidateEligibilities) {
      for (const [candidateKey, expectedStatus] of Object.entries(gt.candidateEligibilities)) {
        totalEligibilityScenarios++;
        const candidateProfile = VALIDATION_CANDIDATE_PROFILES[candidateKey] || {
          name: candidateKey,
          yearsExp: 0.0,
          requiresSponsorship: false,
          skills: []
        };

        const assessment = experienceEngine.evaluateExperienceEligibility(candidateProfile, posting);

        if (assessment.status === expectedStatus) {
          eligibilityExactMatches++;
        }

        const predictedEligible = assessment.status === 'ELIGIBLE';
        const actualEligible = expectedStatus === 'ELIGIBLE';

        if (predictedEligible && actualEligible) eligibilityTP++;
        else if (predictedEligible && !actualEligible) eligibilityFP++;
        else if (!predictedEligible && !actualEligible) eligibilityTN++;
        else if (!predictedEligible && actualEligible) eligibilityFN++;
      }
    }
  }

  // Statistical Metrics Computation
  const extPrecision = (extractionTP + extractionFP) > 0 ? (extractionTP / (extractionTP + extractionFP)) : 1.0;
  const extRecall = (extractionTP + extractionFN) > 0 ? (extractionTP / (extractionTP + extractionFN)) : 1.0;
  const extFPR = (extractionFP + extractionTN) > 0 ? (extractionFP / (extractionFP + extractionTN)) : 0.0;
  const extFNR = (extractionFN + extractionTP) > 0 ? (extractionFN / (extractionFN + extractionTP)) : 0.0;
  const extAccuracy = (extractionTP + extractionTN) / sampleCount;

  const eligPrecision = (eligibilityTP + eligibilityFP) > 0 ? (eligibilityTP / (eligibilityTP + eligibilityFP)) : 1.0;
  const eligRecall = (eligibilityTP + eligibilityFN) > 0 ? (eligibilityTP / (eligibilityTP + eligibilityFN)) : 1.0;
  const eligFPR = (eligibilityFP + eligibilityTN) > 0 ? (eligibilityFP / (eligibilityFP + eligibilityTN)) : 0.0;
  const eligFNR = (eligibilityFN + eligibilityTP) > 0 ? (eligibilityFN / (eligibilityFN + eligibilityTP)) : 0.0;
  const eligMultiClassAccuracy = eligibilityExactMatches / totalEligibilityScenarios;

  console.log('--------------------------------------------------------------------------------');
  console.log('                    INDEPENDENT VALIDATION METRICS MATRIX                      ');
  console.log('--------------------------------------------------------------------------------');
  console.log(` Samples Evaluated              : ${sampleCount} Postings, ${totalEligibilityScenarios} Eligibility Scenarios`);
  console.log(` Extraction Precision           : ${(extPrecision * 100).toFixed(1)}%`);
  console.log(` Extraction Recall              : ${(extRecall * 100).toFixed(1)}%`);
  console.log(` Extraction False-Positive Rate : ${(extFPR * 100).toFixed(1)}%`);
  console.log(` Extraction False-Negative Rate : ${(extFNR * 100).toFixed(1)}%`);
  console.log(` Min Years Exact Accuracy       : ${((minYearsCorrect / sampleCount) * 100).toFixed(1)}% (${minYearsCorrect}/${sampleCount})`);
  console.log(` Category Exact Accuracy        : ${((categoryCorrect / sampleCount) * 100).toFixed(1)}% (${categoryCorrect}/${sampleCount})`);
  console.log(` Sponsorship Tri-State Accuracy : ${((sponsorshipCorrect / sampleCount) * 100).toFixed(1)}% (${sponsorshipCorrect}/${sampleCount})`);
  console.log(` Internship Policy Accuracy     : ${((internshipCorrect / sampleCount) * 100).toFixed(1)}% (${internshipCorrect}/${sampleCount})`);
  console.log(` Graduation Batch Accuracy      : ${((batchCorrect / sampleCount) * 100).toFixed(1)}% (${batchCorrect}/${sampleCount})`);
  console.log('--------------------------------------------------------------------------------');
  console.log(` Eligibility Precision          : ${(eligPrecision * 100).toFixed(1)}%`);
  console.log(` Eligibility Recall             : ${(eligRecall * 100).toFixed(1)}%`);
  console.log(` Eligibility False-Positive Rate: ${(eligFPR * 100).toFixed(1)}%`);
  console.log(` Eligibility False-Negative Rate: ${(eligFNR * 100).toFixed(1)}%`);
  console.log(` Multi-Class Exact Accuracy     : ${(eligMultiClassAccuracy * 100).toFixed(1)}% (${eligibilityExactMatches}/${totalEligibilityScenarios})`);
  console.log('--------------------------------------------------------------------------------');
  console.log(` Missing Experience Invariant   : ${missingReqViolations === 0 ? 'ZERO VIOLATIONS [PASSED]' : `${missingReqViolations} VIOLATIONS [FAILED]`}`);
  console.log(' Confidence Calibration Bins:');
  for (const [bin, data] of Object.entries(confidenceCalibration.bins)) {
    const acc = data.count > 0 ? ((data.correct / data.count) * 100).toFixed(1) : 'N/A';
    console.log(`   Bin [${bin}] : count=${data.count}, accuracy=${acc}%`);
  }
  console.log('================================================================================\n');

  // Enforce Empirical Validation Acceptance Thresholds
  assert.ok(extPrecision >= 0.90, `Extraction precision (${extPrecision}) must be >= 90%`);
  assert.ok(extRecall >= 0.90, `Extraction recall (${extRecall}) must be >= 90%`);
  assert.ok(extFPR <= 0.05, `Extraction false-positive rate (${extFPR}) must be <= 5%`);
  assert.ok(eligPrecision >= 0.90, `Eligibility precision (${eligPrecision}) must be >= 90%`);
  assert.ok(eligRecall >= 0.90, `Eligibility recall (${eligRecall}) must be >= 90%`);
  assert.ok(eligMultiClassAccuracy >= 0.90, `Multi-class exact accuracy (${eligMultiClassAccuracy}) must be >= 90%`);
  assert.strictEqual(missingReqViolations, 0, 'Zero missing experience violations permitted');

  return {
    passed: true,
    samples: sampleCount,
    eligibilityScenarios: totalEligibilityScenarios,
    extraction: {
      precision: extPrecision,
      recall: extRecall,
      fpr: extFPR,
      fnr: extFNR,
      accuracy: extAccuracy,
      minYearsAccuracy: minYearsCorrect / sampleCount,
      categoryAccuracy: categoryCorrect / sampleCount,
      sponsorshipAccuracy: sponsorshipCorrect / sampleCount,
      internshipAccuracy: internshipCorrect / sampleCount,
      batchAccuracy: batchCorrect / sampleCount
    },
    eligibility: {
      precision: eligPrecision,
      recall: eligRecall,
      fpr: eligFPR,
      fnr: eligFNR,
      multiClassAccuracy: eligMultiClassAccuracy
    },
    invariants: {
      missingExperienceViolations: missingReqViolations,
      fresherFPR: extFPR
    },
    calibration: confidenceCalibration
  };
}

if (require.main === module) {
  runIndependentValidation()
    .then(() => {
      console.log('>> [PASS] Independent Validation Quality Gate Passed.');
      process.exit(0);
    })
    .catch(err => {
      console.error('>> [FAIL] Independent Validation Error:', err);
      process.exit(1);
    });
}

module.exports = runIndependentValidation;
