// Rolevia AI · FEAT-008: Interactive Resume Optimization Workspace
// Architecture: Original vs Tailored Diff, Per-Bullet Accept/Reject, Inline Editing,
// Missing Qualification Explanations, Source-Fact Evidence Inspection, Cryptographic Sign-Off,
// Multi-Format Binary Exporters (PDF & DOCX), and Version History Management.

const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const prisma = require('./db');
const resumeOptimizer = require('./resumeOptimizer');
const { parseJobRequirements, normalizeSkill } = require('./jobMatcher');

// In-memory version registry for interactive sessions (synced to PostgreSQL Application when approved)
const workspaceVersionRegistry = new Map();

/**
 * Builds a structured, interactive comparison workspace between original candidate facts and tailored proposal.
 * Binds workspace to authenticated user, tenant, and optional application session.
 */
function buildOptimizationWorkspace({ candidateProfile, verifiedFacts = [], job, options = {}, userId, tenantId, applicationId }) {
  if (!candidateProfile || !job) {
    throw new Error('candidateProfile and target job requisition are required');
  }

  // Generate truth-grounded optimized resume via FEAT-007 engine
  const optimizationResult = resumeOptimizer.optimizeResumeAndCoverLetter({
    candidateProfile,
    verifiedFacts,
    job,
    options
  });

  const user = candidateProfile.user || candidateProfile;
  const rawSkills = Array.isArray(candidateProfile.skills)
    ? candidateProfile.skills
    : (typeof candidateProfile.skills === 'string' ? JSON.parse(candidateProfile.skills || '[]') : []);

  const jobReqs = parseJobRequirements(job);
  const candidateSkillSet = new Set(rawSkills.map(s => normalizeSkill(s)));

  // 1. Missing Qualifications & Gap Analysis
  const missingRequired = (jobReqs.requiredSkills || []).filter(s => !candidateSkillSet.has(normalizeSkill(s)));
  const missingPreferred = (jobReqs.preferredSkills || []).filter(s => !candidateSkillSet.has(normalizeSkill(s)));

  const missingQualificationsExplanation = {
    missingRequiredSkills: missingRequired.map(skill => ({
      skill,
      importance: 'CRITICAL',
      explanation: `Target job specifies '${skill}' as a required competency. Candidate profile currently lacks verified FactStore evidence for this skill.`
    })),
    missingPreferredSkills: missingPreferred.map(skill => ({
      skill,
      importance: 'RECOMMENDED',
      explanation: `Target job lists '${skill}' as preferred. Adding verified experience in this area would boost compatibility.`
    })),
    overallAlignmentNote: missingRequired.length === 0
      ? 'Candidate meets 100% of required technical competencies.'
      : `Candidate lacks ${missingRequired.length} required skill(s). Optimization preserves truthful representation without inventing missing capabilities.`
  };

  // 2. Section-by-Section Diff Construction
  const sections = [];

  // Summary Diff
  const originalSummary = `Experienced ${user.roleTitle || 'Software Engineer'} with background in ${rawSkills.slice(0, 4).join(', ')}.`;
  const optimizedSummary = optimizationResult.optimizedResume.sections.summary;
  sections.push({
    sectionId: 'sec-summary',
    title: 'Professional Summary',
    items: [
      {
        itemId: 'item-summary-1',
        type: 'SUMMARY',
        originalText: originalSummary,
        optimizedText: optimizedSummary,
        status: 'TAILORED',
        sourceFactId: 'profile-master-summary',
        sourceEvidence: 'Synthesized from verified role title, years experience, and top aligned skills',
        isAccepted: true,
        customText: null
      }
    ]
  });

  // Technical Skills Diff
  const jobAlignedSkills = optimizationResult.optimizedResume.sections.technicalSkills.jobAligned;
  const additionalSkills = optimizationResult.optimizedResume.sections.technicalSkills.additional;
  sections.push({
    sectionId: 'sec-skills',
    title: 'Technical Skills Prioritization',
    items: [
      {
        itemId: 'item-skills-core',
        type: 'SKILLS_CORE',
        originalText: rawSkills.join(', '),
        optimizedText: jobAlignedSkills.join(', '),
        status: 'TAILORED',
        sourceFactId: 'profile-skills-store',
        sourceEvidence: 'Prioritized candidate skills that match target job requirements',
        isAccepted: true,
        customText: null
      }
    ]
  });

  // Work Experience Diff with Per-Bullet Lineage
  const expSections = optimizationResult.optimizedResume.sections.workExperience.map((exp, expIdx) => {
    const originalFact = verifiedFacts.find(f => f.title === exp.title || f.organization === exp.organization);
    let originalHighlights = [];
    if (originalFact) {
      try {
        originalHighlights = Array.isArray(originalFact.highlights) ? originalFact.highlights : JSON.parse(originalFact.highlights || '[]');
      } catch { originalHighlights = [originalFact.highlights]; }
    }

    const items = exp.claims.map((claim, bulletIdx) => {
      const origText = originalHighlights[bulletIdx] || claim.claimText;
      return {
        itemId: `item-bullet-${expIdx}-${bulletIdx}`,
        type: 'EXPERIENCE_BULLET',
        originalText: origText,
        optimizedText: claim.claimText,
        status: origText === claim.claimText ? 'UNCHANGED' : 'TAILORED',
        sourceFactId: claim.sourceFactId,
        sourceEvidence: `FactStore [${claim.sourceOrganization || exp.organization}] · Metrics: ${claim.verifiedMetrics?.join(', ') || 'N/A'}`,
        matchedJobSkills: claim.matchedJobSkills || [],
        isAccepted: true,
        customText: null
      };
    });

    return {
      sectionId: `sec-exp-${expIdx}`,
      title: `Experience · ${exp.organization} (${exp.title})`,
      dates: exp.dates,
      items
    };
  });
  sections.push(...expSections);

  const workspaceId = `ws-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const effectiveUserId = userId || candidateProfile.userId || candidateProfile.id || user.id;
  const effectiveTenantId = tenantId || (candidateProfile.user && candidateProfile.user.tenantId) || candidateProfile.tenantId || 'tenant-rolevia-default';
  const effectiveAppId = applicationId || options.applicationId || null;

  const workspaceData = {
    workspaceId,
    userId: effectiveUserId,
    tenantId: effectiveTenantId,
    applicationId: effectiveAppId,
    candidateProfileId: candidateProfile.id || user.id,
    jobId: job.id,
    targetJob: {
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location
    },
    versionMetadata: optimizationResult.versionMetadata,
    scoringBreakdown: optimizationResult.scoringBreakdown,
    missingQualificationsExplanation,
    sections,
    coverLetter: optimizationResult.coverLetter,
    evidenceLedger: optimizationResult.evidenceLedger,
    verifiedFacts,
    status: 'PENDING_APPROVAL',
    approvalRecord: null
  };

  // Cache in workspace registry
  workspaceVersionRegistry.set(workspaceId, workspaceData);

  // Background persistence if application is linked
  if (effectiveAppId) {
    persistWorkspaceSession(workspaceData).catch(err => {
      console.warn(`[Rolevia Workspace] Initial DB sync deferred: ${err.message}`);
    });
  }

  return workspaceData;
}

/**
 * Invalidates any existing candidate approval when document contents or decisions change.
 */
function invalidateWorkspaceApproval(workspaceId, reason = 'CONTENT_MUTATED_POST_APPROVAL') {
  const workspace = workspaceVersionRegistry.get(workspaceId);
  if (!workspace) return false;

  if (workspace.approvalRecord) {
    workspace.approvalRecord.revoked = true;
    workspace.approvalRecord.revokedAt = new Date().toISOString();
    workspace.approvalRecord.revocationReason = reason;
    workspace.revokedApprovals = workspace.revokedApprovals || [];
    workspace.revokedApprovals.push({ ...workspace.approvalRecord });
    workspace.approvalRecord = null;
  }
  workspace.status = 'PENDING_APPROVAL';

  if (workspace.applicationId) {
    prisma.application.updateMany({
      where: { id: workspace.applicationId },
      data: { status: 'DRAFT' }
    }).catch(() => {});
  }

  return true;
}

/**
 * Applies candidate's line-by-line decisions, incorporates inline custom edits,
 * enforces semantic evidence and skill truth grounding on custom edits,
 * and computes cryptographic candidate approval signature.
 */
function applyCandidateWorkspaceDecisions({
  workspaceId,
  decisions = {},      // { [itemId]: boolean } -> true = accept, false = revert to original
  customEdits = {},    // { [itemId]: string }  -> candidate manual edit text
  candidateSecret = 'rolevia-candidate-approval-gate',
  approvedBy = 'Candidate',
  applicationId = null
}) {
  const workspace = workspaceVersionRegistry.get(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace session '${workspaceId}' not found or expired`);
  }

  // If already approved, invalidate prior approval token to guarantee invariant
  if (workspace.status === 'APPROVED' || workspace.approvalRecord) {
    invalidateWorkspaceApproval(workspaceId, 'RE_APPROVAL_REQUESTED');
  }

  let acceptedCount = 0;
  let rejectedCount = 0;
  let customEditCount = 0;

  const factsMap = new Map((workspace.verifiedFacts || []).map(f => [f.id, f]));

  // Process all items across sections
  for (const sec of workspace.sections) {
    for (const item of sec.items) {
      // 1. Process Accept / Reject Decision
      if (decisions[item.itemId] !== undefined) {
        item.isAccepted = Boolean(decisions[item.itemId]);
      }
      if (item.isAccepted) {
        acceptedCount++;
      } else {
        rejectedCount++;
      }

      // 2. Process Custom Inline Edits
      if (customEdits[item.itemId] && typeof customEdits[item.itemId] === 'string') {
        const edited = customEdits[item.itemId].trim();
        if (edited) {
          // A. Verify that custom edit does not introduce ungrounded skills
          const mentionedSkills = resumeOptimizer.extractMentionedSkills(edited);
          const verifiedBundle = {
            verifiedSkills: workspace.versionMetadata.verifiedSkills || [],
            rawFactText: workspace.evidenceLedger.map(e => e.claimText).join(' ')
          };
          
          for (const s of mentionedSkills) {
            const norm = normalizeSkill(s);
            const inSkills = (verifiedBundle.verifiedSkills || []).some(vs => normalizeSkill(vs) === norm);
            const inFact = verifiedBundle.rawFactText.toLowerCase().includes(norm);
            if (!inSkills && !inFact) {
              throw new resumeOptimizer.HallucinationViolationError(
                `Custom edit contains ungrounded skill '${s}'. All edits must be grounded in verified candidate facts.`,
                [{ type: 'UNGROUNDED_EDIT_SKILL', claim: s }]
              );
            }
          }

          // B. Semantic Claim Assertion Validation:
          // Check that custom edit does not introduce ungrounded metrics, SLAs, causal claims or title inflation
          if (item.sourceFactId) {
            const sourceFact = factsMap.get(item.sourceFactId);
            if (sourceFact) {
              const semanticViolations = resumeOptimizer.validateSemanticClaimAssertions(edited, sourceFact);
              if (semanticViolations.length > 0) {
                throw new resumeOptimizer.HallucinationViolationError(
                  `Custom edit contains ungrounded semantic assertion(s) not supported by source fact [${sourceFact.organization || sourceFact.title}].`,
                  semanticViolations
                );
              }
            }
          }

          item.customText = edited;
          customEditCount++;
        }
      }
    }
  }

  // Assemble Final Approved Document Text
  let approvedMarkdown = `# Candidate Résumé\n\n`;
  for (const sec of workspace.sections) {
    approvedMarkdown += `## ${sec.title.toUpperCase()}\n`;
    for (const item of sec.items) {
      let lineText = '';
      if (item.customText) {
        lineText = item.customText;
      } else if (item.isAccepted) {
        lineText = item.optimizedText;
      } else {
        lineText = item.originalText; // Reverted to candidate's original text
      }

      if (item.type === 'EXPERIENCE_BULLET') {
        approvedMarkdown += `- ${lineText}\n`;
      } else {
        approvedMarkdown += `${lineText}\n\n`;
      }
    }
    approvedMarkdown += '\n';
  }

  // Generate Cryptographic HMAC Approval Signature with Strict Entity & Expiry Binding
  const timestamp = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30-day expiration window
  const documentHash = `sha256:${crypto.createHash('sha256').update(approvedMarkdown).digest('hex')}`;
  const effectiveAppId = applicationId || workspace.applicationId || 'app-direct';
  const versionId = workspace.versionMetadata.version || 'v2.0.0';
  const userId = workspace.userId || workspace.candidateProfileId;
  const tenantId = workspace.tenantId || 'tenant-rolevia-default';

  const signaturePayload = `${userId}|${tenantId}|${effectiveAppId}|${versionId}|${documentHash}|${timestamp}|${expiresAt}`;
  const approvalSignature = crypto
    .createHmac('sha256', candidateSecret)
    .update(signaturePayload)
    .digest('hex');

  const approvalRecord = {
    approvalId: `appr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    userId,
    tenantId,
    applicationId: effectiveAppId,
    versionId,
    timestamp,
    expiresAt,
    approvedBy,
    approvalSignature,
    signatureAlgorithm: 'HMAC-SHA256',
    documentHash,
    stats: {
      totalItems: acceptedCount + rejectedCount,
      acceptedCount,
      rejectedCount,
      customEditCount
    },
    revoked: false,
    status: 'DIFF_APPROVED'
  };

  workspace.status = 'APPROVED';
  workspace.approvalRecord = approvalRecord;
  workspace.approvedMarkdown = approvedMarkdown;
  if (applicationId) workspace.applicationId = applicationId;

  // Persist to PostgreSQL
  persistWorkspaceSession(workspace).catch(err => {
    console.warn(`[Rolevia Workspace] Background PostgreSQL persistence warning: ${err.message}`);
  });

  return {
    success: true,
    workspaceId,
    status: 'DIFF_APPROVED',
    approvalRecord,
    approvedMarkdown,
    exportPayload: {
      markdown: approvedMarkdown,
      plainText: approvedMarkdown.replace(/[#*`_-]/g, ''),
      documentHash: approvalRecord.documentHash,
      approvalSignature,
      expiresAt
    }
  };
}

/**
 * Verifies that a given approval signature was created by the candidate,
 * is not expired, is not revoked, and that document text has not been tampered with.
 */
function verifyApprovalSignature(approvalRecord, candidateSecret = 'rolevia-candidate-approval-gate', currentDocumentText = null) {
  if (!approvalRecord || !approvalRecord.approvalSignature) {
    return { valid: false, error: 'MISSING_APPROVAL_RECORD' };
  }

  if (approvalRecord.revoked) {
    return { valid: false, error: 'APPROVAL_REVOKED', reason: approvalRecord.revocationReason || 'Approval was invalidated' };
  }

  if (approvalRecord.expiresAt && new Date(approvalRecord.expiresAt).getTime() < Date.now()) {
    return { valid: false, error: 'APPROVAL_EXPIRED', expiresAt: approvalRecord.expiresAt };
  }

  if (currentDocumentText) {
    const currentHash = `sha256:${crypto.createHash('sha256').update(currentDocumentText).digest('hex')}`;
    if (currentHash !== approvalRecord.documentHash) {
      return { valid: false, error: 'DOCUMENT_TAMPERED', expectedHash: approvalRecord.documentHash, actualHash: currentHash };
    }
  }

  const payload = `${approvalRecord.userId}|${approvalRecord.tenantId}|${approvalRecord.applicationId || 'app-direct'}|${approvalRecord.versionId}|${approvalRecord.documentHash}|${approvalRecord.timestamp}|${approvalRecord.expiresAt}`;
  const expectedSig = crypto.createHmac('sha256', candidateSecret).update(payload).digest('hex');

  try {
    const isSigMatch = crypto.timingSafeEqual(
      Buffer.from(approvalRecord.approvalSignature, 'utf8'),
      Buffer.from(expectedSig, 'utf8')
    );
    if (!isSigMatch) {
      return { valid: false, error: 'INVALID_SIGNATURE' };
    }
  } catch {
    return { valid: false, error: 'INVALID_SIGNATURE' };
  }

  return { valid: true };
}

/**
 * Minimal in-memory PKZip generator for valid Office Open XML (.docx) archives
 */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (-(c & 1) & 0xedb88320);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createZipArchive(files) {
  const localParts = [];
  const cdParts = [];
  let offset = 0;

  for (const file of files) {
    const data = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
    const compressed = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(file.path, 'utf8');
    const crc = crc32(data);

    // Local file header (30 bytes)
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // signature
    lh.writeUInt16LE(20, 4);         // version needed (2.0)
    lh.writeUInt16LE(0, 6);          // flags
    lh.writeUInt16LE(8, 8);          // compression (deflate)
    lh.writeUInt16LE(0, 10);         // mod time
    lh.writeUInt16LE(0, 12);         // mod date
    lh.writeUInt32LE(crc, 14);       // crc32
    lh.writeUInt32LE(compressed.length, 18); // comp size
    lh.writeUInt32LE(data.length, 22);       // uncomp size
    lh.writeUInt16LE(nameBuf.length, 26);    // name len
    lh.writeUInt16LE(0, 28);                 // extra len

    localParts.push(lh, nameBuf, compressed);

    // Central directory header (46 bytes)
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(8, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(compressed.length, 20);
    cdh.writeUInt32LE(data.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offset, 42);

    cdParts.push(cdh, nameBuf);
    offset += 30 + nameBuf.length + compressed.length;
  }

  const cdBuf = Buffer.concat(cdParts);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, cdBuf, eocd]);
}

function escapeXml(unsafe) {
  return (unsafe || '').replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= maxChars) {
      cur = (cur + ' ' + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Generates verified binary vector PDF and binary DOCX documents for ATS export.
 */
async function exportWorkspaceBinaryDocument({ workspaceId, format = 'pdf' }) {
  let workspace = workspaceVersionRegistry.get(workspaceId);
  if (!workspace) {
    workspace = await loadWorkspaceSession(workspaceId);
  }
  if (!workspace) {
    throw new Error(`Workspace session '${workspaceId}' not found`);
  }

  const approvedMarkdown = workspace.approvedMarkdown || `# Candidate Résumé\n\nOptimized Resume Pending Candidate Final Sign-off`;
  const approvalRecord = workspace.approvalRecord;
  const companySlug = (workspace.targetJob?.company || 'job').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  if (format === 'pdf') {
    const basePdfPath = require('node:path').join(__dirname, '..', 'Sameer_Ali_Khan_Resume.pdf');
    let pdfDoc = null;
    if (require('node:fs').existsSync(basePdfPath)) {
      const baseBytes = require('node:fs').readFileSync(basePdfPath);
      pdfDoc = await PDFDocument.load(baseBytes);
      while (pdfDoc.getPageCount() > 0) pdfDoc.removePage(0);
    } else {
      pdfDoc = await PDFDocument.create();
    }

    let page = pdfDoc.addPage([612, 792]);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const lines = approvedMarkdown.split('\n');
    let y = 740;
    const margin = 50;
    const lineHeight = 14;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        y -= 8;
        continue;
      }

      if (y < 60) {
        page = pdfDoc.addPage([612, 792]);
        y = 740;
      }

      if (line.startsWith('# ')) {
        page.drawText(line.replace(/^#\s+/, ''), {
          x: margin,
          y,
          size: 15,
          font: fontBold,
          color: rgb(0.1, 0.1, 0.1)
        });
        y -= 18;
      } else if (line.startsWith('## ')) {
        y -= 6;
        page.drawText(line.replace(/^##\s+/, ''), {
          x: margin,
          y,
          size: 11,
          font: fontBold,
          color: rgb(0.15, 0.25, 0.45)
        });
        y -= 16;
      } else if (line.startsWith('- ')) {
        const bulletText = line.replace(/^-\s+/, '');
        const wrapped = wrapText(bulletText, 85);
        for (let i = 0; i < wrapped.length; i++) {
          if (y < 60) {
            page = pdfDoc.addPage([612, 792]);
            y = 740;
          }
          const prefix = i === 0 ? '- ' : '  ';
          page.drawText(`${prefix}${wrapped[i]}`, {
            x: margin + 10,
            y,
            size: 9.5,
            font: fontRegular,
            color: rgb(0.2, 0.2, 0.2)
          });
          y -= lineHeight;
        }
      } else {
        const wrapped = wrapText(line, 90);
        for (const w of wrapped) {
          if (y < 60) {
            page = pdfDoc.addPage([612, 792]);
            y = 740;
          }
          page.drawText(w, {
            x: margin,
            y,
            size: 9.5,
            font: fontRegular,
            color: rgb(0.25, 0.25, 0.25)
          });
          y -= lineHeight;
        }
      }
    }

    // Draw Cryptographic Approval Audit Stamp
    if (approvalRecord) {
      if (y < 80) page = pdfDoc.addPage([612, 792]), y = 740;
      y -= 15;
      page.drawLine({
        start: { x: margin, y: y + 10 },
        end: { x: 562, y: y + 10 },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8)
      });
      page.drawText('VERIFIED BY ROLEVIA AI - CANDIDATE SIGN-OFF GATE', {
        x: margin,
        y,
        size: 7,
        font: fontBold,
        color: rgb(0.2, 0.5, 0.3)
      });
      y -= 10;
      page.drawText(`Hash: ${approvalRecord.documentHash} | Approved: ${approvalRecord.timestamp} | Signer: ${approvalRecord.approvedBy}`, {
        x: margin,
        y,
        size: 6.5,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.4)
      });
      y -= 9;
      page.drawText(`HMAC-SHA256 Token: ${approvalRecord.approvalSignature.slice(0, 32)}... (Expires: ${approvalRecord.expiresAt})`, {
        x: margin,
        y,
        size: 6.5,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.4)
      });
    }

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    return {
      buffer: Buffer.from(pdfBytes),
      contentType: 'application/pdf',
      filename: `rolevia-resume-${companySlug}.pdf`
    };
  } else if (format === 'docx') {
    // Generate Office Open XML Document
    const paragraphsXml = approvedMarkdown
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        if (line.startsWith('# ')) {
          return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${escapeXml(line.replace(/^#\s+/, ''))}</w:t></w:r></w:p>`;
        } else if (line.startsWith('## ')) {
          return `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>${escapeXml(line.replace(/^##\s+/, ''))}</w:t></w:r></w:p>`;
        } else if (line.startsWith('- ')) {
          return `<w:p><w:r><w:t>• ${escapeXml(line.replace(/^-\s+/, ''))}</w:t></w:r></w:p>`;
        } else {
          return `<w:p><w:r><w:t>${escapeXml(line)}</w:t></w:r></w:p>`;
        }
      })
      .join('\n');

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphsXml}
  </w:body>
</w:document>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

    const docxZip = createZipArchive([
      { path: '[Content_Types].xml', content: contentTypesXml },
      { path: '_rels/.rels', content: relsXml },
      { path: 'word/_rels/document.xml.rels', content: docRelsXml },
      { path: 'word/document.xml', content: documentXml }
    ]);

    return {
      buffer: docxZip,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename: `rolevia-resume-${companySlug}.docx`
    };
  }

  throw new Error(`Unsupported export format '${format}'. Supported formats: pdf, docx`);
}

/**
 * Persists workspace session state and approval record to PostgreSQL Application.diffData
 */
async function persistWorkspaceSession(workspaceData) {
  if (!workspaceData) return null;
  const appId = workspaceData.applicationId;
  if (!appId) return null;

  try {
    const existing = await prisma.application.findUnique({ where: { id: appId } });
    if (existing) {
      const updateData = {
        diffData: JSON.stringify(workspaceData),
        status: workspaceData.status === 'APPROVED' ? 'DIFF_APPROVED' : existing.status
      };
      if (workspaceData.approvalRecord?.approvalSignature) {
        updateData.confirmationNumber = existing.confirmationNumber || `CONF-DIFF-${Date.now().toString().slice(-6)}`;
      }
      return await prisma.application.update({
        where: { id: appId },
        data: updateData
      });
    }
  } catch (err) {
    console.warn(`[Rolevia Workspace] PostgreSQL persistence warning for ${appId}:`, err.message);
  }
  return null;
}

/**
 * Loads workspace session state from PostgreSQL if evicted or restarted
 */
async function loadWorkspaceSession(workspaceId) {
  try {
    // 1. Direct indexed/contains lookup in PostgreSQL
    const directApp = await prisma.application.findFirst({
      where: {
        diffData: {
          contains: workspaceId
        }
      }
    });

    if (directApp && directApp.diffData) {
      try {
        const parsed = JSON.parse(directApp.diffData);
        if (parsed && parsed.workspaceId === workspaceId) {
          workspaceVersionRegistry.set(workspaceId, parsed);
          return parsed;
        }
      } catch {}
    }

    // 2. Fallback scan across recent applications
    const apps = await prisma.application.findMany({
      where: { diffData: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 200
    });

    for (const app of apps) {
      if (app.diffData && app.diffData.includes(workspaceId)) {
        try {
          const parsed = JSON.parse(app.diffData);
          if (parsed && parsed.workspaceId === workspaceId) {
            workspaceVersionRegistry.set(workspaceId, parsed);
            return parsed;
          }
        } catch {}
      }
    }
  } catch (err) {
    console.warn(`[Rolevia Workspace] PostgreSQL session reload error:`, err.message);
  }
  return null;
}

/**
 * Retrieves version history for a candidate profile and target job.
 */
function getWorkspaceVersions(candidateProfileId, jobId) {
  const versions = [];
  for (const [wsId, ws] of workspaceVersionRegistry.entries()) {
    if (ws.candidateProfileId === candidateProfileId && (!jobId || ws.jobId === jobId)) {
      versions.push({
        workspaceId: wsId,
        jobId: ws.jobId,
        targetCompany: ws.targetJob.company,
        targetTitle: ws.targetJob.title,
        status: ws.status,
        version: ws.versionMetadata.version,
        generatedAt: ws.versionMetadata.generatedAt,
        approvalRecord: ws.approvalRecord
      });
    }
  }
  return versions.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
}

const { createSubmissionAuthorization, verifySubmissionAuthorization } = require('./atsAutomation');

module.exports = {
  buildOptimizationWorkspace,
  applyCandidateWorkspaceDecisions,
  invalidateWorkspaceApproval,
  verifyApprovalSignature,
  createDocumentApproval: createSubmissionAuthorization,
  createSubmissionAuthorization,
  verifySubmissionAuthorization,
  exportWorkspaceBinaryDocument,
  persistWorkspaceSession,
  loadWorkspaceSession,
  getWorkspaceVersions,
  workspaceVersionRegistry
};
