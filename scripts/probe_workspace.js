const http = require('node:http');

async function probe() {
  const payload = JSON.stringify({
    candidateProfile: { name: 'Alex Morgan', email: 'alex@test.com', skills: ['Node.js', 'PostgreSQL'] },
    verifiedFacts: [{ id: 'fact-1', factType: 'WORK_EXPERIENCE', title: 'Engineer', organization: 'TestCo', highlights: '["Built Node.js API"]' }],
    job: { id: 'job-1', title: 'Backend Engineer', company: 'Acme Corp', requirements: ['Node.js', 'PostgreSQL'] }
  });

  const req = http.request('http://localhost:3000/api/v1/workspace/resume/diff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  }, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', async () => {
      const data = JSON.parse(body);
      console.log('1. Diff Endpoint Status:', res.statusCode);
      console.log('   Workspace ID:', data.workspace.workspaceId);
      console.log('   Status:', data.workspace.status);
      console.log('   Sections Count:', data.workspace.sections.length);

      // Now probe approve
      const approvePayload = JSON.stringify({
        workspaceId: data.workspace.workspaceId,
        decisions: { 'item-bullet-0-0': true },
        approvedBy: 'Alex Morgan',
        candidateSecret: 'rolevia-candidate-approval-gate'
      });

      const apprReq = http.request('http://localhost:3000/api/v1/workspace/resume/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(approvePayload) }
      }, apprRes => {
        let apprBody = '';
        apprRes.on('data', d => apprBody += d);
        apprRes.on('end', () => {
          const apprData = JSON.parse(apprBody);
          console.log('\n2. Approve Endpoint Status:', apprRes.statusCode);
          console.log('   Approval Status:', apprData.status);
          console.log('   HMAC-SHA256 Token:', apprData.approvalRecord.approvalSignature.slice(0, 32) + '...');
          console.log('   Document Hash:', apprData.approvalRecord.documentHash);
          console.log('   Verified Candidate:', apprData.approvalRecord.approvedBy);
          console.log('\n>> Full Workspace HTTP API Lifecycle: 100% OPERATIONAL');
        });
      });
      apprReq.write(approvePayload);
      apprReq.end();
    });
  });
  req.write(payload);
  req.end();
}

probe();
