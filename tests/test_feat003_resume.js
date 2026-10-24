// Rolevia AI · Automated Test Suite: FEAT-003 (Dynamic Resume Parsing across Multiple Layouts)
// Verifies text extraction and 5-dimension rubric ATS scoring across 3 distinct PDF layouts:
// 1. Sameer_Ali_Khan_Resume.pdf (Master single-column industry resume)
// 2. fixtures/resume_two_column_modern.pdf (Two-column modern tech CV)
// 3. fixtures/resume_academic_dense.pdf (Dense academic/research CV)
// Confirms 0 hardcoded scores and validates FactStore synchronization in PostgreSQL.

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const resumeParser = require('../backend/resumeParser');
const prisma = require('../backend/db');

async function testFeat003Resume() {
  console.log('\n--- [TEST SUITE 3] FEAT-003: Multi-Layout Resume Parsing & Explainable Rubric ---');
  let testsPassed = 0;

  // Paths to the 3 distinct layouts
  const layout1Path = path.join(__dirname, '..', 'Sameer_Ali_Khan_Resume.pdf');
  const layout2Path = path.join(__dirname, '..', 'fixtures', 'resume_two_column_modern.pdf');
  const layout3Path = path.join(__dirname, '..', 'fixtures', 'resume_academic_dense.pdf');

  assert(fs.existsSync(layout1Path), `Layout 1 missing: ${layout1Path}`);
  assert(fs.existsSync(layout2Path), `Layout 2 missing: ${layout2Path}`);
  assert(fs.existsSync(layout3Path), `Layout 3 missing: ${layout3Path}`);

  // =========================================================================
  // 1. Parse Layout 1: Master Single-Column Industry Resume
  // =========================================================================
  const buf1 = fs.readFileSync(layout1Path);
  const ext1 = await resumeParser.extractTextFromPdf(buf1);
  assert(ext1.text.length > 200, 'Layout 1 extracted text should exceed 200 chars');
  assert(ext1.text.toLowerCase().includes('sameer ali khan'), 'Layout 1 must contain candidate name');
  
  const parsed1 = resumeParser.parseResumeText(ext1.text);
  assert.strictEqual(parsed1.candidate.email, 'sammysameerkhan007@gmail.com', 'Parsed email match on layout 1');
  assert(parsed1.skills.length >= 5, `Expected >= 5 skills, found ${parsed1.skills.length}`);
  assert(parsed1.stats.atsReadinessScore >= 80, `Layout 1 score should be >= 80, got ${parsed1.stats.atsReadinessScore}`);
  
  // Verify 5-dimension rubric breakdown
  const r1 = parsed1.stats.rubricBreakdown;
  assert(r1.textExtractionQuality && r1.textExtractionQuality.max === 20, 'Rubric Dim 1: Text extraction (20 max)');
  assert(r1.semanticHeadings && r1.semanticHeadings.max === 25, 'Rubric Dim 2: Semantic headings (25 max)');
  assert(r1.contactIntegrity && r1.contactIntegrity.max === 15, 'Rubric Dim 3: Contact integrity (15 max)');
  assert(r1.metricDensity && r1.metricDensity.max === 20, 'Rubric Dim 4: Metric density (20 max)');
  assert(r1.structuralLayout && r1.structuralLayout.max === 20, 'Rubric Dim 5: Structural layout (20 max)');
  const computedSum1 = r1.textExtractionQuality.score + r1.semanticHeadings.score + r1.contactIntegrity.score + r1.metricDensity.score + r1.structuralLayout.score;
  assert.strictEqual(parsed1.stats.atsReadinessScore, computedSum1, 'Total score must equal exact sum of 5 dimensions');
  console.log(`✓ [PARSER] Layout 1 (Single-Column Master): Parsed ${parsed1.skills.length} skills, ATS Score ${parsed1.stats.atsReadinessScore}/100 (5/5 rubric dimensions verified)`);
  testsPassed++;

  // =========================================================================
  // 2. Parse Layout 2: Two-Column Modern Tech Resume
  // =========================================================================
  const buf2 = fs.readFileSync(layout2Path);
  const ext2 = await resumeParser.extractTextFromPdf(buf2);
  assert(ext2.text.length > 100, 'Layout 2 extracted text should exceed 100 chars');
  assert(ext2.text.toLowerCase().includes('alexander chen'), 'Layout 2 candidate name must be extracted');

  const parsed2 = resumeParser.parseResumeText(ext2.text);
  assert(parsed2.candidate.email.includes('alexander.chen'), 'Layout 2 email parsed');
  assert(parsed2.skills.length >= 3, `Expected >= 3 skills from modern tech CV, found ${parsed2.skills.length}`);
  
  const r2 = parsed2.stats.rubricBreakdown;
  const computedSum2 = r2.textExtractionQuality.score + r2.semanticHeadings.score + r2.contactIntegrity.score + r2.metricDensity.score + r2.structuralLayout.score;
  assert.strictEqual(parsed2.stats.atsReadinessScore, computedSum2, 'Layout 2 total score must equal exact sum of rubric dimensions');
  assert(parsed2.stats.atsReadinessScore > 50, `Layout 2 ATS score must be dynamic > 50, got ${parsed2.stats.atsReadinessScore}`);
  console.log(`✓ [PARSER] Layout 2 (Two-Column Modern): Extracted candidate & skills, ATS Score ${parsed2.stats.atsReadinessScore}/100 with explainable breakdown`);
  testsPassed++;

  // =========================================================================
  // 3. Parse Layout 3: Dense Academic/Research CV
  // =========================================================================
  const buf3 = fs.readFileSync(layout3Path);
  const ext3 = await resumeParser.extractTextFromPdf(buf3);
  assert(ext3.text.length > 100, 'Layout 3 extracted text should exceed 100 chars');
  assert(ext3.text.toLowerCase().includes('elena rostova'), 'Layout 3 candidate name must be extracted');

  const parsed3 = resumeParser.parseResumeText(ext3.text);
  assert(parsed3.candidate.email.includes('elena.rostova'), 'Layout 3 email parsed');
  assert(parsed3.education.length >= 1, 'Academic CV must extract education facts');
  
  const r3 = parsed3.stats.rubricBreakdown;
  const computedSum3 = r3.textExtractionQuality.score + r3.semanticHeadings.score + r3.contactIntegrity.score + r3.metricDensity.score + r3.structuralLayout.score;
  assert.strictEqual(parsed3.stats.atsReadinessScore, computedSum3, 'Layout 3 score must equal exact sum of rubric dimensions');
  console.log(`✓ [PARSER] Layout 3 (Academic Dense CV): Extracted research education & facts, ATS Score ${parsed3.stats.atsReadinessScore}/100`);
  testsPassed++;

  // =========================================================================
  // 4. Verification that Scores Differ Dynamically (No Hardcoded Fallbacks)
  // =========================================================================
  const scores = [parsed1.stats.atsReadinessScore, parsed2.stats.atsReadinessScore, parsed3.stats.atsReadinessScore];
  const uniqueScores = new Set(scores);
  assert(uniqueScores.size >= 2, `ATS scores across distinct layouts must vary dynamically based on content, got: ${scores.join(', ')}`);
  console.log(`✓ [SECURITY] Explainability: Dynamic scoring verified across distinct layouts (${scores.join(', ')}) with 0 hardcoded values`);
  testsPassed++;

  // =========================================================================
  // 5. FactStore Synchronization in PostgreSQL
  // =========================================================================
  const syncResult = await resumeParser.parseAndSyncResume('usr-sameer-01', buf1);
  assert.strictEqual(syncResult.success, true, 'Resume synchronization must return success');

  const storedProfile = await prisma.candidateProfile.findUnique({
    where: { userId: 'usr-sameer-01' },
    include: { facts: true }
  });
  assert(storedProfile !== null, 'CandidateProfile must be persisted');
  assert(storedProfile.facts.length >= 3, `Expected at least 3 career facts in FactStore, got ${storedProfile.facts.length}`);
  
  // Verify FactStore entities contain structured highlights and verification confidence
  for (const fact of storedProfile.facts) {
    assert(fact.factType, 'Fact must have factType');
    assert(fact.title, 'Fact must have title');
    assert(typeof fact.verified === 'boolean', 'Fact must have verified boolean');
    assert(typeof fact.confidence === 'number' && fact.confidence > 0, 'Fact must have non-zero confidence score');
  }
  console.log(`✓ [DB] FactStore Synchronization: Persisted ${storedProfile.facts.length} structured entities with confidence metrics in PostgreSQL`);
  testsPassed++;

  console.log(`>> [PASS] FEAT-003: All ${testsPassed} resume parsing & rubric tests passed.`);
  return {
    suite: 'FEAT-003 Dynamic Resume Parsing & FactStore',
    passed: testsPassed,
    failed: 0,
    category: 'Integration'
  };
}

if (require.main === module) {
  testFeat003Resume()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('>> [FAIL] FEAT-003 Test Failure:', err);
      process.exit(1);
    });
}

module.exports = testFeat003Resume;
