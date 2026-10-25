// Rolevia AI · FEAT-005/FEAT-006: Experience-Aware Job Classification & Eligibility Engine
// Segregates jobs by employer-required experience, distinguishes fresher-friendly roles,
// models candidate experience types (full-time, internships, projects), supports overlapping intervals,
// and preserves truth-grounded extraction provenance without silent guessing.

/**
 * Standard Experience Category Identifiers
 */
const EXPERIENCE_CATEGORIES = {
  FRESHER: 'FRESHER',           // Freshers, Campus Hires, 0 years
  ENTRY_0_1: '0-1',             // 0 to 1 years
  ENTRY_0_2: '0-2',             // 0 to 2 years
  MID_1_3: '1-3',               // 1 to 3 years
  MID_3_5: '3-5',               // 3 to 5 years
  SENIOR_5_8: '5-8',           // 5 to 8 years
  LEAD_8_PLUS: '8+',            // 8+ years
  NOT_SPECIFIED: 'NOT_SPECIFIED' // Experience requirement not stated
};

/**
 * Requirement Types
 */
const REQUIREMENT_TYPES = {
  MANDATORY: 'MANDATORY',
  PREFERRED: 'PREFERRED',
  UNSPECIFIED: 'UNSPECIFIED'
};

/**
 * Verification Status
 */
const VERIFICATION_STATUS = {
  VERIFIED: 'VERIFIED',
  NEEDS_VERIFICATION: 'NEEDS_VERIFICATION',
  UNSPECIFIED: 'UNSPECIFIED'
};

/**
 * Regular expressions for experience extraction
 */
const REGEX_PATTERNS = {
  // Explicit fresher indicators
  fresherKeywords: /\b(?:fresh(?:er)?s?(?:\s+(?:welcome|can\s+apply|only|eligible))?|fresh\s+graduates?|recent\s+graduates?|new\s+grads?|graduate\s+trainees?|campus\s+(?:hiring|placements?)|entry\s+level(?:\s+opportunity)?|no\s+(?:prior\s+)?experience(?:\s+required|\s+needed)?|zero\s+experience|0\s*(?:-\s*0\s*)?years?(?:\s+of)?(?:\s+experience)?)\b/i,

  // Graduation year / batch restrictions
  graduationBatch: /\b(?:batch(?:\s+of)?\s*|graduating\s+in\s+|passout\s+batch\s*|class\s+of\s*)?((?:202[0-9])(?:\s*(?:\/|-|,|\s+or\s+|\s+and\s+)\s*(?:202[0-9]))*)\s*(?:batch|graduates?|passouts?|students?)\b/i,

  // Numeric experience range: e.g. "1 to 3 years", "0-2 years", "3 - 5 yrs"
  rangeExperience: /\b(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+(?:relevant|hands-on|industry|professional|work|software))?\s*experience\b/i,

  // Minimum experience: e.g. "minimum 2 years", "at least 3 years", "min 1 year"
  minExperience: /\b(?:minimum(?:\s+of)?|at\s+least|min\.?)\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+(?:relevant|hands-on|industry|professional|work|software))?\s*experience\b/i,

  // Plussed experience: e.g. "2+ years", "5+ yrs experience"
  plusExperience: /\b(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)(?:\s+of)?(?:\s+(?:relevant|hands-on|industry|professional|work|software))?\s*experience\b/i,

  // Stated exact experience: e.g. "1 year of software experience", "2 years experience"
  exactExperience: /\b(?:requires?\s+)?(\d+(?:\.\d+)?)\s*(?:years?|yrs?)(?:\s+of)?(?:\s+(?:relevant|hands-on|industry|professional|work|software))?\s*experience\b/i,

  // Up to / Maximum experience: e.g. "up to 5 years", "maximum 3 years"
  maxExperience: /\b(?:up\s+to|maximum(?:\s+of)?|max\.?|not\s+more\s+than)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)(?:\s+of)?(?:\s+(?:relevant|hands-on|industry|professional|work|software))?\s*experience\b/i,

  // Preferred experience vs mandatory
  preferredExperience: /\b(?:experience\s+(?:is\s+)?(?:preferred|desirable|a\s+plus)|prior\s+experience\s+(?:is\s+)?(?:preferred|a\s+plus|desirable)|preferred(?:\s*:\s*.*|\s+qualification[s:]?.*)?\d+\+?\s*years?|not\s+mandatory|experience\s+preferred\s+but\s+not\s+mandatory)\b/i,

  // Mandatory markers
  mandatoryExperience: /\b(?:must\s+have|required|mandatory|minimum|at\s+least|strictly\s+requires?)\b/i,

  // Internship explicit acceptance
  internshipAccepted: /\b(?:internships?(?:\s+experience)?\s+(?:accepted|counted|considered|welcome|valid)|relevant\s+internship(?:s)?\s+(?:considered|accepted))\b/i,

  // Internship explicit exclusion
  internshipExcluded: /\b(?:full-time\s+(?:paid\s+)?(?:professional\s+)?experience\s+only|internships?(?:\s+experience)?\s+(?:do\s+not\s+count|not\s+considered|excluded|not\s+applicable))\b/i
};

/**
 * Classifies job experience requirements from job attributes and requirements list
 * @param {Object} job - Raw or normalized job object
 * @returns {Object} Classified experience metadata
 */
function classifyJobExperience(job = {}) {
  const title = (job.title || '').trim();
  const requirements = Array.isArray(job.requirements)
    ? job.requirements
    : (typeof job.requirements === 'string' ? parseRequirementsString(job.requirements) : []);
  
  const description = (job.description || '').trim();

  // Combine requirement sentences into text blocks with provenance
  const items = [
    ...requirements.map((r, i) => ({ text: String(r).trim(), source: `requirements[${i}]` })),
    ...(description ? [{ text: description, source: 'description' }] : [])
  ].filter(item => item.text.length > 0);

  let detectedFresher = false;
  let detectedRange = null;
  let detectedMin = null;
  let detectedMax = null;
  let detectedGraduationYears = null;
  let detectedRequirementType = REQUIREMENT_TYPES.UNSPECIFIED;
  let acceptsInternships = null;
  let sourceText = null;
  let confidence = 0.0;
  let status = VERIFICATION_STATUS.UNSPECIFIED;
  let conflictingStatements = [];

  for (const item of items) {
    const text = item.text;

    // Check internship acceptance or exclusion
    if (REGEX_PATTERNS.internshipAccepted.test(text)) {
      acceptsInternships = true;
      if (!sourceText) sourceText = text;
    } else if (REGEX_PATTERNS.internshipExcluded.test(text)) {
      acceptsInternships = false;
      if (!sourceText) sourceText = text;
    }

    // Check graduation batch restrictions (e.g. 2025/2026 batch)
    const batchMatch = text.match(REGEX_PATTERNS.graduationBatch);
    if (batchMatch && batchMatch[1]) {
      const years = batchMatch[1].match(/202[0-9]/g);
      if (years && years.length > 0) {
        detectedGraduationYears = Array.from(new Set(years));
        detectedFresher = true;
        if (!sourceText) sourceText = text;
      }
    }

    // Check fresher / entry level keywords
    if (REGEX_PATTERNS.fresherKeywords.test(text)) {
      detectedFresher = true;
      if (!sourceText) sourceText = text;
    }

    // Check preferred vs mandatory experience
    if (REGEX_PATTERNS.preferredExperience.test(text)) {
      detectedRequirementType = REQUIREMENT_TYPES.PREFERRED;
      if (!sourceText) sourceText = text;
    } else if (REGEX_PATTERNS.mandatoryExperience.test(text)) {
      if (detectedRequirementType === REQUIREMENT_TYPES.UNSPECIFIED) {
        detectedRequirementType = REQUIREMENT_TYPES.MANDATORY;
      }
    }

    // Check numeric range: e.g. "0-2 years", "1-3 years"
    const rangeMatch = text.match(REGEX_PATTERNS.rangeExperience);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1]);
      const max = parseFloat(rangeMatch[2]);
      if (!isNaN(min) && !isNaN(max)) {
        detectedRange = { min, max, text };
        if (!sourceText) sourceText = text;
      }
    }

    // Check minimum experience: e.g. "minimum 2 years", "at least 3 years"
    const minMatch = text.match(REGEX_PATTERNS.minExperience);
    if (minMatch) {
      const min = parseFloat(minMatch[1]);
      if (!isNaN(min)) {
        detectedMin = { min, text };
        if (!sourceText) sourceText = text;
      }
    }

    // Check plussed experience: e.g. "2+ years"
    const plusMatch = text.match(REGEX_PATTERNS.plusExperience);
    if (plusMatch) {
      const min = parseFloat(plusMatch[1]);
      if (!isNaN(min)) {
        detectedMin = { min, text };
        if (!sourceText) sourceText = text;
      }
    }

    // Check stated exact experience: e.g. "1 year of software experience"
    if (!detectedRange && !detectedMin && !detectedMax && !REGEX_PATTERNS.maxExperience.test(text)) {
      const exactMatch = text.match(REGEX_PATTERNS.exactExperience);
      if (exactMatch) {
        const min = parseFloat(exactMatch[1]);
        if (!isNaN(min)) {
          detectedMin = { min, text };
          if (!sourceText) sourceText = text;
        }
      }
    }

    // Check maximum experience: e.g. "up to 5 years"
    const maxMatch = text.match(REGEX_PATTERNS.maxExperience);
    if (maxMatch) {
      const max = parseFloat(maxMatch[1]);
      if (!isNaN(max)) {
        detectedMax = { max, text };
        if (!sourceText) sourceText = text;
      }
    }
  }

  // Detect Contradictory statements (e.g. "Freshers welcome" but "5+ years required")
  if (detectedFresher && detectedMin && detectedMin.min >= 3) {
    conflictingStatements.push(`Fresher clause '${sourceText}' contradicts high-experience requirement '${detectedMin.text}'`);
  }
  if (detectedRange && detectedMin && Math.abs(detectedRange.min - detectedMin.min) >= 3) {
    conflictingStatements.push(`Range ${detectedRange.min}-${detectedRange.max} contradicts minimum ${detectedMin.min}`);
  }

  // Synthesize min, max, category, and fresher friendliness
  let minYears = null;
  let maxYears = null;
  let category = EXPERIENCE_CATEGORIES.NOT_SPECIFIED;
  let isFresherFriendly = false;

  if (conflictingStatements.length > 0) {
    // Ambiguity / Contradiction Resolution
    status = VERIFICATION_STATUS.NEEDS_VERIFICATION;
    confidence = 0.5;
    isFresherFriendly = detectedFresher;
    minYears = detectedRange ? detectedRange.min : (detectedMin ? detectedMin.min : 0);
    maxYears = detectedRange ? detectedRange.max : null;
    category = assignCategoryFromYears(minYears, maxYears, isFresherFriendly);
    sourceText = `Contradictory posting text: ${conflictingStatements.join('; ')}`;
  } else if (detectedRange) {
    minYears = detectedRange.min;
    maxYears = detectedRange.max;
    isFresherFriendly = minYears === 0 || detectedFresher || (detectedRequirementType === REQUIREMENT_TYPES.PREFERRED);
    category = assignCategoryFromYears(minYears, maxYears, isFresherFriendly);
    confidence = 0.95;
    status = VERIFICATION_STATUS.VERIFIED;
    if (detectedRequirementType === REQUIREMENT_TYPES.UNSPECIFIED) {
      detectedRequirementType = REQUIREMENT_TYPES.MANDATORY;
    }
  } else if (detectedMin) {
    minYears = detectedMin.min;
    maxYears = detectedMax ? detectedMax.max : null; // Missing upper bound remains null (unbounded)
    isFresherFriendly = (minYears === 0) || (detectedRequirementType === REQUIREMENT_TYPES.PREFERRED);
    category = assignCategoryFromYears(minYears, maxYears, isFresherFriendly);
    confidence = 0.90;
    status = VERIFICATION_STATUS.VERIFIED;
    if (detectedRequirementType === REQUIREMENT_TYPES.UNSPECIFIED) {
      detectedRequirementType = REQUIREMENT_TYPES.MANDATORY;
    }
  } else if (detectedMax) {
    minYears = 0;
    maxYears = detectedMax.max;
    isFresherFriendly = true;
    category = assignCategoryFromYears(minYears, maxYears, isFresherFriendly);
    confidence = 0.85;
    status = VERIFICATION_STATUS.VERIFIED;
  } else if (detectedFresher) {
    minYears = 0;
    maxYears = 0; // Freshers / No prior experience required (0 years)
    isFresherFriendly = true;
    category = EXPERIENCE_CATEGORIES.FRESHER;
    confidence = 0.95;
    status = VERIFICATION_STATUS.VERIFIED;
    if (detectedRequirementType === REQUIREMENT_TYPES.UNSPECIFIED) {
      detectedRequirementType = REQUIREMENT_TYPES.MANDATORY;
    }
  } else {
    // Rule: Do NOT infer minimum experience solely from job titles such as Associate Engineer, Analyst, SDE I, or Junior Developer.
    // If text does not specify experience, leave it as NOT_SPECIFIED
    minYears = null;
    maxYears = null;
    category = EXPERIENCE_CATEGORIES.NOT_SPECIFIED;
    isFresherFriendly = false;
    confidence = 0.0;
    status = VERIFICATION_STATUS.UNSPECIFIED;
    detectedRequirementType = REQUIREMENT_TYPES.UNSPECIFIED;
    sourceText = null;
  }

  // If experience is explicitly preferred, mark fresher-friendly
  if (detectedRequirementType === REQUIREMENT_TYPES.PREFERRED) {
    isFresherFriendly = true;
  }

  // If internships are accepted, remember it
  if (acceptsInternships === null && isFresherFriendly) {
    acceptsInternships = true; // Fresher-friendly roles typically accept internship experience
  }

  return {
    minExperienceYears: minYears,
    maxExperienceYears: maxYears,
    experienceCategory: category,
    experienceRequirementType: detectedRequirementType,
    experienceSourceText: sourceText,
    experienceExtractionConfidence: confidence,
    experienceVerificationStatus: status,
    isFresherFriendly,
    acceptsInternships,
    graduationYearRestrictions: detectedGraduationYears
  };
}

/**
 * Assigns standardized category string based on min and max years
 */
function assignCategoryFromYears(min, max, isFresher = false) {
  if (min === null && max === null) {
    return isFresher ? EXPERIENCE_CATEGORIES.FRESHER : EXPERIENCE_CATEGORIES.NOT_SPECIFIED;
  }

  const effectiveMin = min !== null ? min : 0;

  if (effectiveMin === 0 && max === 0) {
    return EXPERIENCE_CATEGORIES.FRESHER;
  }
  if (effectiveMin === 0 && max === 1) {
    return EXPERIENCE_CATEGORIES.ENTRY_0_1;
  }
  if (effectiveMin === 0 && max === 2) {
    return EXPERIENCE_CATEGORIES.ENTRY_0_2;
  }
  if (effectiveMin === 0 && max === null && isFresher) {
    return EXPERIENCE_CATEGORIES.FRESHER;
  }
  if (effectiveMin >= 1 && effectiveMin < 3 && max !== null && max <= 3) {
    return EXPERIENCE_CATEGORIES.MID_1_3;
  }
  if (effectiveMin >= 3 && effectiveMin < 5 && max !== null && max <= 5) {
    return EXPERIENCE_CATEGORIES.MID_3_5;
  }
  if (effectiveMin >= 5 && effectiveMin < 8) {
    return EXPERIENCE_CATEGORIES.SENIOR_5_8;
  }
  if (effectiveMin >= 8 || (effectiveMin >= 7 && max === null)) {
    return EXPERIENCE_CATEGORIES.LEAD_8_PLUS;
  }
  if (effectiveMin >= 2 && max === null) {
    return effectiveMin >= 5 ? EXPERIENCE_CATEGORIES.SENIOR_5_8 : (effectiveMin >= 3 ? EXPERIENCE_CATEGORIES.MID_3_5 : '2+');
  }

  return isFresher ? EXPERIENCE_CATEGORIES.FRESHER : `${effectiveMin}-${max || 'plus'}`;
}

/**
 * Checks if a job matches an experience filter interval or category
 * Supports overlapping experience ranges!
 * E.g., a job requiring 1-3 years appears when filtering for 0-2 or 1-3 or 2-4.
 */
function isJobMatchingExperienceFilter(job, filter) {
  if (!filter || filter === 'all' || filter === 'ALL') {
    return true;
  }

  let targetJob = job;
  if (targetJob.minExperienceYears === undefined && targetJob.isFresherFriendly === undefined && (targetJob.requirements || targetJob.description)) {
    const classification = classifyJobExperience(targetJob);
    targetJob = { ...targetJob, ...classification };
  }

  const jobMin = targetJob.minExperienceYears !== null && targetJob.minExperienceYears !== undefined ? targetJob.minExperienceYears : null;
  const jobMax = targetJob.maxExperienceYears !== null && targetJob.maxExperienceYears !== undefined ? targetJob.maxExperienceYears : null;
  const isFresher = Boolean(targetJob.isFresherFriendly);

  // Filter: Fresher / No Experience
  if (filter === 'fresher' || filter === 'FRESHER') {
    return isFresher || (jobMin !== null && jobMin === 0 && (jobMax === null || jobMax <= 1));
  }

  // Filter: Experience Not Specified
  if (filter === 'unspecified' || filter === 'NOT_SPECIFIED') {
    return jobMin === null && jobMax === null && !isFresher;
  }

  // Map standardized interval targets
  const INTERVAL_MAP = {
    '0-1': { min: 0, max: 1 },
    '0-2': { min: 0, max: 2 },
    '1-3': { min: 1, max: 3 },
    '3-5': { min: 3, max: 5 },
    '5-8': { min: 5, max: 8 },
    '8+':  { min: 8, max: Infinity }
  };

  const target = INTERVAL_MAP[filter];
  if (!target) {
    return true;
  }

  // If job has unspecified experience, it does not match strict numeric ranges unless filter is all
  if (jobMin === null && jobMax === null) {
    return false;
  }

  // Two intervals [A, B] and [C, D] overlap if: Math.max(A, C) <= Math.min(B, D)
  const effectiveJobMin = jobMin !== null ? jobMin : 0;
  const effectiveJobMax = jobMax !== null ? jobMax : Infinity;

  const overlapStart = Math.max(effectiveJobMin, target.min);
  const overlapEnd = Math.min(effectiveJobMax, target.max);

  return overlapStart <= overlapEnd;
}

/**
 * Evaluates candidate eligibility against job experience criteria (FEAT-006 Integration)
 * @param {Object} candidate - Candidate Profile with yearsExp, education, facts
 * @param {Object} job - Job opportunity record with experience fields
 * @returns {Object} Tri-state eligibility assessment
 */
function evaluateExperienceEligibility(candidate, job) {
  if (!candidate || !job) {
    return {
      status: 'NEEDS_VERIFICATION',
      eligible: true,
      reason: 'Incomplete candidate or job data'
    };
  }

  let targetJob = job;
  if (targetJob.minExperienceYears === undefined && targetJob.isFresherFriendly === undefined && (targetJob.requirements || targetJob.description)) {
    const classification = classifyJobExperience(targetJob);
    targetJob = { ...targetJob, ...classification };
  }

  // 1. Calculate separately modeled candidate experience types
  const candidateExperience = calculateDetailedCandidateExperience(candidate);
  const {
    fullTimeYears,
    internshipYears,
    projectCount,
    graduationYear,
    degreeLevel
  } = candidateExperience;

  const jobMin = targetJob.minExperienceYears !== null && targetJob.minExperienceYears !== undefined ? targetJob.minExperienceYears : null;
  const jobMax = targetJob.maxExperienceYears !== null && targetJob.maxExperienceYears !== undefined ? targetJob.maxExperienceYears : null;
  const reqType = targetJob.experienceRequirementType || REQUIREMENT_TYPES.UNSPECIFIED;
  const isFresherFriendly = Boolean(targetJob.isFresherFriendly);
  const acceptsInternships = targetJob.acceptsInternships !== false; // defaults to true for entry/fresher unless explicitly excluded

  // Compute effective qualifying candidate experience
  let qualifyingExperienceYears = fullTimeYears;
  if (acceptsInternships || isFresherFriendly || (jobMin !== null && jobMin <= 1)) {
    // Count internship experience when employer permits it or for entry roles
    qualifyingExperienceYears += internshipYears;
  }

  // 2. Check Graduation Year Restrictions (e.g. 2025/2026 batch)
  if (targetJob.graduationYearRestrictions) {
    let allowedYears = [];
    try {
      allowedYears = Array.isArray(targetJob.graduationYearRestrictions)
        ? targetJob.graduationYearRestrictions
        : JSON.parse(targetJob.graduationYearRestrictions);
    } catch {}

    if (allowedYears.length > 0 && graduationYear) {
      const isAllowed = allowedYears.map(String).includes(String(graduationYear));
      if (!isAllowed) {
        return {
          status: 'INELIGIBLE',
          eligible: false,
          gapYears: 0,
          reason: `Job restricts applicants to ${allowedYears.join('/')} graduation batch; candidate graduated/graduating in ${graduationYear}.`,
          sourceText: targetJob.experienceSourceText,
          provenance: 'GRADUATION_YEAR_MISMATCH'
        };
      }
    }
  }

  // 3. Experience Preferred but Not Mandatory
  if (reqType === REQUIREMENT_TYPES.PREFERRED) {
    return {
      status: 'ELIGIBLE',
      eligible: true,
      gapYears: 0,
      reason: `Experience is preferred by employer but not mandatory. Candidate foundation qualifies.`,
      sourceText: targetJob.experienceSourceText,
      provenance: 'PREFERRED_EXPERIENCE'
    };
  }

  // 4. Fresher-Friendly Roles
  if (isFresherFriendly && qualifyingExperienceYears <= 2) {
    return {
      status: 'ELIGIBLE',
      eligible: true,
      gapYears: 0,
      reason: `Fresher-friendly opportunity explicitly welcomes candidates with 0–2 years of experience.`,
      sourceText: targetJob.experienceSourceText,
      provenance: 'FRESHER_FRIENDLY'
    };
  }

  // 5. Experience Not Specified in Posting
  if (jobMin === null && jobMax === null) {
    return {
      status: 'NEEDS_VERIFICATION',
      eligible: true,
      gapYears: 0,
      reason: `Employer has not specified minimum years of experience. Application verification recommended.`,
      sourceText: null,
      provenance: 'UNSPECIFIED_EXPERIENCE'
    };
  }

  // 6. Mandatory Experience Evaluation
  const effectiveJobMin = jobMin !== null ? jobMin : 0;

  if (qualifyingExperienceYears >= effectiveJobMin) {
    // Candidate meets or exceeds minimum
    if (jobMax !== null && qualifyingExperienceYears > jobMax + 3) {
      // Significantly overqualified
      return {
        status: 'NEEDS_VERIFICATION',
        eligible: true,
        gapYears: 0,
        reason: `Candidate experience (${qualifyingExperienceYears} yrs) exceeds employer's targeted upper bound (${jobMax} yrs).`,
        sourceText: targetJob.experienceSourceText,
        provenance: 'OVERQUALIFIED'
      };
    }

    return {
      status: 'ELIGIBLE',
      eligible: true,
      gapYears: 0,
      reason: `Candidate experience (${qualifyingExperienceYears} yrs) satisfies required ${effectiveJobMin}${jobMax ? '–' + jobMax : '+'} years.`,
      sourceText: targetJob.experienceSourceText,
      provenance: 'SATISFIES_REQUIREMENT'
    };
  } else {
    // Candidate has an experience gap
    const gap = Math.round((effectiveJobMin - qualifyingExperienceYears) * 10) / 10;

    // If candidate has 0 years and job requires 2+ years mandatory
    if (qualifyingExperienceYears === 0 && effectiveJobMin >= 2) {
      return {
        status: 'INELIGIBLE',
        eligible: false,
        gapYears: gap,
        reason: effectiveJobMin >= 8
          ? `Role requires Staff/Principal seniority (${effectiveJobMin}+ years experience); candidate has 0 years verified employment.`
          : `Job requires ${effectiveJobMin}+ years mandatory professional experience; candidate has 0 years verified employment.`,
        sourceText: targetJob.experienceSourceText,
        provenance: 'EXPERIENCE_GAP'
      };
    }

    // If gap is small (1 year or less) and candidate has strong projects/internships
    if (gap <= 1.0) {
      return {
        status: 'NEEDS_VERIFICATION',
        eligible: true,
        gapYears: gap,
        reason: `Job specifies ${effectiveJobMin}+ years; candidate has ${qualifyingExperienceYears} years (${gap} yr gap may be bridged by domain depth or verified coursework).`,
        sourceText: targetJob.experienceSourceText,
        provenance: 'MARGINAL_GAP'
      };
    }

    return {
      status: 'INELIGIBLE',
      eligible: false,
      gapYears: gap,
      reason: effectiveJobMin >= 8
        ? `Role requires Staff/Principal seniority (${effectiveJobMin}+ years experience); candidate has ${qualifyingExperienceYears} years`
        : (effectiveJobMin >= 5
          ? `Role requires Senior seniority (${effectiveJobMin}+ years experience); candidate has ${qualifyingExperienceYears} years`
          : `Experience requirement gap of ${gap} years (${qualifyingExperienceYears} yrs vs ${effectiveJobMin}+ yrs mandatory).`),
      sourceText: targetJob.experienceSourceText,
      provenance: 'EXPERIENCE_GAP'
    };
  }
}

/**
 * Calculates granular breakdown of candidate experience types from profile & facts
 */
function calculateDetailedCandidateExperience(candidate) {
  let fullTimeMonths = 0;
  let internshipMonths = 0;
  let projectCount = 0;
  let graduationYear = null;

  // Extract graduation year from education string (e.g. "Expected 2026", "2024", "2026")
  const eduStr = `${candidate.education || ''} ${candidate.bachelors || ''}`;
  const yrMatch = eduStr.match(/\b(202[0-9]|201[0-9])\b/);
  if (yrMatch) {
    graduationYear = parseInt(yrMatch[1], 10);
  }

  // If candidate has verified FactStore facts
  if (Array.isArray(candidate.facts) && candidate.facts.length > 0) {
    for (const fact of candidate.facts) {
      if (fact.factType === 'WORK_EXPERIENCE') {
        // Distinguish full-time from internship based on title/type
        const titleLower = (fact.title || '').toLowerCase();
        const isInternship = titleLower.includes('intern') || titleLower.includes('trainee') || titleLower.includes('fellow');

        const start = fact.startDate ? new Date(fact.startDate) : null;
        const end = (fact.endDate && fact.endDate.toLowerCase() !== 'present') ? new Date(fact.endDate) : new Date();

        let months = 12; // default 1 yr if dates unparseable
        if (start && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
          months = Math.max((end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()), 1);
        }

        if (isInternship) {
          internshipMonths += months;
        } else {
          fullTimeMonths += months;
        }
      } else if (fact.factType === 'PROJECT') {
        projectCount++;
      }
    }
  } else if (typeof candidate.yearsExp === 'number') {
    fullTimeMonths = candidate.yearsExp * 12;
  } else if (typeof candidate.yearsExperience === 'number') {
    fullTimeMonths = candidate.yearsExperience * 12;
  }

  return {
    fullTimeYears: Math.round((fullTimeMonths / 12) * 10) / 10,
    internshipYears: Math.round((internshipMonths / 12) * 10) / 10,
    projectCount,
    graduationYear,
    degreeLevel: eduStr.toLowerCase().includes('master') || eduStr.toLowerCase().includes('msc') ? 'MASTER' : 'BACHELOR'
  };
}

/**
 * Safely parses requirement strings that may be JSON or plain text
 */
function parseRequirementsString(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return raw.split(/\n|;/).map(s => s.trim()).filter(Boolean);
  }
}

/**
 * Safe backfill helper: updates existing PostgreSQL Job records with extracted experience intelligence
 */
async function backfillExistingJobs(prismaClient) {
  if (!prismaClient) return { updated: 0, skipped: 0, total: 0 };

  const jobs = await prismaClient.job.findMany({
    where: {
      OR: [
        { experienceVerificationStatus: 'UNSPECIFIED' },
        { minExperienceYears: null, isFresherFriendly: false }
      ]
    }
  });

  let updated = 0;
  let skipped = 0;

  for (const job of jobs) {
    const classification = classifyJobExperience(job);
    if (classification.experienceVerificationStatus !== VERIFICATION_STATUS.UNSPECIFIED || classification.isFresherFriendly) {
      await prismaClient.job.update({
        where: { id: job.id },
        data: {
          minExperienceYears: classification.minExperienceYears,
          maxExperienceYears: classification.maxExperienceYears,
          experienceCategory: classification.experienceCategory,
          experienceRequirementType: classification.experienceRequirementType,
          experienceSourceText: classification.experienceSourceText,
          experienceExtractionConfidence: classification.experienceExtractionConfidence,
          experienceVerificationStatus: classification.experienceVerificationStatus,
          isFresherFriendly: classification.isFresherFriendly,
          acceptsInternships: classification.acceptsInternships,
          graduationYearRestrictions: classification.graduationYearRestrictions
        }
      });
      updated++;
    } else {
      skipped++;
    }
  }

  return {
    total: jobs.length,
    updated,
    skipped
  };
}

module.exports = {
  EXPERIENCE_CATEGORIES,
  REQUIREMENT_TYPES,
  VERIFICATION_STATUS,
  classifyJobExperience,
  isJobMatchingExperienceFilter,
  evaluateExperienceEligibility,
  calculateDetailedCandidateExperience,
  backfillExistingJobs
};
