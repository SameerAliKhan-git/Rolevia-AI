// Rolevia AI · Master Release 0.1 Test Suite Runner
// Executes all automated suites covering FEAT-001 through FEAT-005.

const testFeat001Database = require('./test_feat001_db');
const testFeat002Auth = require('./test_feat002_auth');
const testFeat003Resume = require('./test_feat003_resume');
const testFeat004Billing = require('./test_feat004_billing');
const testFeat005Crawler = require('./test_feat005_crawler');
const prisma = require('../backend/db');

async function runAllSuites() {
  console.log('================================================================');
  console.log('     ROLEVIA AI · RELEASE 0.1 ACCEPTANCE TEST HARNESS           ');
  console.log('     Brand: RoleviaAI · Intended Domain: roleviaai.co.in        ');
  console.log('================================================================');
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

    console.log('\n================================================================');
    console.log('                 RELEASE 0.1 TEST RESULTS                       ');
    console.log('================================================================');
    results.forEach(r => {
      console.log(`  • ${r.suite.padEnd(38)} : ${r.passed} passed / ${r.failed} failed`);
    });
    console.log('----------------------------------------------------------------');
    console.log(`  TOTAL TESTS EXECUTED : ${totalPassed + totalFailed}`);
    console.log(`  TOTAL PASSED         : ${totalPassed} (${Math.round(totalPassed / (totalPassed + totalFailed) * 100)}%)`);
    console.log(`  TOTAL FAILED         : ${totalFailed}`);
    console.log(`  EXECUTION DURATION   : ${durationMs}ms`);
    console.log('================================================================');

    if (totalFailed > 0) {
      console.error('\n❌ RELEASE 0.1 GATES FAILED: Test regressions detected.');
      process.exit(1);
    } else {
      console.log('\n✅ RELEASE 0.1 GATES PASSED: All architectural criteria satisfied.');
    }
  } catch (error) {
    console.error('\n❌ UNEXPECTED TEST SUITE CRASH:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runAllSuites();
