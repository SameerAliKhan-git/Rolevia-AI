// Rolevia AI · FEAT-011 Recruiter Email Intelligence Agent Verification Suite
// Tests token encryption at rest, OAuth URL scoping, recruiter heuristic filtering,
// multi-class categorization, application linking, deduplication, and mailbox disconnection.

const assert = require('assert');
const prisma = require('../backend/db');
const {
  encryptToken,
  decryptToken,
  PROVIDER_SCOPES,
  getOAuthAuthorizationUrl,
  isRecruiterEmail,
  classifyRecruiterMessage,
  linkMessageToApplication,
  draftCandidateReply,
  processEmailBatch,
  disconnectMailbox
} = require('../backend/recruiterEmailIntelligence');

async function runFeat011Tests() {
  console.log('\n================================================================');
  console.log(' ROLEVIA AI · FEAT-011 RECRUITER EMAIL INTELLIGENCE AGENT SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Token Encryption & Decryption (AES-256-GCM)
  test('Token Security: AES-256-GCM encryption with IV and AuthTag round-trip', () => {
    const rawToken = 'ya29.a0AfH6SMD_very_secret_oauth_access_token_12345';
    const encrypted = encryptToken(rawToken);
    assert.ok(encrypted.includes(':'), 'Encrypted token must contain IV and AuthTag delimiters');
    const parts = encrypted.split(':');
    assert.strictEqual(parts.length, 3, 'Must have IV, tag, and ciphertext');

    const decrypted = decryptToken(encrypted);
    assert.strictEqual(decrypted, rawToken, 'Decrypted token must exactly match original secret');
  });

  // 2. Tampered Token Rejection
  test('Token Security: Tampered ciphertext or auth tag fails decryption', () => {
    const rawToken = 'secret_refresh_token_abc';
    const encrypted = encryptToken(rawToken);
    const parts = encrypted.split(':');
    // Flip first character of auth tag to guarantee tampering
    parts[1] = (parts[1][0] === '0' ? '1' : '0') + parts[1].substring(1);
    const tampered = parts.join(':');

    assert.throws(() => {
      decryptToken(tampered);
    }, /Unsupported state or unable to authenticate data/, 'Tampered token must throw auth tag mismatch');
  });

  // 3. OAuth Scopes (Minimum Necessary Scope Policy)
  test('Provider Scopes: Gmail and Outlook enforce minimum readonly permissions', () => {
    assert.deepStrictEqual(PROVIDER_SCOPES.GMAIL, ['https://www.googleapis.com/auth/gmail.readonly']);
    assert.deepStrictEqual(PROVIDER_SCOPES.OUTLOOK, ['Mail.Read', 'offline_access']);

    const gmailUrl = getOAuthAuthorizationUrl('GMAIL', 'http://localhost:3000/callback', 'state123');
    assert.ok(gmailUrl.includes('gmail.readonly'), 'Gmail auth URL must contain gmail.readonly');
    assert.ok(!gmailUrl.includes('mail.google.com'), 'Must NEVER request full mailbox write access');

    const outlookUrl = getOAuthAuthorizationUrl('OUTLOOK', 'http://localhost:3000/callback', 'state456');
    assert.ok(outlookUrl.includes('Mail.Read'), 'Outlook auth URL must contain Mail.Read');
  });

  // 4. Recruiter Email Discrimination (Spam/Digest vs Recruiter)
  test('Recruiter Discrimination: Job alert digests, newsletters, and spam are rejected', () => {
    const spam = {
      subject: 'Daily Job Alert: 25 new jobs in Bangalore',
      body: 'Click here to unsubscribe from daily alerts'
    };
    const res = isRecruiterEmail(spam);
    assert.strictEqual(res.isRecruiter, false);
    assert.strictEqual(res.reason, 'SPAM_OR_DIGEST');

    const newsletter = {
      subject: 'Weekly Tech Digest: React 19 released',
      body: 'Here are the top trending open source articles. Unsubscribe anytime.'
    };
    assert.strictEqual(isRecruiterEmail(newsletter).isRecruiter, false);
  });

  // 5. Recruiter Email Acceptance
  test('Recruiter Discrimination: Legitimate recruiter outreach identified', () => {
    const recruiter = {
      subject: 'Interview with Stripe for Senior Backend Engineer',
      senderEmail: 'sarah.recruiter@stripe.com',
      body: 'Hi, our hiring team reviewed your application and would like to invite you to an interview.'
    };
    const res = isRecruiterEmail(recruiter);
    assert.strictEqual(res.isRecruiter, true);
    assert.ok(res.signals.includes('interview'));
  });

  // 6. Classification: Interview Invitation
  test('Classification: Interview invitation extracts dates and meeting links', () => {
    const email = {
      subject: 'Invitation to Interview: Stripe Backend Role',
      body: 'We are pleased to invite you to an interview on Monday, November 3rd at 2:00 PM IST. Meeting link: https://meet.google.com/abc-defg-hij'
    };
    const res = classifyRecruiterMessage(email);
    assert.strictEqual(res.category, 'INTERVIEW_INVITE');
    assert.ok(res.confidence >= 0.9);
    assert.strictEqual(res.isDecisionConfirmed, false, 'Interview invite is an operational event, not final hiring decision');
    assert.ok(res.extractedDates.meetingUrl.includes('meet.google.com'));
    assert.ok(res.extractedDates.scheduledDate.includes('November'));
  });

  // 7. Classification: Technical Assessment
  test('Classification: Technical assessment extracts platform URL and deadline', () => {
    const email = {
      subject: 'HackerRank Coding Challenge for OpenAI Software Engineer',
      body: 'Please complete your technical assessment within 5 days. Link: https://www.hackerrank.com/test/openai-eng-441'
    };
    const res = classifyRecruiterMessage(email);
    assert.strictEqual(res.category, 'TECHNICAL_ASSESSMENT');
    assert.ok(res.assessmentLinks.testUrls[0].includes('hackerrank.com'));
    assert.ok(res.assessmentLinks.deadline.includes('5 days'));
  });

  // 8. Classification: Formal Offer (Confirmed Decision)
  test('Classification: Formal job offer marks decision confirmed', () => {
    const email = {
      subject: 'Offer of Employment: Lead Platform Architect',
      body: 'Congratulations! We are pleased to offer you the position of Lead Platform Architect. Please find attached your formal offer letter.'
    };
    const res = classifyRecruiterMessage(email);
    assert.strictEqual(res.category, 'OFFER');
    assert.strictEqual(res.isDecisionConfirmed, true);
    assert.strictEqual(res.decisionStatus, 'CONFIRMED');
  });

  // 9. Classification: Rejection (Confirmed Decision)
  test('Classification: Rejection email marks decision confirmed', () => {
    const email = {
      subject: 'Status of your application at Vercel',
      body: 'Thank you for your time. Unfortunately, after careful consideration, we have decided to move forward with other candidates.'
    };
    const res = classifyRecruiterMessage(email);
    assert.strictEqual(res.category, 'REJECTION');
    assert.strictEqual(res.isDecisionConfirmed, true);
    assert.strictEqual(res.decisionStatus, 'CONFIRMED');
  });

  // 10. Reply Drafter: Zero Auto-Sending Policy
  test('Reply Drafter: Drafts contextual reply strictly marked DRAFT_PENDING_APPROVAL', () => {
    const draft = draftCandidateReply('INTERVIEW_INVITE', 'Arjun Sharma', 'Stripe');
    assert.strictEqual(draft.status, 'DRAFT_PENDING_APPROVAL');
    assert.ok(draft.draftText.includes('Arjun Sharma'));
    assert.ok(draft.draftText.includes('Stripe'));
    assert.ok(draft.draftText.includes('interview'));
  });

  // Database-backed integration tests
  await testAsync('Integration: Mailbox setup, message ingestion, application linking, and dedup ledger', async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'Email Test Tenant', subdomain: `email-test-${Date.now()}` }
    });
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `candidate-${Date.now()}@test.com`,
        passwordHash: 'hash123',
        name: 'Priya Patel'
      }
    });

    // Create an application to link against
    const app = await prisma.application.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        company: 'Canva',
        position: 'Full Stack Engineer',
        ats: 'greenhouse',
        url: 'https://boards.greenhouse.io/canva/jobs/12345',
        status: 'SUBMITTED_CONFIRMED',
        stage: 'APPLIED'
      }
    });

    // Connect Mailbox
    const encryptedAccess = encryptToken('mock_gmail_access_token');
    const mailbox = await prisma.mailboxConnection.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        provider: 'GMAIL',
        emailAddress: 'priya.candidate@gmail.com',
        encryptedAccessToken: encryptedAccess,
        scopes: JSON.stringify(PROVIDER_SCOPES.GMAIL),
        status: 'ACTIVE'
      }
    });

    const mockEmails = [
      {
        id: `msg-canva-invite-${Date.now()}`,
        senderEmail: 'recruiting@canva.com',
        senderName: 'Canva Talent Team',
        subject: 'Canva Interview: Full Stack Engineer',
        snippet: 'We would love to schedule a screening call on Thursday, Nov 5 at 3pm IST. Meeting: https://zoom.us/j/992817261',
        dateReceived: new Date()
      },
      {
        id: `msg-spam-${Date.now()}`,
        senderEmail: 'alerts@jobdigest.com',
        subject: 'Daily Job Digest: 50 open jobs for you (Unsubscribe)',
        snippet: 'Check out today\'s trending jobs.',
        dateReceived: new Date()
      }
    ];

    // First batch execution
    const batch1 = await processEmailBatch(mailbox.id, user.id, tenant.id, mockEmails);
    assert.strictEqual(batch1.total, 2);
    assert.strictEqual(batch1.processed, 1, 'Only genuine recruiter email should be processed');
    assert.strictEqual(batch1.ignoredNonRecruiter, 1, 'Spam digest should be filtered');

    // Verify application link and stage transition
    const updatedApp = await prisma.application.findUnique({ where: { id: app.id } });
    assert.strictEqual(updatedApp.stage, 'INTERVIEWING', 'Application stage should transition to INTERVIEWING');

    // Verify message persistence
    const savedMsg = await prisma.recruiterMessage.findFirst({
      where: { applicationId: app.id }
    });
    assert.ok(savedMsg, 'Recruiter message must be linked to Canva application');
    assert.strictEqual(savedMsg.category, 'INTERVIEW_INVITE');
    assert.strictEqual(savedMsg.draftReplyStatus, 'DRAFT_PENDING_APPROVAL');

    // Second batch execution with same emails (Deduplication Check)
    const batch2 = await processEmailBatch(mailbox.id, user.id, tenant.id, mockEmails);
    assert.strictEqual(batch2.processed, 0, 'Zero messages should be re-processed');
    assert.strictEqual(batch2.skippedDuplicate, 2, 'Both messages must be skipped by dedup ledger');

    // User-controlled Mailbox Disconnection
    const disconnected = await disconnectMailbox(mailbox.id, user.id, tenant.id);
    assert.strictEqual(disconnected.status, 'DISCONNECTED');
    assert.strictEqual(disconnected.encryptedAccessToken, '', 'Access token must be zeroed upon disconnection');

    // Clean up
    await prisma.recruiterMessage.deleteMany({ where: { mailboxId: mailbox.id } });
    await prisma.emailDedupLedger.deleteMany({ where: { mailboxId: mailbox.id } });
    await prisma.mailboxConnection.delete({ where: { id: mailbox.id } });
    await prisma.applicationEvent.deleteMany({ where: { applicationId: app.id } });
    await prisma.application.delete({ where: { id: app.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  console.log('\n================================================================');
  console.log(`>> [FEAT-011 SUITE COMPLETE] Passed: ${passed}, Failed: ${failed}`);
  console.log('================================================================\n');

  return { suite: 'FEAT-011 Recruiter Email Intelligence', passed, failed, category: 'Integration' };
}

if (require.main === module) {
  runFeat011Tests()
    .then(r => process.exit(r.failed > 0 ? 1 : 0))
    .catch(err => {
      console.error('Fatal in test runner:', err);
      process.exit(1);
    });
}

module.exports = { runFeat011Tests };
