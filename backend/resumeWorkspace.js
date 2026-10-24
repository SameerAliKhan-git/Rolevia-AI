// Rolevia AI · FEAT-008: Interactive Resume Optimization Workspace
// Architecture: Original vs Tailored Diff, Per-Bullet Accept/Reject, Inline Editing,
// Missing Qualification Explanations, Source-Fact Evidence Inspection, Cryptographic Sign-Off,
// and Version History Management.

const crypto = require('node:crypto');
const prisma = require('./db');
const resumeOptimizer = require('./resumeOptimizer');
const { parseJobRequirements, normalizeSkill } = require('./jobMatcher');

// In-memory version registry for interactive sessions (synced to PostgreSQL Application when approved)
const workspaceVersionRegistry = new Map();

/**
 * Builds a structured, interactive comparison workspace between original candidate facts and tailored proposal.
 */
function buildOptimizationWorkspace({ candidateProfile, verifiedFacts = [], job, options = {} }) {
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

  const workspaceData = {
    workspaceId,
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
    status: 'PENDING_APPROVAL',
    approvalRecord: null
  };

  // Cache in workspace registry
  workspaceVersionRegistry.set(workspaceId, workspaceData);

  return workspaceData;
}

/**
 * Applies candidate's line-by-line decisions, incorporates inline custom edits,
 * enforces truth grounding on custom edits, and computes cryptographic candidate approval signature.
 */
function applyCandidateWorkspaceDecisions({
  workspaceId,
  decisions = {},      // { [itemId]: boolean } -> true = accept, false = revert to original
  customEdits = {},    // { [itemId]: string }  -> candidate manual edit text
  candidateSecret = 'rolevia-candidate-approval-gate',
  approvedBy = 'Candidate'
}) {
  const workspace = workspaceVersionRegistry.get(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace session '${workspaceId}' not found or expired`);
  }

  let acceptedCount = 0;
  let rejectedCount = 0;
  let customEditCount = 0;

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
          // Verify that custom edit does not introduce ungrounded skills
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

  // Generate Cryptographic HMAC Approval Signature
  const timestamp = new Date().toISOString();
  const signaturePayload = `${approvedMarkdown}|${workspace.jobId}|${workspace.candidateProfileId}|${timestamp}`;
  const approvalSignature = crypto
    .createHmac('sha256', candidateSecret)
    .update(signaturePayload)
    .digest('hex');

  const approvalRecord = {
    approvalId: `appr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    timestamp,
    approvedBy,
    approvalSignature,
    signatureAlgorithm: 'HMAC-SHA256',
    documentHash: `sha256:${crypto.createHash('sha256').update(approvedMarkdown).digest('hex')}`,
    stats: {
      totalItems: acceptedCount + rejectedCount,
      acceptedCount,
      rejectedCount,
      customEditCount
    },
    status: 'DIFF_APPROVED'
  };

  workspace.status = 'APPROVED';
  workspace.approvalRecord = approvalRecord;
  workspace.approvedMarkdown = approvedMarkdown;

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
      approvalSignature
    }
  };
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

module.exports = {
  buildOptimizationWorkspace,
  applyCandidateWorkspaceDecisions,
  getWorkspaceVersions,
  workspaceVersionRegistry
};
