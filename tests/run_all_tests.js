// Rolevia AI · Master Release 0.1 Test Suite Runner
// Executes all automated suites covering FEAT-001 through FEAT-005 with full category breakdown.

const testFeat001Database = require('./test_feat001_db');
const testFeat002Auth = require('./test_feat002_auth');
const testFeat003Resume = require('./test_feat003_resume');
const testResumeBenchmarks = require('./test_resume_benchmark_eval');
const testFeat004Billing = require('./test_feat004_billing');
const testFeat005Crawler = require('./test_feat005_crawler');
const testE2EUserJourney = require('./test_e2e_user_journey');
const testNegativePaths = require('./test_negative_paths');
const testFeat006Matcher = require('./test_feat006_matcher');
const testFeat007Optimizer = require('./test_feat007_optimizer');
const testFeat008Workspace = require('./test_feat008_workspace');
const testFeat008SecurityAndUX = require('./test_feat008_security_ux');
const testFeat016ExperienceEngine = require('./test_feat016_experience_engine');
const testFeat009AtsAutomation = require('./test_feat009_ats_automation');
const testFeat010ApplicationTracker = require('./test_feat010_application_tracker');
const testFeat009Audit = require('./test_feat009_feat010_audit');
const testTrackerUi = require('./verify_tracker_ui');
const { runFeat011Tests: testFeat011RecruiterEmail } = require('./test_feat011_recruiter_email');
const prisma = require('../backend/db');

async function runAllSuites() {
  console.log('================================================================================');
  console.log('         ROLEVIA AI · MASTER AUTOMATED TEST & VERIFICATION HARNESS              ');
  console.log('         Brand: RoleviaAI · Intended Public Domain: roleviaai.co.in             ');
  console.log('         Database Engine: PostgreSQL 16 (Container: rolevia-postgres)           ');
  console.log('================================================================================');
  const startTime = Date.now();

  const results = [];

  try {
    results.push(await testFeat001Database());
    results.push(await testFeat002Auth());
    results.push(await testFeat003Resume());
    results.push(await testResumeBenchmarks());
    results.push(await testFeat004Billing());
    results.push(await testFeat005Crawler());
    results.push(await testFeat006Matcher());
    results.push(await testFeat007Optimizer());
    results.push(await testFeat008Workspace());
    results.push(await testFeat008SecurityAndUX());
    results.push(await testFeat016ExperienceEngine());
    results.push(await testFeat009AtsAutomation());
    results.push(await testFeat010ApplicationTracker());
    results.push(await testFeat009Audit());
    results.push(await testTrackerUi());
    results.push(await testFeat011RecruiterEmail());
    results.push(await testE2EUserJourney());
    results.push(await testNegativePaths());

    const totalPassed = results.reduce((acc, r) => acc + r.passed, 0);
    const totalFailed = results.reduce((acc, r) => acc + r.failed, 0);
    const durationMs = Date.now() - startTime;

    // Aggregate by Category
    const categoryCounts = {
      'Database': 0,
      'Security': 0,
      'Integration': 0,
      'Unit': 0,
      'End-to-End': 0
    };

    results.forEach(r => {
      if (categoryCounts[r.category] !== undefined) {
        categoryCounts[r.category] += r.passed;
      }
    });

    console.log('\n================================================================================');
    console.log('                    RELEASE 0.1 AUDIT & TEST MATRIX                             ');
    console.log('================================================================================');
    console.log('  Feature ID  | Feature Name                             | Category     | Pass / Fail');
    console.log('  ------------+------------------------------------------+--------------+------------');
    results.forEach((r, idx) => {
      const featMatch = r.suite.match(/^(FEAT-\d{3})/);
      const featId = (featMatch ? featMatch[1] : `GATE-${idx + 1}`).padEnd(11);
      const name = r.suite.replace(/^FEAT-\d{3}\s*[:-]?\s*/, '').slice(0, 40).padEnd(40);
      const cat = (r.category || 'Unit').padEnd(12);
      const counts = `${r.passed} / ${r.failed}`.padStart(10);
      console.log(`  ${featId} | ${name} | ${cat} | ${counts}`);
    });
    console.log('  ------------+------------------------------------------+--------------+------------');
    console.log('  CATEGORY BREAKDOWN:');
    console.log(`    • Database & Transactional Integrity : ${categoryCounts['Database']} tests`);
    console.log(`    • Security & Cryptographic Auth     : ${categoryCounts['Security']} tests`);
    console.log(`    • Integration & Pipeline Verification: ${categoryCounts['Integration']} tests`);
    console.log(`    • Unit & Algorithmic Validation      : ${categoryCounts['Unit']} tests`);
    console.log(`    • End-to-End Candidate Lifecycles    : ${categoryCounts['End-to-End']} tests`);
    console.log('  ------------------------------------------------------------------------------');
    console.log(`  TOTAL TEST CASES EXECUTED : ${totalPassed + totalFailed}`);
    console.log(`  TOTAL TEST CASES PASSED   : ${totalPassed} (${Math.round((totalPassed / (totalPassed + totalFailed)) * 100)}%)`);
    console.log(`  TOTAL TEST CASES FAILED   : ${totalFailed}`);
    console.log(`  TOTAL EXECUTION TIME      : ${durationMs}ms`);
    console.log('================================================================================');

    if (totalFailed > 0) {
      console.error('\n❌ RELEASE 0.1 PRODUCTION READINESS GATE: FAILED (Regressions detected)');
      process.exit(1);
    } else {
      console.log('\n✅ RELEASE 0.1 PRODUCTION READINESS GATE: PASSED (All 5 features verified)');
    }
  } catch (error) {
    console.error('\n❌ UNEXPECTED TEST SUITE CRASH:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runAllSuites();
