// Rolevia AI · FEAT-008: Interactive Resume Optimization Workspace Tests
// Validates: Side-by-side diffs, Per-bullet accept/reject, Truth-grounded inline editing,
// Missing qualification explanations, Source-fact evidence inspection, Cryptographic HMAC sign-off,
// Version history tracking, and ATS-readable document exports.

const assert = require('node:assert');
const crypto = require('node:crypto');
const resumeWorkspace = require('../backend/resumeWorkspace');
const resumeOptimizer = require('../backend/resumeOptimizer');

async function testFeat008Workspace() {
  console.log('\n--- [TEST SUITE 8] FEAT-008: Interactive Resume Optimization Workspace ---');
  let passed = 0;
  let failed = 0;

  // Mock Candidate Profile
  const candidate = {
    id: 'user-cand-008',
    email: 'alex.morgan@rolevia.test',
    name: 'Alex Morgan',
    roleTitle: 'Senior Backend Engineer',
    yearsOfExperience: 6,
    skills: ['Node.js', 'PostgreSQL', 'TypeScript', 'Docker', 'Redis', 'AWS'],
    location: 'Remote'
  };

  // Mock Verified FactStore Records
  const verifiedFacts = [
    {
      id: 'fact-work-stripe',
      factType: 'WORK_EXPERIENCE',
      title: 'Senior Backend Engineer',
      organization: 'Stripe Payments',
      location: 'San Francisco, CA',
      startDate: '2021-03-01',
      endDate: 'Present',
      highlights: JSON.stringify([
        'Engineered high-throughput payment ingestion pipeline using Node.js and PostgreSQL, processing $45M daily volume with 99.99% uptime.',
        'Migrated monolithic payment dispatch service to containerized Docker microservices, reducing p99 latency by 42%.'
      ])
    },
    {
      id: 'fact-work-scale',
      factType: 'WORK_EXPERIENCE',
      title: 'Software Engineer',
      organization: 'Scale Logic',
      location: 'Austin, TX',
      startDate: '2018-06-01',
      endDate: '2021-02-28',
      highlights: JSON.stringify([
        'Architected Redis cache cluster caching layer serving 12,000 requests/sec with sub-millisecond response times.',
        'Authored robust TypeScript data validation libraries adopted by 8 internal engineering squads.'
      ])
    },
    {
      id: 'fact-edu-gatech',
      factType: 'EDUCATION',
      title: 'B.S. in Computer Science',
      organization: 'Georgia Institute of Technology',
      location: 'Atlanta, GA',
      startDate: '2014-08-01',
      endDate: '2018-05-01',
      highlights: JSON.stringify(['Graduated Magna Cum Laude; Focus in Distributed Computing and Database Systems.'])
    }
  ];

  // Target Job Requisition requiring Node.js, PostgreSQL, Docker, Kubernetes (missing), Go (missing)
  const targetJob = {
    id: 'job-req-fintech-008',
    title: 'Staff Backend Architect',
    company: 'Apex Fintech Solutions',
    location: 'Remote',
    description: `We are seeking a Staff Backend Architect to lead our core transaction platform.
Required Skills: Node.js, PostgreSQL, Docker, Kubernetes.
Preferred Skills: Go, Kafka, Distributed Systems.
Minimum 5+ years experience designing mission-critical financial systems.`
  };

  let generatedWorkspace = null;

  // TEST 1: Interactive Workspace Generation with Side-by-Side Comparison
  try {
    generatedWorkspace = resumeWorkspace.buildOptimizationWorkspace({
      candidateProfile: candidate,
      verifiedFacts,
      job: targetJob
    });

    assert(generatedWorkspace.workspaceId.startsWith('ws-'), 'Workspace ID must be generated');
    assert.strictEqual(generatedWorkspace.jobId, targetJob.id, 'Job ID must match target requisition');
    assert.strictEqual(generatedWorkspace.status, 'PENDING_APPROVAL', 'Initial status must be PENDING_APPROVAL');
    assert(generatedWorkspace.sections.length >= 3, 'Must contain Summary, Skills, and Experience sections');

    // Verify Experience Section items have original vs tailored diff and source evidence
    const expSec = generatedWorkspace.sections.find(s => s.sectionId.startsWith('sec-exp'));
    assert(expSec, 'Experience section must exist');
    assert(expSec.items.length > 0, 'Experience section must have item diffs');

    const firstBullet = expSec.items[0];
    assert(firstBullet.itemId, 'Bullet item must have itemId');
    assert(firstBullet.originalText, 'Bullet item must have originalText');
    assert(firstBullet.optimizedText, 'Bullet item must have optimizedText');
    assert(firstBullet.sourceFactId, 'Bullet item must reference verified sourceFactId');
    assert(firstBullet.sourceEvidence.includes('Stripe Payments'), 'Evidence must cite verified organization');
    assert.strictEqual(firstBullet.isAccepted, true, 'Default state must be accepted');

    console.log('✓ [WORKSPACE] Interactive Diff: Sections, per-bullet proposals, and source evidence links generated');
    passed++;
  } catch (err) {
    console.error('✗ [WORKSPACE] Failed to generate interactive workspace:', err.message);
    failed++;
  }

  // TEST 2: Missing Qualifications & Gap Analysis
  try {
    const gaps = generatedWorkspace.missingQualificationsExplanation;
    assert(gaps, 'Gap analysis must exist');
    assert(Array.isArray(gaps.missingRequiredSkills), 'Must list missing required skills');

    // Kubernetes was required in job description, but not in candidate's skills array
    const missingK8s = gaps.missingRequiredSkills.find(s => s.skill.toLowerCase() === 'kubernetes');
    assert(missingK8s, 'Target job requires Kubernetes which candidate lacks; must be flagged');
    assert.strictEqual(missingK8s.importance, 'CRITICAL', 'Missing required skill must be marked CRITICAL');
    assert(missingK8s.explanation.includes('lacks verified FactStore evidence'), 'Must provide actionable truthful explanation');

    console.log('✓ [GAPS] Missing Qualifications: Flagged missing competencies truthfully without hallucinating capabilities');
    passed++;
  } catch (err) {
    console.error('✗ [GAPS] Missing qualifications test failed:', err.message);
    failed++;
  }

  // TEST 3: Per-Bullet Rejection Reverts to Original Text Cleanly
  try {
    const wsId = generatedWorkspace.workspaceId;
    const expSec = generatedWorkspace.sections.find(s => s.sectionId.startsWith('sec-exp'));
    const bulletToReject = expSec.items[0].itemId;
    const originalText = expSec.items[0].originalText;

    // Reject bullet 0, accept others
    const decisions = {
      [bulletToReject]: false
    };

    const reviewResult = resumeWorkspace.applyCandidateWorkspaceDecisions({
      workspaceId: wsId,
      decisions,
      approvedBy: 'Alex Morgan'
    });

    assert.strictEqual(reviewResult.status, 'DIFF_APPROVED', 'Review status must be DIFF_APPROVED');
    assert.strictEqual(reviewResult.approvalRecord.stats.rejectedCount, 1, 'Rejected count must equal 1');
    assert(reviewResult.approvedMarkdown.includes(originalText), 'Approved markdown must revert rejected bullet to original text');

    console.log('✓ [DECISIONS] Per-Bullet Toggles: Rejection cleanly restores candidate original verified highlight');
    passed++;
  } catch (err) {
    console.error('✗ [DECISIONS] Per-bullet rejection test failed:', err.message);
    failed++;
  }

  // TEST 4: Inline Custom Editing with Verified Truth Grounding
  try {
    // Generate a fresh workspace
    const wsFresh = resumeWorkspace.buildOptimizationWorkspace({
      candidateProfile: candidate,
      verifiedFacts,
      job: targetJob
    });

    const expSec = wsFresh.sections.find(s => s.sectionId.startsWith('sec-exp'));
    const bulletId = expSec.items[0].itemId;

    // Valid inline edit using verified skill (Docker) and verified metric ($45M)
    const validEdit = 'Engineered payment ingestion pipeline using Node.js and Docker for $45M daily volume.';
    const validResult = resumeWorkspace.applyCandidateWorkspaceDecisions({
      workspaceId: wsFresh.workspaceId,
      customEdits: {
        [bulletId]: validEdit
      },
      approvedBy: 'Alex Morgan'
    });

    assert.strictEqual(validResult.approvalRecord.stats.customEditCount, 1, 'Custom edit count must equal 1');
    assert(validResult.approvedMarkdown.includes(validEdit), 'Approved document must incorporate candidate custom edit');

    console.log('✓ [INLINE EDIT] Verified Edit: Candidate custom inline edits grounded in FactStore accepted');
    passed++;
  } catch (err) {
    console.error('✗ [INLINE EDIT] Verified custom edit failed:', err.message);
    failed++;
  }

  // TEST 5: Inline Custom Edit Anti-Hallucination Guard (Ungrounded Skills Rejected)
  try {
    const wsFresh2 = resumeWorkspace.buildOptimizationWorkspace({
      candidateProfile: candidate,
      verifiedFacts,
      job: targetJob
    });

    const expSec = wsFresh2.sections.find(s => s.sectionId.startsWith('sec-exp'));
    const bulletId = expSec.items[0].itemId;

    // Fraudulent / ungrounded inline edit introducing 'Solidity' and 'Web3' which candidate never had
    const fraudulentEdit = 'Architected decentralized smart contracts using Solidity and Web3 on Ethereum.';

    let caughtError = null;
    try {
      resumeWorkspace.applyCandidateWorkspaceDecisions({
        workspaceId: wsFresh2.workspaceId,
        customEdits: {
          [bulletId]: fraudulentEdit
        },
        approvedBy: 'Alex Morgan'
      });
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError, 'Zero-hallucination guard must throw error on ungrounded skill in custom edit');
    assert(caughtError instanceof resumeOptimizer.HallucinationViolationError, 'Must throw HallucinationViolationError');
    assert(caughtError.message.includes('ungrounded skill'), 'Error message must state ungrounded skill');

    console.log('✓ [SECURITY GUARD] Anti-Hallucination: Custom edit introducing unverified skill rejected');
    passed++;
  } catch (err) {
    console.error('✗ [SECURITY GUARD] Anti-hallucination guard test failed:', err.message);
    failed++;
  }

  // TEST 6: Cryptographic HMAC Candidate Approval Gate
  try {
    const wsFresh3 = resumeWorkspace.buildOptimizationWorkspace({
      candidateProfile: candidate,
      verifiedFacts,
      job: targetJob
    });

    const secretKey = 'test-candidate-crypto-signing-secret';
    const approved = resumeWorkspace.applyCandidateWorkspaceDecisions({
      workspaceId: wsFresh3.workspaceId,
      candidateSecret: secretKey,
      approvedBy: 'Alex Morgan'
    });

    const record = approved.approvalRecord;
    assert(record.approvalSignature, 'Approval record must contain approvalSignature');
    assert.strictEqual(record.signatureAlgorithm, 'HMAC-SHA256', 'Signature algorithm must be HMAC-SHA256');
    assert(record.documentHash.startsWith('sha256:'), 'Document hash must be SHA-256');
    assert.strictEqual(record.status, 'DIFF_APPROVED', 'Approval record status must be DIFF_APPROVED');

    // Verification of signature validity
    const sigCheck = resumeWorkspace.verifyApprovalSignature(record, secretKey, approved.approvedMarkdown);
    assert.strictEqual(sigCheck.valid, true, 'Cryptographic signature must pass verifyApprovalSignature');
    assert(record.expiresAt, 'Approval record must contain expiration date');

    console.log('✓ [CRYPTO SIGN-OFF] HMAC-SHA256: Candidate cryptographic approval signature validated');
    passed++;
  } catch (err) {
    console.error('✗ [CRYPTO SIGN-OFF] Approval gate test failed:', err.message);
    failed++;
  }

  // TEST 7: Version History & Target Job Association
  try {
    const versions = resumeWorkspace.getWorkspaceVersions(candidate.id, targetJob.id);
    assert(Array.isArray(versions), 'Versions must return an array');
    assert(versions.length >= 1, 'Must track generated workspace versions');
    const latest = versions[0];
    assert.strictEqual(latest.jobId, targetJob.id, 'Version must be associated with target job requisition');
    assert.strictEqual(latest.targetCompany, targetJob.company, 'Version must record company name');

    console.log('✓ [VERSIONING] History Ledger: Job-specific versions and approval history tracked');
    passed++;
  } catch (err) {
    console.error('✗ [VERSIONING] Version history test failed:', err.message);
    failed++;
  }

  // TEST 8: ATS-Compliant Multi-Format Export Payload
  try {
    const wsFresh4 = resumeWorkspace.buildOptimizationWorkspace({
      candidateProfile: candidate,
      verifiedFacts,
      job: targetJob
    });

    const finalResult = resumeWorkspace.applyCandidateWorkspaceDecisions({
      workspaceId: wsFresh4.workspaceId,
      approvedBy: 'Alex Morgan'
    });

    const payload = finalResult.exportPayload;
    assert(payload, 'Export payload must exist');
    assert(payload.markdown && payload.markdown.length > 100, 'Must provide markdown export');
    assert(payload.plainText && payload.plainText.length > 100, 'Must provide ATS plain text export');
    assert(!payload.plainText.includes('#'), 'Plain text export must strip markdown heading symbols');
    assert.strictEqual(payload.approvalSignature, finalResult.approvalRecord.approvalSignature, 'Export must carry approval token');

    console.log('✓ [EXPORT] ATS Format: Clean Markdown and plain-text export payloads generated');
    passed++;
  } catch (err) {
    console.error('✗ [EXPORT] Export payload test failed:', err.message);
    failed++;
  }

  console.log(`>> [PASS] FEAT-008: ${passed} of ${passed + failed} workspace tests passed.\n`);
  return {
    suite: 'FEAT-008: Interactive Resume Optimization Workspace',
    category: 'Unit',
    passed,
    failed
  };
}

if (require.main === module) {
  testFeat008Workspace().then(res => {
    if (res.failed > 0) process.exit(1);
  });
}

module.exports = testFeat008Workspace;
