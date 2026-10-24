// Rolevia AI · Automated Test Suite: FEAT-003 (Dynamic Resume Parsing & FactStore)
// Verifies PDF text extraction, structured entity parsing, ATS readiness scoring, and FactStore synchronization.

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const resumeParser = require('../backend/resumeParser');
const prisma = require('../backend/db');

async function testFeat003Resume() {
  console.log('\n--- [TEST SUITE 3] FEAT-003: Dynamic Resume Parsing & FactStore ---');

  const pdfPath = path.join(__dirname, '..', 'Sameer_Ali_Khan_Resume.pdf');
  assert(fs.existsSync(pdfPath), 'Master resume Sameer_Ali_Khan_Resume.pdf must exist');
  const pdfBuffer = fs.readFileSync(pdfPath);

  // 1. PDF Text Extraction
  const extracted = await resumeParser.extractTextFromPdf(pdfBuffer);
  assert(extracted.text.length > 200, 'Extracted text should exceed 200 characters');
  assert(extracted.text.toLowerCase().includes('sameer ali khan'), 'Extracted text must contain candidate name');
  console.log(`✓ Extraction: Extracted ${extracted.text.length} characters across ${extracted.numpages} page(s)`);

  // 2. Structured Entity Parsing
  const parsed = resumeParser.parseResumeText(extracted.text);
  assert.strictEqual(parsed.candidate.email, 'sammysameerkhan007@gmail.com', 'Parsed email match');
  assert(parsed.candidate.phone.includes('7382898751'), 'Parsed phone match');
  assert(parsed.skills.includes('Python'), 'Parsed skills must include Python');
  assert(parsed.skills.includes('PostgreSQL') || parsed.skills.includes('React'), 'Parsed skills must include core technologies');
  console.log(`✓ Entities: Extracted ${parsed.skills.length} skills, contact info, and verified social links`);

  // 3. Education & Experience Fact Extraction
  assert(parsed.education.length >= 1, 'At least 1 education fact should be parsed');
  assert(parsed.education[0].title.includes('Master of Science') || parsed.education[0].organization.includes('Osmania'), 'Education fact verified');
  assert(parsed.experience.length >= 1, 'At least 1 work experience fact should be parsed');
  assert(parsed.experience[0].organization.includes('Mantarang'), 'Work experience company verified');
  console.log(`✓ Facts: Parsed ${parsed.education.length} education entities and ${parsed.experience.length} experience entities`);

  // 4. ATS Scoring & Telemetry
  assert(parsed.stats.atsReadinessScore >= 80, `Expected ATS score >= 80, received ${parsed.stats.atsReadinessScore}`);
  assert.strictEqual(parsed.stats.singleColumnStandard, true, 'Resume follows single column standard');
  console.log(`✓ Telemetry: ATS Readiness Score ${parsed.stats.atsReadinessScore}/100, word count: ${parsed.stats.wordCount}`);

  // 5. FactStore Synchronization in Prisma
  const syncResult = await resumeParser.parseAndSyncResume('usr-sameer-01', pdfBuffer);
  assert.strictEqual(syncResult.success, true, 'Resume synchronization must return success');

  const storedProfile = await prisma.candidateProfile.findUnique({
    where: { userId: 'usr-sameer-01' },
    include: { facts: true }
  });
  assert(storedProfile !== null, 'Stored candidate profile must exist');
  assert(storedProfile.facts.length >= 3, `Expected at least 3 facts stored in FactStore, found ${storedProfile.facts.length}`);
  console.log(`✓ FactStore: Synchronized ${storedProfile.facts.length} verified career facts to Prisma database`);

  console.log('>> [PASS] FEAT-003: Dynamic resume parsing and FactStore verified.');
  return { suite: 'FEAT-003 Resume Parsing', passed: 5, failed: 0 };
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
