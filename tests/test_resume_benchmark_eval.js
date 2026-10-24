// Rolevia AI · Automated Benchmark Suite: Dynamic Resume Evaluation
// Evaluates 4 diverse resume layouts against independently labeled ground-truth benchmarks across:
// 1. Parsing Quality (Extraction Fidelity: Precision, Recall, Entity Match)
// 2. Document-Format Quality (ATS Readability Rubric: 100-pt structural scoring)
// 3. Job-Specific Resume Relevance (Semantic alignment to specific requisition requirements)

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const resumeParser = require('../backend/resumeParser');

/**
 * Computes job-specific resume relevance score against a target job requirement
 */
function computeJobRelevance(candidateSkills = [], candidateTitle = '', targetJob = {}) {
  const reqSkills = targetJob.requiredSkills || [];
  if (reqSkills.length === 0) return 1.0;

  const candLower = candidateSkills.map(s => s.toLowerCase());
  let matchedCount = 0;

  for (const skill of reqSkills) {
    if (candLower.some(c => c.includes(skill.toLowerCase()) || skill.toLowerCase().includes(c))) {
      matchedCount++;
    }
  }

  const skillCoverage = matchedCount / reqSkills.length;
  return Math.round(skillCoverage * 100) / 100;
}

async function testResumeBenchmarkEval() {
  console.log('\n--- [TEST SUITE 3B] Multi-Layout Benchmark: Parsing Fidelity vs Format Quality vs Job Relevance ---');
  let testsPassed = 0;

  const testCases = [
    { pdf: 'resume_two_column_modern.pdf', bench: 'resume_modern.json' },
    { pdf: 'resume_academic_dense.pdf', bench: 'resume_academic.json' },
    { pdf: 'resume_creative_columns.pdf', bench: 'resume_creative.json' },
    { pdf: 'resume_entry_level.pdf', bench: 'resume_entry.json' }
  ];

  for (const tc of testCases) {
    const pdfPath = path.join(__dirname, '..', 'fixtures', tc.pdf);
    const benchPath = path.join(__dirname, '..', 'fixtures', 'benchmarks', tc.bench);

    assert(fs.existsSync(pdfPath), `PDF fixture must exist: ${pdfPath}`);
    assert(fs.existsSync(benchPath), `Benchmark must exist: ${benchPath}`);

    const pdfBuffer = fs.readFileSync(pdfPath);
    const benchmark = JSON.parse(fs.readFileSync(benchPath, 'utf8'));

    // 1. Extract raw text & parse structured entities
    const extracted = await resumeParser.extractTextFromPdf(pdfBuffer);
    const parsed = resumeParser.parseResumeText(extracted.text, extracted.numpages);

    // =========================================================================
    // Dimension 1: Parsing Quality (Extraction Fidelity)
    // =========================================================================
    const exp = benchmark.expectedFidelity;

    // Email extraction fidelity
    assert.strictEqual(parsed.candidate.email, exp.email, `[${tc.pdf}] Email extraction mismatch`);
    
    // Phone extraction fidelity
    assert.strictEqual(parsed.candidate.phone, exp.phone, `[${tc.pdf}] Phone extraction mismatch`);

    // Key skills recall
    const extractedSkillsLower = parsed.skills.map(s => s.toLowerCase());
    let matchedSkills = 0;
    for (const req of exp.requiredSkills) {
      if (extractedSkillsLower.some(s => s.includes(req.toLowerCase()) || req.toLowerCase().includes(s))) {
        matchedSkills++;
      }
    }
    const skillRecall = matchedSkills / exp.requiredSkills.length;
    assert(skillRecall >= 0.70, `[${tc.pdf}] Skill recall must be >= 70%, achieved ${Math.round(skillRecall * 100)}% (${matchedSkills}/${exp.requiredSkills.length})`);

    // Minimum skills count
    assert(parsed.skills.length >= exp.minimumSkillCount, `[${tc.pdf}] Expected >= ${exp.minimumSkillCount} skills, found ${parsed.skills.length}`);

    console.log(`✓ [FIDELITY] ${benchmark.layoutType}: Email & Phone 100% matched, Skill Recall: ${Math.round(skillRecall * 100)}% (${matchedSkills}/${exp.requiredSkills.length})`);
    testsPassed++;

    // =========================================================================
    // Dimension 2: Document-Format Quality (ATS Readability Rubric)
    // =========================================================================
    const formatScore = parsed.evaluation.totalScore;
    const range = benchmark.formatQualityExpectedRange;
    assert(formatScore >= range.minScore && formatScore <= range.maxScore,
      `[${tc.pdf}] ATS Format Quality score ${formatScore} outside expected range [${range.minScore}, ${range.maxScore}]`
    );
    console.log(`✓ [FORMAT QUALITY] ${benchmark.layoutType}: ATS Readability Score: ${formatScore}/100 (in range [${range.minScore}-${range.maxScore}])`);
    testsPassed++;

    // =========================================================================
    // Dimension 3: Job-Specific Resume Relevance
    // =========================================================================
    const relBench = benchmark.relevanceBenchmarks;
    const jobRelevance = computeJobRelevance(parsed.skills, parsed.candidate.name, {
      requiredSkills: relBench.targetSkills
    });

    assert(jobRelevance >= relBench.expectedMatchRateMin,
      `[${tc.pdf}] Job relevance for '${relBench.targetJobRole}' must be >= ${relBench.expectedMatchRateMin}, got: ${jobRelevance}`
    );
    console.log(`✓ [JOB RELEVANCE] ${benchmark.layoutType}: Requisition match for '${relBench.targetJobRole}': ${Math.round(jobRelevance * 100)}%`);
    testsPassed++;
  }

  // =========================================================================
  // Cross-Document Contrast: Proving Format Quality != Job Relevance
  // =========================================================================
  // Alex Chen (Senior Backend) evaluated against a Frontend UI role
  const alexPdf = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'resume_two_column_modern.pdf'));
  const alexExtracted = await resumeParser.extractTextFromPdf(alexPdf);
  const alexParsed = resumeParser.parseResumeText(alexExtracted.text);

  const uiDesignJob = { requiredSkills: ['Figma', 'User Research', 'Design Systems', 'Typography'] };
  const alexUiRelevance = computeJobRelevance(alexParsed.skills, alexParsed.candidate.name, uiDesignJob);

  // Alex has high ATS format quality (98/100) but low relevance to UI Design job (<30%)
  assert(alexParsed.evaluation.totalScore >= 90, 'Alex has high document ATS format quality');
  assert(alexUiRelevance <= 0.30, `Alex should have low relevance to UI Design role, got: ${alexUiRelevance}`);
  console.log(`✓ [ORTHOGONALITY] Format Quality (${alexParsed.evaluation.totalScore}/100) strictly decoupled from Job Relevance (${Math.round(alexUiRelevance * 100)}%)`);
  testsPassed++;

  console.log(`>> [PASS] FEAT-003 Benchmark Evaluation: All ${testsPassed} benchmark tests passed.`);
  return {
    suite: 'FEAT-003 Multi-Layout Benchmark Evaluation',
    passed: testsPassed,
    failed: 0,
    category: 'Integration'
  };
}

if (require.main === module) {
  testResumeBenchmarkEval()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('>> [FAIL] FEAT-003 Benchmark Failure:', err);
      process.exit(1);
    });
}

module.exports = testResumeBenchmarkEval;
