// Rolevia AI · Master Release 0.1 Test Suite Runner
// Executes all automated suites covering FEAT-001 through FEAT-005 with full category breakdown.

const testFeat001Database = require('./test_feat001_db');
const testFeat002Auth = require('./test_feat002_auth');
const testFeat003Resume = require('./test_feat003_resume');
const testFeat004Billing = require('./test_feat004_billing');
const testFeat005Crawler = require('./test_feat005_crawler');
const prisma = require('../backend/db');

async function runAllSuites() {
  console.log('================================================================================');
  console.log('         ROLEVIA AI · RELEASE 0.1 PRODUCTION READINESS TEST HARNESS             ');
  console.log('         Brand: RoleviaAI · Intended Public Domain: roleviaai.co.in             ');
  console.log('         Database Engine: PostgreSQL 16 (Container: rolevia-postgres)           ');
  console.log('================================================================================');
  const startTime = Date.now();

  const results = [];

  try {
    results.push(await testFeat001Database());
    results.push(await testFeat002Auth());
    results.push(await testFeat003Resume());
    results.push(await testFeat004Billing());
    results.push(await testFeat005Crawler());

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
      const featId = `FEAT-00${idx + 1}`.padEnd(11);
      const name = r.suite.replace(/^FEAT-00\d\s*/, '').slice(0, 40).padEnd(40);
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
