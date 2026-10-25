// Rolevia AI · Recruiter Email Intelligence Agent (FEAT-011 / AGENT-011)
// Autonomously ingests, classifies, and links recruiter communications while strictly
// enforcing candidate privacy, token encryption at rest, and zero unapproved email replies.

const crypto = require('crypto');
const prisma = require('./db');

// Encryption Secret for Tokens at Rest (AES-256-GCM)
const ENCRYPTION_SECRET = process.env.EMAIL_ENCRYPTION_SECRET || process.env.JWT_SECRET || 'rolevia_ai_default_email_encryption_key_2026_32bytes!';
const ENCRYPTION_KEY = crypto.scryptSync(ENCRYPTION_SECRET, 'rolevia_email_salt_2026', 32);

/**
 * Encrypt sensitive OAuth tokens using AES-256-GCM
 */
function encryptToken(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt sensitive OAuth tokens
 */
function decryptToken(cipherText) {
  if (!cipherText) return null;
  const parts = cipherText.split(':');
  if (parts.length !== 3) throw new Error('MALFORMED_ENCRYPTED_TOKEN');
  const [ivHex, authTagHex, encryptedHex] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Minimum Scopes Required per Provider
const PROVIDER_SCOPES = {
  GMAIL: ['https://www.googleapis.com/auth/gmail.readonly'],
  OUTLOOK: ['Mail.Read', 'offline_access'],
  IMAP: ['read_only']
};

/**
 * Generate OAuth2 Authorization URL
 */
function getOAuthAuthorizationUrl(provider, redirectUri, stateToken) {
  const prov = (provider || '').toUpperCase();
  if (prov === 'GMAIL') {
    const scopes = encodeURIComponent(PROVIDER_SCOPES.GMAIL.join(' '));
    const redirect = encodeURIComponent(redirectUri);
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GMAIL_CLIENT_ID || 'mock_gmail_client_id'}&redirect_uri=${redirect}&response_type=code&scope=${scopes}&access_type=offline&prompt=consent&state=${stateToken}`;
  } else if (prov === 'OUTLOOK') {
    const scopes = encodeURIComponent(PROVIDER_SCOPES.OUTLOOK.join(' '));
    const redirect = encodeURIComponent(redirectUri);
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${process.env.OUTLOOK_CLIENT_ID || 'mock_outlook_client_id'}&response_type=code&redirect_uri=${redirect}&response_mode=query&scope=${scopes}&state=${stateToken}`;
  }
  throw new Error(`UNSUPPORTED_PROVIDER: ${provider}`);
}

/**
 * Recruiter Email Detection Heuristics
 * Filters out spam, newsletters, automated aggregators, and marketing digests.
 */
function isRecruiterEmail(email) {
  const subject = (email.subject || '').toLowerCase();
  const from = (email.senderEmail || email.from || '').toLowerCase();
  const body = (email.body || email.snippet || '').toLowerCase();

  // Instant negative filters (job alerts, marketing, spam)
  const spamKeywords = [
    'unsubscribe', 'job alert', 'jobs you may like', 'recommended jobs for you',
    'daily digest', 'weekly digest', 'newsletter', 'privacy policy update',
    'security alert', 'terms of service', 'billing statement', 'invoice'
  ];
  if (spamKeywords.some(kw => subject.includes(kw))) {
    return { isRecruiter: false, reason: 'SPAM_OR_DIGEST' };
  }

  // Known recruitment platforms or human recruiter signals
  const recruiterSignals = [
    'interview', 'application', 'requisition', 'hiring team', 'recruiter',
    'talent acquisition', 'offer', 'assessment', 'coding challenge', 'screening call',
    'next steps', 'role at', 'status of your application', 'technical test'
  ];

  const matchedSignals = recruiterSignals.filter(sig => subject.includes(sig) || body.includes(sig));
  if (matchedSignals.length > 0) {
    return { isRecruiter: true, signals: matchedSignals };
  }

  return { isRecruiter: false, reason: 'NO_RECRUITMENT_SIGNALS' };
}

/**
 * Classify Recruiter Message Content
 */
function classifyRecruiterMessage(email) {
  const rawSubject = email.subject || '';
  const rawBody = email.body || email.snippet || '';
  const subject = rawSubject.toLowerCase();
  const body = rawBody.toLowerCase();

  let category = 'GENERAL';
  let confidence = 0.75;
  let isDecisionConfirmed = false;
  let decisionStatus = 'INFERRED';
  let extractedDates = null;
  let assessmentLinks = null;

  // 1. Technical Assessment / Coding Test
  if (
    body.includes('hackerrank') || body.includes('codility') || body.includes('leetcode') ||
    body.includes('karat') || body.includes('coding challenge') || body.includes('take-home') ||
    body.includes('technical assessment') || subject.includes('assessment') || subject.includes('coding test')
  ) {
    category = 'TECHNICAL_ASSESSMENT';
    confidence = 0.95;
    // Extract assessment URLs
    const urlMatches = rawBody.match(/https?:\/\/[^\s"'<>]*(?:hackerrank|codility|leetcode|karat|codesignal)[^\s"'<>]*/gi);
    const deadlineMatch = rawBody.match(/(?:deadline|complete by|within)[\s:]+([^\n.]+)/i);
    assessmentLinks = {
      testUrls: urlMatches || [],
      deadline: deadlineMatch ? deadlineMatch[1].trim() : null
    };
  }
  // 2. Formal Offer
  else if (
    body.includes('offer letter') || body.includes('pleased to offer you') ||
    subject.includes('offer of employment') || (body.includes('congratulations') && body.includes('offer'))
  ) {
    category = 'OFFER';
    confidence = 0.98;
    isDecisionConfirmed = true;
    decisionStatus = 'CONFIRMED';
  }
  // 3. Rejection
  else if (
    body.includes('moved forward with other candidates') || body.includes('decided not to move forward') ||
    body.includes('not moving forward') || body.includes('pursue other candidates') ||
    body.includes('regret to inform') || body.includes('not selected for') ||
    (body.includes('thank you for your time') && body.includes('unfortunately'))
  ) {
    category = 'REJECTION';
    confidence = 0.95;
    isDecisionConfirmed = true;
    decisionStatus = 'CONFIRMED';
  }
  // 4. Interview Invitation
  else if (
    subject.includes('interview') || body.includes('invitation to interview') ||
    body.includes('schedule a call') || body.includes('chat with the team') ||
    body.includes('screening call') || body.includes('calendly.com') ||
    body.includes('zoom.us') || body.includes('meet.google.com') || body.includes('teams.microsoft.com')
  ) {
    category = 'INTERVIEW_INVITE';
    confidence = 0.92;
    // Extract dates, times, and meeting URLs
    const dateMatch = rawBody.match(/(?:on|for)\s+([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+at\s+[\d:apm\sA-Z]+)?)/i);
    const meetingUrl = rawBody.match(/https?:\/\/[^\s"'<>]*(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com|calendly\.com)[^\s"'<>]*/i);
    extractedDates = {
      scheduledDate: dateMatch ? dateMatch[1].trim() : null,
      meetingUrl: meetingUrl ? meetingUrl[0] : null
    };
  }
  // 5. Status Update
  else if (
    body.includes('application is under review') || body.includes('update regarding your application') ||
    body.includes('received your application')
  ) {
    category = 'STATUS_UPDATE';
    confidence = 0.85;
  }

  return {
    category,
    confidence,
    isDecisionConfirmed,
    decisionStatus,
    extractedDates,
    assessmentLinks
  };
}

/**
 * Link Message to an Existing Application in PostgreSQL
 */
async function linkMessageToApplication(message, userId, tenantId) {
  const applications = await prisma.application.findMany({
    where: { userId, tenantId }
  });

  if (!applications || applications.length === 0) return null;

  const senderEmail = (message.senderEmail || '').toLowerCase();
  const subject = (message.subject || '').toLowerCase();
  const body = (message.body || message.snippet || '').toLowerCase();

  for (const app of applications) {
    const comp = (app.company || '').toLowerCase();
    const pos = (app.position || '').toLowerCase();

    // Check if company name appears in sender email domain or subject/body
    const compClean = comp.replace(/[^a-z0-9]/g, '');
    const senderDomain = senderEmail.split('@')[1] || '';

    if (
      (compClean.length > 2 && senderDomain.includes(compClean)) ||
      subject.includes(comp) ||
      (body.includes(comp) && (subject.includes(pos) || body.includes(pos)))
    ) {
      return app.id;
    }
  }

  return null;
}

/**
 * Generate a Context-Aware Professional Draft Reply
 * INVARIANT: Never sent automatically. Marked DRAFT_PENDING_APPROVAL.
 */
function draftCandidateReply(category, candidateName, companyName, extractedData) {
  const name = candidateName || 'Candidate';
  const comp = companyName || 'the team';

  if (category === 'INTERVIEW_INVITE') {
    return {
      draftText: `Hi ${comp} Recruiting Team,\n\nThank you for inviting me to interview! I am excited about the opportunity and look forward to discussing how my experience aligns with the role. I am available at the proposed time and have added the meeting to my calendar.\n\nBest regards,\n${name}`,
      status: 'DRAFT_PENDING_APPROVAL'
    };
  } else if (category === 'TECHNICAL_ASSESSMENT') {
    return {
      draftText: `Hi ${comp} Team,\n\nThank you for sharing the technical assessment. I have received the challenge and will complete and submit it prior to the stated deadline.\n\nBest regards,\n${name}`,
      status: 'DRAFT_PENDING_APPROVAL'
    };
  } else if (category === 'OFFER') {
    return {
      draftText: `Dear ${comp} Team,\n\nThank you so much for extending this offer! I am thrilled at the prospect of joining your team. I will review the formal terms in detail and get back to you shortly.\n\nWarm regards,\n${name}`,
      status: 'DRAFT_PENDING_APPROVAL'
    };
  }

  return {
    draftText: `Hi ${comp} Team,\n\nThank you for the update regarding my application. Please let me know if you need any additional information from my side.\n\nBest regards,\n${name}`,
    status: 'DRAFT_PENDING_APPROVAL'
  };
}

/**
 * Process Raw Incoming Email Batch
 * Handles deduplication, classification, application linking, and persistence.
 */
async function processEmailBatch(mailboxId, userId, tenantId, emails) {
  const results = {
    total: emails.length,
    processed: 0,
    skippedDuplicate: 0,
    ignoredNonRecruiter: 0,
    messages: []
  };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true }
  });

  for (const rawEmail of emails) {
    const providerMessageId = rawEmail.id || rawEmail.providerMessageId;
    if (!providerMessageId) continue;

    // 1. Deduplication check
    const existing = await prisma.emailDedupLedger.findUnique({
      where: { providerMessageId }
    });
    if (existing) {
      results.skippedDuplicate++;
      continue;
    }

    // 2. Recruiter relevance filter
    const check = isRecruiterEmail(rawEmail);
    if (!check.isRecruiter) {
      // Record in dedup ledger so we don't inspect spam twice
      await prisma.emailDedupLedger.create({
        data: { providerMessageId, mailboxId }
      });
      results.ignoredNonRecruiter++;
      continue;
    }

    // 3. Classify message
    const classification = classifyRecruiterMessage(rawEmail);

    // 4. Link to existing application
    const linkedAppId = await linkMessageToApplication(rawEmail, userId, tenantId);

    // 5. Generate draft reply (Pending candidate approval)
    const draft = draftCandidateReply(
      classification.category,
      user ? user.name : 'Candidate',
      rawEmail.company || rawEmail.senderName,
      classification.extractedDates || classification.assessmentLinks
    );

    // 6. Persist message in PostgreSQL
    const saved = await prisma.recruiterMessage.create({
      data: {
        tenantId,
        userId,
        mailboxId,
        applicationId: linkedAppId,
        providerMessageId,
        threadId: rawEmail.threadId || null,
        senderEmail: rawEmail.senderEmail || rawEmail.from || 'unknown@recruiter.com',
        senderName: rawEmail.senderName || null,
        subject: rawEmail.subject || '(No Subject)',
        snippet: rawEmail.snippet || '',
        bodyCleaned: (rawEmail.body || rawEmail.snippet || '').substring(0, 10000),
        dateReceived: rawEmail.dateReceived ? new Date(rawEmail.dateReceived) : new Date(),
        category: classification.category,
        confidence: classification.confidence,
        isDecisionConfirmed: classification.isDecisionConfirmed,
        decisionStatus: classification.decisionStatus,
        extractedDates: classification.extractedDates,
        assessmentLinks: classification.assessmentLinks,
        draftReply: draft.draftText,
        draftReplyStatus: draft.status,
        metadata: {
          signals: check.signals,
          rawHeaders: rawEmail.headers || null
        }
      }
    });

    // 7. Record in Dedup Ledger
    await prisma.emailDedupLedger.create({
      data: { providerMessageId, mailboxId }
    });

    // 8. If linked and confirmed/interview, update application stage
    if (linkedAppId) {
      let nextStage = null;
      if (classification.category === 'INTERVIEW_INVITE') nextStage = 'INTERVIEWING';
      else if (classification.category === 'OFFER') nextStage = 'OFFER';
      else if (classification.category === 'REJECTION') nextStage = 'REJECTED';

      if (nextStage) {
        await prisma.application.update({
          where: { id: linkedAppId },
          data: { stage: nextStage }
        });
        await prisma.applicationEvent.create({
          data: {
            applicationId: linkedAppId,
            fromStatus: 'APPLIED',
            toStatus: nextStage,
            eventType: 'RECRUITER_EMAIL_DETECTED',
            payload: {
              category: classification.category,
              messageId: saved.id,
              decisionStatus: classification.decisionStatus
            }
          }
        });
      }
    }

    results.processed++;
    results.messages.push(saved);
  }

  // Update mailbox sync timestamp
  await prisma.mailboxConnection.update({
    where: { id: mailboxId },
    data: { lastSyncedAt: new Date() }
  });

  return results;
}

/**
 * Disconnect Mailbox and Securely Zero Tokens
 */
async function disconnectMailbox(mailboxId, userId, tenantId) {
  const mailbox = await prisma.mailboxConnection.findFirst({
    where: { id: mailboxId, userId, tenantId }
  });

  if (!mailbox) {
    throw new Error('MAILBOX_NOT_FOUND_OR_UNAUTHORIZED');
  }

  return await prisma.mailboxConnection.update({
    where: { id: mailboxId },
    data: {
      status: 'DISCONNECTED',
      encryptedAccessToken: '',
      encryptedRefreshToken: null,
      lastError: 'User disconnected mailbox'
    }
  });
}

module.exports = {
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
};
