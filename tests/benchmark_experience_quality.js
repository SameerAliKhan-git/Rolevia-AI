// Rolevia AI · Empirical Quality Benchmark: Experience Extraction & Eligibility Classification
// Evaluates Precision, Recall, False-Positive Rate (FPR), and False-Negative Rate (FNR)
// against a curated dataset of real-world job descriptions with verified ground truth.

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const experienceEngine = require('../backend/experienceEngine');

const FIXTURES_PATH = path.join(__dirname, 'fixtures', 'labeled_job_postings.json');

// Standardized candidate personas for eligibility benchmarking
const CANDIDATE_PERSONAS = {
  fresher_0yr: {
    id: 'cand-fresher',
    yearsExp: 0,
    education: 'B.Tech in Computer Science (2024)',
    requiresSponsorship: false,
    skills: ['Python', 'SQL', 'Git']
  },
  intern_1yr: {
    id: 'cand-intern',
    yearsExp: 0,
    education: 'B.Sc in Computer Science (2024)',
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Software Engineering Intern', startDate: '2023-01', endDate: '2024-01' }
    ],
    skills: ['Python', 'JavaScript']
  },
  intern_only_1yr: {
    id: 'cand-intern-only',
    yearsExp: 0,
    education: 'B.E. in Information Technology',
    facts: [
      { factType: 'WORK_EXPERIENCE', title: 'Summer Intern', startDate: '2023-06', endDate: '2024-06' }
    ],
    skills: ['C++', 'Python']
  },
  fulltime_2yr: {
    id: 'cand-fulltime-2yr',
    yearsExp: 2.0,
    education: 'B.Tech CS (2022)',
    skills: ['C++', 'Networking', 'Linux']
  },
  experienced_1_5yr: {
    id: 'cand-1_5yr',
    yearsExp: 1.5,
    education: 'B.Tech Computer Science (2023)',
    skills: ['React', 'TypeScript', 'Node.js']
  },
  experienced_2yr: {
    id: 'cand-2yr',
    yearsExp: 2.0,
    education: 'B.Tech Computer Science (2022)',
    skills: ['Python', 'PostgreSQL', 'Docker', 'React']
  },
  experienced_3yr: {
    id: 'cand-3yr',
    yearsExp: 3.0,
    education: 'B.Sc Computer Science (2021)',
    skills: ['Python', 'Django', 'PostgreSQL']
  },
  mid_3yr: {
    id: 'cand-mid-3yr',
    yearsExp: 3.0,
    education: 'B.Tech CS',
    skills: ['Linux', 'Kubernetes', 'Python']
  },
  mid_4yr: {
    id: 'cand-mid-4yr',
    yearsExp: 4.0,
    education: 'B.Tech CS (2020)',
    skills: ['React', 'Node.js', 'AWS', 'Rust']
  },
  senior_6yr: {
    id: 'cand-senior-6yr',
    yearsExp: 6.0,
    education: 'M.S. in Computer Engineering (2018)',
    skills: ['C++', 'Rust', 'Distributed Systems']
  },
  staff_9yr: {
    id: 'cand-staff-9yr',
    yearsExp: 9.0,
    education: 'B.S. in Computer Science (2015)',
    skills: ['Distributed Systems', 'Cloud Architecture', 'Swift', 'Go']
  },
  python_5yr_senior: {
    id: 'cand-py-senior',
    yearsExp: 5.0,
    skills: ['Python', 'Kubernetes', 'Kafka'],
    skillYears: { python: 3.5 }
  },
  node_5yr_no_python: {
    id: 'cand-node-senior',
    yearsExp: 5.0,
    skills: ['Node.js', 'TypeScript', 'PostgreSQL'],
    skillYears: { node: 5.0, python: 0 }
  },
  react_3yr_no_webgl: {
    id: 'cand-react-nowebgl',
    yearsExp: 3.5,
    skills: ['React', 'TypeScript', 'CSS'],
    skillYears: { react: 3.5, webgl: 0 }
  },
  citizen_3yr: {
    id: 'cand-citizen',
    yearsExp: 3.0,
    requiresSponsorship: false,
    skills: ['C++', 'Python']
  },
  needs_sponsorship_3yr: {
    id: 'cand-sponsor',
    yearsExp: 3.0,
    requiresSponsorship: true,
    skills: ['C++', 'Python', 'Go', 'Ruby']
  },
  msc_student_1yr_exp: {
    id: 'cand-msc',
    yearsExp: 1.0,
    education: 'M.Sc. Computer Science (Osmania University, 2026)',
    skills: ['Python', 'PyTorch', 'Transformers']
  },
  bsc_0yr_exp: {
    id: 'cand-bsc',
    yearsExp: 0,
    education: 'B.Sc Computer Science (2024)',
    skills: ['Python']
  },
  grad_2026: {
    id: 'cand-grad-2026',
    yearsExp: 0,
    education: 'B.Tech Computer Science (Expected 2026)',
    skills: ['Java', 'Python']
  },
  grad_2021: {
    id: 'cand-grad-2021',
    yearsExp: 3.0,
    education: 'B.Tech Computer Science (Graduated 2021)',
    skills: ['Java', 'Spring Boot']
  },
  grad_2023: {
    id: 'cand-grad-2023',
    yearsExp: 1.0,
    education: 'B.E. Computer Science (2023)',
    skills: ['Python']
  },
  data_eng_3yr_with_spark: {
    id: 'cand-de-spark',
    yearsExp: 3.0,
    skills: ['Python', 'Apache Spark', 'SQL'],
    skillYears: { spark: 2.0 }
  },
  data_eng_3yr_no_spark: {
    id: 'cand-de-nospark',
    yearsExp: 3.0,
    skills: ['Python', 'SQL', 'Pandas'],
    skillYears: { spark: 0 }
  }
};

async function runExperienceBenchmark() {
  console.log('\n================================================================================');
  console.log('      ROLEVIA AI · EMPIRICAL EXPERIENCE CLASSIFICATION BENCHMARK HARNESS        ');
  console.log('      Ground-Truth Dataset: 30 Real-World Postings across 10 Complex Dimensions  ');
  console.log('================================================================================');

  const rawData = fs.readFileSync(FIXTURES_PATH, 'utf-8');
  const jobFixtures = JSON.parse(rawData);

  // 1. Extraction Metrics Counters (Fresher-friendly detection & min-years extraction)
  let ext_TP = 0; // Correctly identified fresher-friendly
  let ext_FP = 0; // Wrongly identified fresher-friendly (False positive fresher!)
  let ext_TN = 0; // Correctly identified experienced role
  let ext_FN = 0; // Missed fresher-friendly role
  let ext_minYearsMatches = 0;
  let ext_totalJobs = jobFixtures.length;

  // 2. Eligibility Metrics Counters
  let elig_totalEvaluations = 0;
  let elig_correctStatuses = 0;
  let elig_TP = 0; // Correctly assessed ELIGIBLE
  let elig_FP = 0; // Ineligible candidate falsely given ELIGIBLE
  let elig_TN = 0; // Ineligible / NeedsVerification correctly withheld
  let elig_FN = 0; // Eligible candidate falsely given INELIGIBLE

  const invariantViolations = [];

  for (const job of jobFixtures) {
    const classification = experienceEngine.classifyJobExperience(job);
    const gt = job.groundTruth;

    // --- Invariant 1: Unstated experience MUST NEVER be classified as fresher-friendly ---
    if (gt.experienceCategory === 'NOT_SPECIFIED' && classification.isFresherFriendly === true) {
      invariantViolations.push(`JOB ${job.id} (${job.title}): Unstated experience was wrongly marked isFresherFriendly=true!`);
    }

    // Extraction Evaluation
    const expectedFresher = Boolean(gt.isFresherFriendly);
    const actualFresher = Boolean(classification.isFresherFriendly);

    if (expectedFresher && actualFresher) ext_TP++;
    else if (!expectedFresher && actualFresher) ext_FP++;
    else if (!expectedFresher && !actualFresher) ext_TN++;
    else if (expectedFresher && !actualFresher) ext_FN++;

    if (gt.minExperienceYears === classification.minExperienceYears) {
      ext_minYearsMatches++;
    }

    // Eligibility Evaluation for candidate personas
    if (gt.candidateEligibilities) {
      for (const [personaKey, expectedStatus] of Object.entries(gt.candidateEligibilities)) {
        const candidate = CANDIDATE_PERSONAS[personaKey];
        if (!candidate) continue;

        elig_totalEvaluations++;
        const evalResult = experienceEngine.evaluateExperienceEligibility(candidate, job);

        if (evalResult.status === expectedStatus) {
          elig_correctStatuses++;
        }

        // Binary assessment: Positive = ELIGIBLE; Negative = INELIGIBLE or NEEDS_VERIFICATION
        const isActuallyEligible = expectedStatus === 'ELIGIBLE';
        const isPredictedEligible = evalResult.status === 'ELIGIBLE';

        if (isActuallyEligible && isPredictedEligible) elig_TP++;
        else if (!isActuallyEligible && isPredictedEligible) elig_FP++;
        else if (!isActuallyEligible && !isPredictedEligible) elig_TN++;
        else if (isActuallyEligible && !isPredictedEligible) elig_FN++;

        // Invariant 2: Candidate with 0 experience must never get ELIGIBLE on unstated or senior jobs
        if (personaKey === 'fresher_0yr' && (gt.experienceCategory === 'NOT_SPECIFIED' || (gt.minExperienceYears && gt.minExperienceYears >= 2))) {
          if (evalResult.status === 'ELIGIBLE') {
            invariantViolations.push(`JOB ${job.id}: Fresher candidate was evaluated as ELIGIBLE for ${gt.experienceCategory} job!`);
          }
        }
      }
    }
  }

  // Calculate Statistical Performance Metrics
  // Extraction
  const ext_precision = ext_TP + ext_FP > 0 ? (ext_TP / (ext_TP + ext_FP)) : 1.0;
  const ext_recall = ext_TP + ext_FN > 0 ? (ext_TP / (ext_TP + ext_FN)) : 1.0;
  const ext_FPR = ext_FP + ext_TN > 0 ? (ext_FP / (ext_FP + ext_TN)) : 0.0;
  const ext_FNR = ext_FN + ext_TP > 0 ? (ext_FN / (ext_FN + ext_TP)) : 0.0;
  const ext_accuracy = (ext_TP + ext_TN) / (ext_totalJobs);

  // Eligibility
  const elig_precision = elig_TP + elig_FP > 0 ? (elig_TP / (elig_TP + elig_FP)) : 1.0;
  const elig_recall = elig_TP + elig_FN > 0 ? (elig_TP / (elig_TP + elig_FN)) : 1.0;
  const elig_FPR = elig_FP + elig_TN > 0 ? (elig_FP / (elig_FP + elig_TN)) : 0.0;
  const elig_FNR = elig_FN + elig_TP > 0 ? (elig_FN / (elig_FN + elig_TP)) : 0.0;
  const elig_accuracy = elig_correctStatuses / elig_totalEvaluations;

  console.log('--------------------------------------------------------------------------------');
  console.log('                           BENCHMARK RESULTS MATRIX                             ');
  console.log('--------------------------------------------------------------------------------');
  console.log(' Metric                              | Experience Extraction | Candidate Eligibility ');
  console.log('-------------------------------------+-----------------------+-----------------------');
  console.log(` Samples Evaluated                   | ${String(ext_totalJobs).padEnd(21)} | ${String(elig_totalEvaluations).padEnd(21)} `);
  console.log(` True Positives (TP)                 | ${String(ext_TP).padEnd(21)} | ${String(elig_TP).padEnd(21)} `);
  console.log(` True Negatives (TN)                 | ${String(ext_TN).padEnd(21)} | ${String(elig_TN).padEnd(21)} `);
  console.log(` False Positives (FP)                | ${String(ext_FP).padEnd(21)} | ${String(elig_FP).padEnd(21)} `);
  console.log(` False Negatives (FN)                | ${String(ext_FN).padEnd(21)} | ${String(elig_FN).padEnd(21)} `);
  console.log('-------------------------------------+-----------------------+-----------------------');
  console.log(` Precision                           | ${(ext_precision * 100).toFixed(1).padStart(5)}%               | ${(elig_precision * 100).toFixed(1).padStart(5)}%               `);
  console.log(` Recall                              | ${(ext_recall * 100).toFixed(1).padStart(5)}%               | ${(elig_recall * 100).toFixed(1).padStart(5)}%               `);
  console.log(` False-Positive Rate (FPR)           | ${(ext_FPR * 100).toFixed(1).padStart(5)}%               | ${(elig_FPR * 100).toFixed(1).padStart(5)}%               `);
  console.log(` False-Negative Rate (FNR)           | ${(ext_FNR * 100).toFixed(1).padStart(5)}%               | ${(elig_FNR * 100).toFixed(1).padStart(5)}%               `);
  console.log(` Multi-Class Exact Accuracy          | ${(ext_accuracy * 100).toFixed(1).padStart(5)}%               | ${(elig_accuracy * 100).toFixed(1).padStart(5)}%               `);
  console.log('--------------------------------------------------------------------------------');
  console.log(` Critical Invariants Checked:`);
  console.log(`   [✓] Missing Experience Invariant  : ${invariantViolations.length === 0 ? 'ZERO VIOLATIONS (Passed)' : 'FAILED'}`);
  console.log(`   [✓] Fresher False-Positive Rate   : ${(ext_FPR * 100).toFixed(1)}%`);
  console.log(`   [✓] Min Experience Years Accuracy : ${((ext_minYearsMatches / ext_totalJobs) * 100).toFixed(1)}%`);
  console.log('================================================================================');

  if (invariantViolations.length > 0) {
    console.error('\n❌ CRITICAL INVARIANT VIOLATIONS DETECTED:');
    invariantViolations.forEach(v => console.error('  - ' + v));
    throw new Error('Benchmark failed critical invariants');
  }

  assert.strictEqual(ext_FP, 0, 'False-positive freshers on extraction must be 0');
  assert.ok(ext_precision >= 0.95, 'Extraction precision must be >= 95%');
  assert.ok(ext_recall >= 0.95, 'Extraction recall must be >= 95%');
  assert.ok(elig_precision >= 0.95, 'Eligibility precision must be >= 95%');
  assert.ok(elig_accuracy >= 0.95, 'Eligibility exact accuracy must be >= 95%');

  return {
    extraction: {
      precision: ext_precision,
      recall: ext_recall,
      fpr: ext_FPR,
      fnr: ext_FNR,
      accuracy: ext_accuracy
    },
    eligibility: {
      precision: elig_precision,
      recall: elig_recall,
      fpr: elig_FPR,
      fnr: elig_FNR,
      accuracy: elig_accuracy
    },
    totalJobs: ext_totalJobs,
    totalEvaluations: elig_totalEvaluations,
    passed: true
  };
}

if (require.main === module) {
  runExperienceBenchmark().then(() => {
    console.log('✅ Experience classification benchmark completed successfully.');
    process.exit(0);
  }).catch(err => {
    console.error('❌ Benchmark failed:', err);
    process.exit(1);
  });
}

module.exports = runExperienceBenchmark;
