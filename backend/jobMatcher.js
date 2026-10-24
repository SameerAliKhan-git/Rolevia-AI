// Rolevia AI · FEAT-006: Explainable AI Job Matching Engine
// Architecture: Truth-Grounded Mathematical Compatibility & Tri-State Eligibility Engine
// Replaces opaque arbitrary percentage values with transparent, auditable factors.
// Enforces 3 distinct eligibility classifications: ELIGIBLE, INELIGIBLE, NEEDS_VERIFICATION.

const prisma = require('./db');

// Canonical skill keywords and aliases for robust extraction and comparison
const CANONICAL_SKILL_KEYWORDS = [
  { match: /\b(?:node\.?js|nodejs)\b/i, canonical: 'node.js' },
  { match: /\b(?:postgres(?:ql)?)\b/i, canonical: 'postgresql' },
  { match: /\b(?:golang|\bgo\b)\b/i, canonical: 'go' },
  { match: /\b(?:react(?:\.?js)?)\b/i, canonical: 'react' },
  { match: /\b(?:kubernetes|k8s)\b/i, canonical: 'kubernetes' },
  { match: /\b(?:aws|amazon web services)\b/i, canonical: 'aws' },
  { match: /\b(?:gcp|google cloud(?: platform)?)\b/i, canonical: 'gcp' },
  { match: /\b(?:typescript)\b/i, canonical: 'typescript' },
  { match: /(?<!node\.)\b(?:javascript)\b/i, canonical: 'javascript' },
  { match: /\b(?:python)\b/i, canonical: 'python' },
  { match: /\b(?:docker)\b/i, canonical: 'docker' },
  { match: /\b(?:ci\/cd|continuous integration)\b/i, canonical: 'ci/cd' },
  { match: /\b(?:graphql)\b/i, canonical: 'graphql' },
  { match: /\b(?:rest(?:\s*api)?)\b/i, canonical: 'rest api' },
  { match: /\b(?:distributed systems)\b/i, canonical: 'distributed systems' },
  { match: /\b(?:microservices)\b/i, canonical: 'microservices' },
  { match: /\b(?:redis)\b/i, canonical: 'redis' },
  { match: /\b(?:kafka)\b/i, canonical: 'kafka' }
];

const SKILL_SYNONYMS = {
  'nodejs': 'node.js',
  'node': 'node.js',
  'node.js': 'node.js',
  'postgres': 'postgresql',
  'postgresql': 'postgresql',
  'golang': 'go',
  'go': 'go',
  'reactjs': 'react',
  'react': 'react',
  'react.js': 'react',
  'k8s': 'kubernetes',
  'kubernetes': 'kubernetes',
  'aws': 'aws',
  'amazon web services': 'aws',
  'gcp': 'gcp',
  'google cloud': 'gcp',
  'google cloud platform': 'gcp',
  'ts': 'typescript',
  'typescript': 'typescript',
  'js': 'javascript',
  'javascript': 'javascript',
  'py': 'python',
  'python': 'python',
  'ci/cd': 'ci/cd',
  'docker': 'docker',
  'graphql': 'graphql',
  'rest': 'rest api',
  'rest api': 'rest api',
  'distributed systems': 'distributed systems',
  'microservices': 'microservices',
  'redis': 'redis',
  'kafka': 'kafka'
};

function normalizeSkill(s) {
  if (!s || typeof s !== 'string') return '';
  const clean = s.trim().toLowerCase();
  return SKILL_SYNONYMS[clean] || clean;
}

/**
 * Evaluates academic degree level with full Master's/PhD equivalence support
 * Rank: PhD (4) > Master/MSc/MTech (3) > Bachelor/BS/BE/BTech (2) > Associate/Bootcamp (1) > None (0)
 */
function getDegreeRank(degreeStr) {
  if (!degreeStr || typeof degreeStr !== 'string') return 0;
  const lower = degreeStr.toLowerCase();
  if (lower.includes('phd') || lower.includes('doctorate') || lower.includes('d.phil')) return 4;
  if (lower.includes('master') || lower.includes('ms') || lower.includes('msc') || lower.includes('m.tech') || lower.includes('mba') || lower.includes('postgraduate')) return 3;
  if (lower.includes('bachelor') || lower.includes('bs') || lower.includes('bsc') || lower.includes('b.tech') || lower.includes('b.e') || lower.includes('undergraduate') || lower.includes('degree in computer science')) return 2;
  if (lower.includes('associate') || lower.includes('diploma') || lower.includes('bootcamp') || lower.includes('certificate')) return 1;
  return 0;
}

/**
 * Determine estimated minimum years of experience from job title and requirements
 */
function extractRequiredYears(job) {
  if (typeof job.minYearsExperience === 'number') {
    return job.minYearsExperience;
  }

  const textToScan = `${job.title || ''} ${(Array.isArray(job.requirements) ? job.requirements.join(' ') : job.requirements || '')}`;
  
  const yrMatch = textToScan.match(/(\d+)\+?\s*(?:-\s*\d+\s*)?years?(?:\s+of\s+experience)?/i);
  if (yrMatch) {
    return parseInt(yrMatch[1], 10);
  }

  const titleLower = (job.title || '').toLowerCase();
  if (titleLower.includes('principal') || titleLower.includes('architect') || titleLower.includes('director')) return 8;
  if (titleLower.includes('staff')) return 8;
  if (titleLower.includes('lead')) return 7;
  if (titleLower.includes('senior') || titleLower.includes('sr.')) return 5;
  if (titleLower.includes('mid') || titleLower.includes('intermediate')) return 3;
  if (titleLower.includes('junior') || titleLower.includes('entry') || titleLower.includes('associate') || titleLower.includes('graduate')) return 0;

  return 2; // Default baseline for unspecified software engineering roles
}

/**
 * Categorize job requirements into required skills vs preferred skills vs restrictions
 */
function parseJobRequirements(job) {
  let reqList = [];
  if (Array.isArray(job.requirements)) {
    reqList = job.requirements;
  } else if (typeof job.requirements === 'string') {
    try {
      const parsed = JSON.parse(job.requirements);
      reqList = Array.isArray(parsed) ? parsed : [job.requirements];
    } catch {
      reqList = job.requirements.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    }
  } else if (job.description && typeof job.description === 'string') {
    reqList = job.description.split(/\n+/).map(s => s.trim()).filter(Boolean);
  }

  const requiredSkills = new Set();
  const preferredSkills = new Set();
  let sponsorshipRestricted = false;
  let sponsorshipExplicitlyOffered = false;
  let remoteAllowed = false;
  let explicitOnsiteLocation = null;
  let requiredDegreeRank = 0;
  let requiredDiscipline = null;

  const loc = (job.location || '').toLowerCase();
  const jType = (job.jobType || '').toLowerCase();
  if (loc.includes('remote') || jType.includes('remote')) {
    remoteAllowed = true;
  } else {
    explicitOnsiteLocation = job.location || null;
  }

  for (const item of reqList) {
    const lower = item.toLowerCase();

    // Check sponsorship restrictions
    if (
      lower.includes('no sponsorship') ||
      lower.includes('cannot sponsor') ||
      lower.includes('not sponsor') ||
      lower.includes('us citizen') ||
      lower.includes('u.s. citizen') ||
      lower.includes('green card required') ||
      lower.includes('without sponsorship') ||
      lower.includes('security clearance required')
    ) {
      sponsorshipRestricted = true;
    }

    // Check explicit sponsorship offers
    if (
      lower.includes('sponsorship available') ||
      lower.includes('visa sponsorship offered') ||
      lower.includes('will sponsor') ||
      lower.includes('visa sponsorship provided') ||
      lower.includes('h1b transfer') ||
      lower.includes('sponsorship is available')
    ) {
      sponsorshipExplicitlyOffered = true;
    }

    // Check degree requirements and disciplines
    if (lower.includes('phd') || lower.includes('doctorate')) {
      requiredDegreeRank = Math.max(requiredDegreeRank, 4);
    } else if (lower.includes('master') || lower.includes('msc') || lower.includes('m.s.')) {
      requiredDegreeRank = Math.max(requiredDegreeRank, 3);
    } else if (lower.includes('bachelor') || lower.includes('bsc') || lower.includes('b.s.') || lower.includes('b.tech') || lower.includes('degree in')) {
      requiredDegreeRank = Math.max(requiredDegreeRank, 2);
    }

    const commonDisciplines = [
      'computer science', 'software engineering', 'electrical engineering', 'computer engineering',
      'information technology', 'data science', 'mathematics', 'statistics', 'physics',
      'mechanical engineering', 'nursing', 'law', 'accounting', 'finance'
    ];
    for (const disc of commonDisciplines) {
      if (lower.includes(disc)) {
        requiredDiscipline = disc;
        break;
      }
    }

    // Check preferred vs required
    const isPreferred = lower.includes('preferred') || lower.includes('nice to have') || lower.includes('plus') || lower.includes('bonus');
    
    let matchedAny = false;
    for (const { match, canonical } of CANONICAL_SKILL_KEYWORDS) {
      if (match.test(lower)) {
        matchedAny = true;
        if (isPreferred) {
          preferredSkills.add(canonical);
        } else {
          requiredSkills.add(canonical);
        }
      }
    }

    if (!matchedAny) {
      // Ignore location clauses, remote policies, experience lines, and degrees
      if (lower.includes('remote') || lower.includes('onsite') || lower.includes('hybrid') || lower.includes('location') || lower.includes('experience') || lower.includes('degree') || lower.includes('bachelor') || lower.includes('master')) {
        continue;
      }
      const tokens = item.split(/[,/]|(?:\band\b)/i).map(t => t.replace(/[()]/g, '').trim().toLowerCase()).filter(t => t.length > 2);
      for (const tok of tokens) {
        if (tok.includes('experience') || tok.includes('remote') || tok.includes('location') || tok.includes('citizenship') || tok.includes('sponsorship')) {
          continue;
        }
        if (isPreferred) {
          preferredSkills.add(tok);
        } else {
          requiredSkills.add(tok);
        }
      }
    }
  }

  // If job has explicit fields, merge them
  if (Array.isArray(job.requiredSkills)) {
    job.requiredSkills.forEach(s => requiredSkills.add(normalizeSkill(s)));
  }
  if (Array.isArray(job.preferredSkills)) {
    job.preferredSkills.forEach(s => preferredSkills.add(normalizeSkill(s)));
  }
  if (job.sponsorshipOffered === false) {
    sponsorshipRestricted = true;
  }
  if (job.sponsorshipOffered === true) {
    sponsorshipExplicitlyOffered = true;
  }

  return {
    requiredSkills: Array.from(requiredSkills),
    preferredSkills: Array.from(preferredSkills),
    sponsorshipRestricted,
    sponsorshipExplicitlyOffered,
    remoteAllowed,
    explicitOnsiteLocation,
    requiredDegreeRank,
    requiredDiscipline
  };
}

/**
 * Calculate candidate's verifiable professional experience years from facts or profile
 */
function calculateCandidateYearsExperience(candidateProfile) {
  if (typeof candidateProfile.yearsExperience === 'number') {
    return candidateProfile.yearsExperience;
  }

  if (Array.isArray(candidateProfile.facts)) {
    const workFacts = candidateProfile.facts.filter(f => f.factType === 'WORK_EXPERIENCE');
    if (workFacts.length > 0) {
      let totalMonths = 0;
      for (const fact of workFacts) {
        const start = fact.startDate ? new Date(fact.startDate) : null;
        const end = (fact.endDate && fact.endDate.toLowerCase() !== 'present') ? new Date(fact.endDate) : new Date();
        if (start && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
          const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
          totalMonths += Math.max(diffMonths, 3);
        } else {
          totalMonths += 18; // 1.5 years estimated
        }
      }
      return Math.round((totalMonths / 12) * 10) / 10;
    }
  }

  return 3.0; // Standard default
}

/**
 * Normalizes candidate skills list from array or JSON string
 */
function extractCandidateSkills(candidateProfile) {
  let list = [];
  if (Array.isArray(candidateProfile.skills)) {
    list = candidateProfile.skills;
  } else if (typeof candidateProfile.skills === 'string') {
    try {
      const parsed = JSON.parse(candidateProfile.skills);
      list = Array.isArray(parsed) ? parsed : [candidateProfile.skills];
    } catch {
      list = candidateProfile.skills.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    }
  }
  return new Set(list.map(s => normalizeSkill(s)).filter(Boolean));
}

/**
 * Core Algorithm: Computes multi-factor explainable match with tri-state eligibility
 * @param {Object} candidate - CandidateProfile object with user, skills, facts
 * @param {Object} job - JobOpportunity record from database or ingestion feed
 * @returns {Object} Transparent match assessment with 0-100 score and component telemetry
 */
function computeJobMatch(candidate, job) {
  if (!candidate || !job) {
    throw new Error('Candidate profile and Job object are required for matching');
  }

  const {
    requiredSkills,
    preferredSkills,
    sponsorshipRestricted,
    sponsorshipExplicitlyOffered,
    remoteAllowed,
    explicitOnsiteLocation,
    requiredDegreeRank,
    requiredDiscipline
  } = parseJobRequirements(job);

  const candidateSkills = extractCandidateSkills(candidate);
  const candidateYears = calculateCandidateYearsExperience(candidate);
  const requiredYears = extractRequiredYears(job);
  const needsSponsorship = candidate.needsSponsorship || (candidate.user && candidate.user.needsSponsorship) || false;

  const candidateLocations = [];
  if (candidate.preferredLocations) {
    try {
      const parsed = typeof candidate.preferredLocations === 'string' ? JSON.parse(candidate.preferredLocations) : candidate.preferredLocations;
      if (Array.isArray(parsed)) candidateLocations.push(...parsed);
    } catch {
      candidateLocations.push(candidate.preferredLocations);
    }
  }
  if (candidate.user && candidate.user.location) candidateLocations.push(candidate.user.location);

  // =========================================================================
  // 1. TRI-STATE ELIGIBILITY EVALUATION
  // States: 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS_VERIFICATION'
  // Rule: Missing sponsorship info NEVER auto-rejects; flags as NEEDS_VERIFICATION.
  // =========================================================================
  const eligibility = {
    status: 'ELIGIBLE',
    passed: true,
    reasons: [],
    details: {
      sponsorship: { status: 'ELIGIBLE', note: '' },
      location: { status: 'ELIGIBLE', note: '' },
      seniority: { status: 'ELIGIBLE', note: '' },
      degree: { status: 'ELIGIBLE', note: '' }
    }
  };

  // 1A. Visa Sponsorship Evaluation
  if (!needsSponsorship) {
    eligibility.details.sponsorship = {
      status: 'ELIGIBLE',
      note: 'Candidate does not require visa sponsorship'
    };
  } else if (sponsorshipRestricted) {
    eligibility.details.sponsorship = {
      status: 'INELIGIBLE',
      note: 'Candidate requires visa sponsorship, but employer explicitly specifies sponsorship is not available or requires US citizenship'
    };
    eligibility.reasons.push(eligibility.details.sponsorship.note);
  } else if (sponsorshipExplicitlyOffered) {
    eligibility.details.sponsorship = {
      status: 'ELIGIBLE',
      note: 'Employer explicitly offers visa sponsorship for this role'
    };
  } else {
    // Crucial rule: Missing employer sponsorship information is NOT a definite rejection!
    eligibility.details.sponsorship = {
      status: 'NEEDS_VERIFICATION',
      note: 'Candidate requires visa sponsorship; employer sponsorship policy is unstated and requires verification'
    };
    eligibility.reasons.push(eligibility.details.sponsorship.note);
  }

  // 1B. Geographic & Remote Policy Evaluation
  if (remoteAllowed) {
    eligibility.details.location = {
      status: 'ELIGIBLE',
      note: 'Remote role compatible with candidate jurisdiction'
    };
  } else if (explicitOnsiteLocation) {
    const locNorm = explicitOnsiteLocation.toLowerCase();
    const matchesLoc = candidateLocations.some(cl => {
      const clNorm = (cl || '').toLowerCase();
      return clNorm.includes(locNorm) || locNorm.includes(clNorm) || clNorm.includes('remote') || clNorm.includes('anywhere');
    });

    if (matchesLoc) {
      eligibility.details.location = {
        status: 'ELIGIBLE',
        note: `Onsite location '${explicitOnsiteLocation}' matches candidate preferences`
      };
    } else if (candidate.willingToRelocate === true || candidateLocations.length === 0) {
      eligibility.details.location = {
        status: 'NEEDS_VERIFICATION',
        note: `Job is strictly onsite at '${explicitOnsiteLocation}'; candidate relocation flexibility requires verification`
      };
      eligibility.reasons.push(eligibility.details.location.note);
    } else {
      eligibility.details.location = {
        status: 'INELIGIBLE',
        note: `Job is strictly onsite at '${explicitOnsiteLocation}'; candidate preferred locations do not include this jurisdiction`
      };
      eligibility.reasons.push(eligibility.details.location.note);
    }
  }

  // 1C. Seniority & Experience Cutoff Evaluation
  if (requiredYears >= 8) {
    if (candidateYears < 2) {
      eligibility.details.seniority = {
        status: 'INELIGIBLE',
        note: `Role requires Staff/Principal seniority (${requiredYears}+ years experience); candidate has ${candidateYears} years`
      };
      eligibility.reasons.push(eligibility.details.seniority.note);
    } else if (candidateYears < 5) {
      eligibility.details.seniority = {
        status: 'NEEDS_VERIFICATION',
        note: `Role requires Staff seniority (${requiredYears}+ years); candidate has ${candidateYears} years (domain depth may compensate)`
      };
      eligibility.reasons.push(eligibility.details.seniority.note);
    } else {
      eligibility.details.seniority = {
        status: 'ELIGIBLE',
        note: `Candidate experience (${candidateYears} yrs) aligns with Staff target (${requiredYears}+ yrs)`
      };
    }
  } else if (requiredYears >= 5) {
    if (candidateYears < 1) {
      eligibility.details.seniority = {
        status: 'INELIGIBLE',
        note: `Role requires Senior seniority (${requiredYears}+ years); candidate has ${candidateYears} years`
      };
      eligibility.reasons.push(eligibility.details.seniority.note);
    } else if (candidateYears < 3) {
      eligibility.details.seniority = {
        status: 'NEEDS_VERIFICATION',
        note: `Role requires Senior seniority (${requiredYears}+ years); candidate has ${candidateYears} years (strong foundation)`
      };
      eligibility.reasons.push(eligibility.details.seniority.note);
    } else {
      eligibility.details.seniority = {
        status: 'ELIGIBLE',
        note: `Candidate experience (${candidateYears} yrs) aligns with Senior target (${requiredYears}+ yrs)`
      };
    }
  } else {
    eligibility.details.seniority = {
      status: 'ELIGIBLE',
      note: `Experience matches role requirements (${candidateYears} yrs vs ${requiredYears} required)`
    };
  }

  // 1D. Degree Equivalence and Required Discipline Evaluation
  const candEduStr = (candidate.education || candidate.bachelors || '').toLowerCase();
  const candDegreeRank = getDegreeRank(candEduStr);

  if (requiredDegreeRank > 0) {
    const meetsLevel = candDegreeRank >= requiredDegreeRank;
    const hasDisciplineReq = Boolean(requiredDiscipline);
    const meetsDiscipline = hasDisciplineReq ? candEduStr.includes(requiredDiscipline.toLowerCase()) : true;

    if (meetsLevel && meetsDiscipline) {
      eligibility.details.degree = {
        status: 'ELIGIBLE',
        note: hasDisciplineReq
          ? `Candidate holds qualifying ${candDegreeRank >= 3 ? 'advanced ' : ''}degree in ${requiredDiscipline}`
          : 'Candidate degree meets or exceeds required educational level'
      };
    } else if (meetsLevel && !meetsDiscipline) {
      // Rolevia AI Refinement: Master's does NOT blindly satisfy strict specialized discipline requirements
      eligibility.details.degree = {
        status: 'NEEDS_VERIFICATION',
        note: `Candidate meets required degree level, but role specifically specifies '${requiredDiscipline}'; discipline accreditation and coursework equivalence requires verification`
      };
      eligibility.reasons.push(eligibility.details.degree.note);
    } else if (candDegreeRank === requiredDegreeRank - 1) {
      eligibility.details.degree = {
        status: 'NEEDS_VERIFICATION',
        note: 'Role prefers advanced degree; candidate holds adjacent technical qualification'
      };
      eligibility.reasons.push(eligibility.details.degree.note);
    } else {
      eligibility.details.degree = {
        status: 'NEEDS_VERIFICATION',
        note: 'Educational requirement requires candidate verification'
      };
      eligibility.reasons.push(eligibility.details.degree.note);
    }
  } else {
    eligibility.details.degree = {
      status: 'ELIGIBLE',
      note: 'No strict degree requirement specified'
    };
  }

  // Synthesize Overall Eligibility State
  const detailStatuses = Object.values(eligibility.details).map(d => d.status);
  if (detailStatuses.includes('INELIGIBLE')) {
    eligibility.status = 'INELIGIBLE';
    eligibility.passed = false;
  } else if (detailStatuses.includes('NEEDS_VERIFICATION')) {
    eligibility.status = 'NEEDS_VERIFICATION';
    eligibility.passed = true; // Still actionable, not auto-rejected
  } else {
    eligibility.status = 'ELIGIBLE';
    eligibility.passed = true;
  }

  // =========================================================================
  // 2. MULTI-FACTOR WEIGHTED SCORING (Max 100 Points)
  // =========================================================================

  // Factor 1: Required Skills Match (Weight: 40 points)
  const matchedRequired = [];
  const missingRequired = [];
  for (const reqSkill of requiredSkills) {
    if (candidateSkills.has(reqSkill)) {
      matchedRequired.push(reqSkill);
    } else {
      missingRequired.push(reqSkill);
    }
  }

  let requiredSkillsScore = 40;
  if (requiredSkills.length > 0) {
    const ratio = matchedRequired.length / requiredSkills.length;
    requiredSkillsScore = Math.round(ratio * 40 * 10) / 10;
  }

  // Factor 2: Preferred / Bonus Skills Match (Weight: 20 points)
  const matchedPreferred = [];
  const missingPreferred = [];
  for (const prefSkill of preferredSkills) {
    if (candidateSkills.has(prefSkill)) {
      matchedPreferred.push(prefSkill);
    } else {
      missingPreferred.push(prefSkill);
    }
  }

  let preferredSkillsScore = 0;
  if (preferredSkills.length > 0) {
    const prefRatio = matchedPreferred.length / preferredSkills.length;
    preferredSkillsScore = Math.round(prefRatio * 20 * 10) / 10;
  } else if (requiredSkills.length > 0) {
    // If no preferred skills specified, award proportional to required skill match
    const reqRatio = matchedRequired.length / requiredSkills.length;
    preferredSkillsScore = Math.round(reqRatio * 20 * 10) / 10;
  } else {
    preferredSkillsScore = 10;
  }

  // Factor 3: Seniority & Experience Alignment (Weight: 25 points)
  let experienceScore = 0;
  const expDiff = candidateYears - requiredYears;
  if (expDiff >= 0) {
    experienceScore = 25;
  } else if (expDiff >= -1) {
    experienceScore = 20;
  } else if (expDiff >= -2) {
    experienceScore = 14;
  } else if (expDiff >= -3) {
    experienceScore = 8;
  } else {
    experienceScore = 3;
  }

  // Factor 4: Domain & Education Alignment with Degree Equivalence (Weight: 15 points)
  let domainEducationScore = 0;
  const titleLower = (job.title || '').toLowerCase();
  const candRoles = candidate.targetRoles ? candidate.targetRoles.toLowerCase() : '';

  // Role and engineering domain alignment
  const isEngRole = titleLower.includes('engineer') || titleLower.includes('developer') || titleLower.includes('architect') || titleLower.includes('programmer') || titleLower.includes('systems') || titleLower.includes('devops') || titleLower.includes('sre');
  const isCandEng = candRoles.includes('engineer') || candRoles.includes('developer') || candRoles.includes('architect') || candRoles.includes('systems');

  if (isEngRole && isCandEng) {
    domainEducationScore += 5;
    if ((candRoles.includes('backend') && titleLower.includes('backend')) ||
        (candRoles.includes('frontend') && titleLower.includes('frontend')) ||
        (candRoles.includes('fullstack') && titleLower.includes('fullstack')) ||
        (candRoles.includes('systems') && titleLower.includes('systems')) ||
        (candRoles.includes('security') && titleLower.includes('security'))) {
      domainEducationScore += 5;
    }
  }

  // Degree equivalence: Master's or PhD fully satisfies and exceeds Bachelor's requirement
  if (candDegreeRank >= 2) {
    domainEducationScore += isEngRole ? 5 : 2;
  } else if (candDegreeRank === 1) {
    domainEducationScore += 2;
  }
  domainEducationScore = Math.min(domainEducationScore, 15);

  // Compute composite score
  let rawCompositeScore = requiredSkillsScore + preferredSkillsScore + experienceScore + domainEducationScore;
  let compositeScore = Math.round(rawCompositeScore);

  // If hard eligibility failed (INELIGIBLE), cap score at 35 to guarantee rejection rank
  if (eligibility.status === 'INELIGIBLE') {
    compositeScore = Math.min(compositeScore, 35);
  }

  // Derive Recommendation
  let recommendation = 'NOT_RECOMMENDED';
  if (eligibility.status === 'INELIGIBLE') {
    recommendation = 'NOT_RECOMMENDED';
  } else if (eligibility.status === 'NEEDS_VERIFICATION') {
    if (compositeScore >= 80) recommendation = 'STRONG_MATCH_VERIFY_ELIGIBILITY';
    else if (compositeScore >= 60) recommendation = 'MODERATE_MATCH_VERIFY_ELIGIBILITY';
    else recommendation = 'WEAK_MATCH';
  } else {
    // ELIGIBLE
    if (compositeScore >= 80) recommendation = 'STRONG_MATCH';
    else if (compositeScore >= 60) recommendation = 'MODERATE_MATCH';
    else if (compositeScore >= 40) recommendation = 'WEAK_MATCH';
    else recommendation = 'NOT_RECOMMENDED';
  }

  // Generate transparent human-readable summary reason
  let summaryReason = '';
  if (eligibility.status === 'INELIGIBLE') {
    summaryReason = `Ineligible: ${eligibility.reasons.join('. ')}.`;
  } else if (eligibility.status === 'NEEDS_VERIFICATION') {
    summaryReason = `Needs Verification: ${eligibility.reasons.join('. ')} (Overall Match Score: ${compositeScore}/100).`;
  } else if (recommendation === 'STRONG_MATCH') {
    summaryReason = `Strong match: Candidate matches ${matchedRequired.length}/${requiredSkills.length || 1} required skills and has ${candidateYears} years experience (vs ${requiredYears} required).`;
  } else if (recommendation === 'MODERATE_MATCH') {
    summaryReason = `Moderate match: Meets experience requirements (${candidateYears} yrs vs ${requiredYears} required), but missing required skills: ${missingRequired.slice(0, 3).join(', ') || 'none'}.`;
  } else {
    summaryReason = `Weak match: Skill overlap is low (${matchedRequired.length}/${requiredSkills.length || 1}) and experience is below role expectations.`;
  }

  return {
    compositeScore,
    recommendation,
    eligibility,
    breakdown: {
      requiredSkills: {
        score: requiredSkillsScore,
        max: 40,
        matched: matchedRequired,
        missing: missingRequired
      },
      preferredSkills: {
        score: preferredSkillsScore,
        max: 20,
        matched: matchedPreferred,
        missing: missingPreferred
      },
      experienceAlignment: {
        score: experienceScore,
        max: 25,
        candidateYears,
        requiredYears,
        difference: expDiff
      },
      domainEducation: {
        score: domainEducationScore,
        max: 15,
        degreeRank: candDegreeRank,
        degreeEquivalenceSatisfied: candDegreeRank >= requiredDegreeRank
      }
    },
    summaryReason
  };
}

/**
 * Match candidate against all active job opportunities in PostgreSQL database with tenant isolation
 */
async function matchCandidateAgainstJobs(candidateProfileId, options = {}) {
  const limit = options.limit || 20;
  const minScore = options.minScore || 0;
  const tenantId = options.tenantId || null;

  const candidate = await prisma.candidateProfile.findUnique({
    where: { id: candidateProfileId },
    include: {
      user: { include: { tenant: true } },
      facts: true
    }
  });

  if (!candidate) {
    throw new Error(`CandidateProfile '${candidateProfileId}' not found`);
  }

  // Tenant Boundary Check: verify caller's tenant matches candidate profile owner
  if (tenantId && candidate.user.tenantId !== tenantId) {
    throw new Error(`Tenant boundary violation: Access to candidate profile '${candidateProfileId}' from tenant '${tenantId}' is forbidden`);
  }

  const activeJobs = await prisma.job.findMany({
    where: { status: 'ACTIVE' },
    take: 100
  });

  const rankedOpportunities = [];

  for (const job of activeJobs) {
    const matchResult = computeJobMatch(candidate, job);
    if (matchResult.compositeScore >= minScore) {
      rankedOpportunities.push({
        job: {
          id: job.id,
          company: job.company,
          title: job.title,
          ats: job.ats,
          url: job.url,
          location: job.location,
          postedAt: job.postedAt
        },
        ...matchResult
      });
    }
  }

  // Sort by compositeScore descending
  rankedOpportunities.sort((a, b) => b.compositeScore - a.compositeScore);

  return rankedOpportunities.slice(0, limit);
}

module.exports = {
  computeJobMatch,
  matchCandidateAgainstJobs,
  extractRequiredYears,
  parseJobRequirements,
  getDegreeRank,
  normalizeSkill,
  SKILL_SYNONYMS,
  CANONICAL_SKILL_KEYWORDS
};
