// Rolevia AI · FEAT-016: Experience-Aware Job Classification & Eligibility Engine
// Segregates jobs by employer-required experience, distinguishes fresher-friendly roles,
// models candidate experience types (full-time, internships, projects), supports overlapping intervals,
// disaggregates overall from skill-specific experience, guards against ungrounded title guessing,
// and preserves truth-grounded extraction provenance.

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
 * Recognized tech skills for disaggregated skill-specific requirement parsing
 */
const RECOGNIZED_TECH_SKILLS = [
  'Python', 'JavaScript', 'TypeScript', 'Node.js', 'React', 'Angular', 'Vue', 'Next.js',
  'Go', 'Golang', 'Java', 'Kotlin', 'Swift', 'C++', 'C#', 'Rust', 'Ruby', 'PHP',
  'PostgreSQL', 'Postgres', 'MySQL', 'MongoDB', 'Redis', 'Cassandra', 'Elasticsearch',
  'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'Linux', 'Terraform', 'Kafka',
  'GraphQL', 'REST', 'CI/CD', 'Git', 'SQL', 'PyTorch', 'TensorFlow', 'Flask', 'Django',
  'Spring', 'FastAPI', 'HTML', 'CSS', 'Microservices',
  'Spark', 'Apache Spark', 'PySpark', 'WebGL', 'WebGPU', 'Playwright', 'Cypress', 'Selenium', 'Hadoop', 'Pandas'
];

/**
 * Regular expressions for experience extraction
 */
const REGEX_PATTERNS = {
  // Explicit fresher indicators
  fresherKeywords: /\b(?:fresh(?:er)?s?(?:\s+(?:welcome|can\s+apply|only|eligible))?|fresh\s+graduates?|recent\s+graduates?|new\s+grads?|graduate\s+trainees?|campus\s+(?:hiring|placements?)|entry\s+level(?:\s+opportunity)?|no\s+(?:prior\s+)?experience(?:\s+required|\s+needed)?|zero\s+experience|0\s*(?:-\s*0\s*)?years?(?:\s+of)?(?:\s+experience)?)\b/i,

  // Graduation year / batch restrictions
  graduationBatch: /\b(?:batch(?:\s+of)?\s*|graduating\s+in\s+|passing\s+out\s+in\s+|passout\s+batch\s*|class\s+of\s*)?((?:202[0-9])(?:\s*(?:\/|-|,|\s+or\s+|\s+and\s+)\s*(?:202[0-9]))*)\s*(?:batch|graduates?|passouts?|students?|only)?\b/i,

  // Numeric experience range: e.g. "1 to 3 years", "0-2 years", "3 - 5 yrs", "0 to 2 years of software engineering experience"
  rangeExperience: /\b(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+(?:of|in|with))?(?:\s+[\w+-]+){0,4}\s*(?:experience|development|engineering|testing|programming)\b/i,

  // Minimum experience: e.g. "minimum 2 years", "at least 3 years", "min 1 year"
  minExperience: /\b(?:minimum(?:\s+of)?|at\s+least|min\.?)\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+(?:of|in|with))?(?:\s+[\w+-]+){0,4}\s*(?:experience|development|engineering|testing|programming)\b/i,

  // Plussed experience: e.g. "2+ years", "5+ yrs experience", "10+ years"
  plusExperience: /\b(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)(?:\s+(?:of|in|with))?(?:\s+[\w+-]+){0,4}\s*(?:experience|development|engineering|testing|programming)\b/i,

  // Stated exact experience: e.g. "1 year of software experience", "2 years experience"
  exactExperience: /\b(?:requires?\s+)?(\d+(?:\.\d+)?)\s*(?:years?|yrs?)(?:\s+(?:of|in|with))?(?:\s+[\w+-]+){0,4}\s*(?:experience|development|engineering|testing|programming)\b/i,

  // Up to / Maximum experience: e.g. "up to 5 years", "maximum 3 years"
  maxExperience: /\b(?:up\s+to|maximum(?:\s+of)?|max\.?|not\s+more\s+than)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)(?:\s+(?:of|in|with))?(?:\s+[\w+-]+){0,4}\s*(?:experience|development|engineering|testing|programming)\b/i,

  // Preferred experience vs mandatory
  preferredExperience: /\b(?:experience\s+(?:is\s+)?(?:preferred|desirable|a\s+plus)|prior\s+experience\s+(?:is\s+)?(?:preferred|a\s+plus|desirable)|\d+(?:\s*[-to]\s*\d+)?\+?\s*(?:years?|yrs?).*?(?:preferred|a\s+plus|desirable)|preferred(?:\s*:\s*.*|\s+qualification[s:]?.*)?\d+\+?\s*years?|not\s+mandatory|experience\s+preferred\s+but\s+not\s+mandatory)\b/i,

  // Mandatory markers
  mandatoryExperience: /\b(?:must\s+have|required|mandatory|minimum|at\s+least|strictly\s+requires?)\b/i,

  // Internship explicit acceptance
  internshipAccepted: /\b(?:internships?(?:\s+experience)?\s+(?:accepted|counted|considered|welcome|valid)|relevant\s+internship(?:s)?\s+(?:considered|accepted))\b/i,

  // Internship explicit exclusion
  internshipExcluded: /\b(?:full-time\s+(?:paid\s+)?(?:professional\s+)?experience\s+only|internships?(?:\s+experience)?\s+(?:do\s+not\s+count|not\s+considered|excluded|not\s+applicable))\b/i,

  // Work authorization / visa sponsorship restriction
  workAuthRestricted: /\b(?:us\s+citizens?(?:\s+only)?|permanent\s+residents?(?:\s+only)?|no\s+(?:visa\s+)?sponsorship(?:\s+provided|\s+available)?|does\s+not\s+offer\s+sponsorship|unable\s+to\s+sponsor|not\s+offering\s+sponsorship|cannot\s+(?:offer\s+|provide\s+)?sponsorship|must\s+be\s+authorized\s+to\s+work\s+in\s+the\s+u\.?s\.?(?:\s+without\s+(?:current\s+or\s+future\s+)?sponsorship)?|itar(?:\s+compliance|\s+restricted)?|security\s+clearance\s+required|candidates\s+must\s+not\s+require\s+sponsorship)\b/i,

  // Visa sponsorship explicitly provided / available
  sponsorshipProvided: /\b(?:visa\s+sponsorship\s+(?:is\s+)?(?:provided|available|offered|supported)|will\s+sponsor(?:\s+visas?|\s+work\s+visas?)?|open\s+to\s+sponsoring|h-?1b\s+(?:transfer\s+)?(?:welcome|accepted|supported|transfer\s+available)|opt\s*\/?\s*cpt\s+(?:accepted|eligible|supported)|sponsorship\s+available\b)/i,

  // Overall experience indicator (distinguishes total career years from individual tool years)
  overallExpKeywords: /\b(?:software\s+(?:development|engineering)|industry|professional|work|overall|total|commercial|relevant)\s*experience\b|\bexperience\s+(?:in\s+the\s+industry|in\s+software\s+development|as\s+a\s+software\s+engineer)\b/i
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
  let detectedSkillSpecific = {};
  let detectedSponsorshipRestricted = false;
  let detectedSponsorshipProvided = false;
  let requiresWorkAuthorization = false;

  for (const item of items) {
    const text = item.text;

    // Check work authorization / sponsorship restrictions & provisions
    if (REGEX_PATTERNS.workAuthRestricted.test(text)) {
      detectedSponsorshipRestricted = true;
      if (!sourceText) sourceText = text;
    }
    if (REGEX_PATTERNS.sponsorshipProvided.test(text) && !/\b(?:no|not|cannot|does\s+not|without|unable\s+to)\b/i.test(text)) {
      detectedSponsorshipProvided = true;
      if (!sourceText) sourceText = text;
    }

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
    const isItemPreferred = REGEX_PATTERNS.preferredExperience.test(text);
    if (isItemPreferred) {
      if (detectedRequirementType === REQUIREMENT_TYPES.UNSPECIFIED) {
        detectedRequirementType = REQUIREMENT_TYPES.PREFERRED;
      }
      if (!sourceText) sourceText = text;
    } else if (REGEX_PATTERNS.mandatoryExperience.test(text)) {
      if (detectedRequirementType === REQUIREMENT_TYPES.UNSPECIFIED) {
        detectedRequirementType = REQUIREMENT_TYPES.MANDATORY;
      }
    }

    // Check skill-specific experience clauses (e.g. "2+ years of Python experience", "at least 1 year with Docker")
    let foundSkillMatch = false;
    for (const skill of RECOGNIZED_TECH_SKILLS) {
      const escapedSkill = skill.replace(/([+*.?^=!:${}()|[\]/\\])/g, '\\$1');
      const skillPattern = new RegExp(
        `(?:(\\d+(?:\\.\\d+)?)\\s*(?:to|-)\\s*(\\d+(?:\\.\\d+)?)\\s*\\+?|(\\d+(?:\\.\\d+)?)\\s*\\+?)\\s*(?:years?|yrs?)(?:\\s+of)?(?:\\s+(?:hands-on|production|relevant|working))?\\s*(?:experience\\s+)?(?:in|with|using)?\\s*${escapedSkill}\\b|\\b${escapedSkill}\\s*(?:experience)?\\s*[:(-]?\\s*(\\d+(?:\\.\\d+)?)\\s*\\+?\\s*(?:years?|yrs?)`,
        'i'
      );
      const sMatch = text.match(skillPattern);
      if (sMatch) {
        const isUpTo = /\b(?:up\s+to|maximum(?:\s+of)?|max\.?|not\s+more\s+than)\b/i.test(text);
        const parsedYears = parseFloat(sMatch[1] || sMatch[3] || sMatch[4]);
        const minYears = isUpTo ? 0 : parsedYears;
        const maxYears = isUpTo ? parsedYears : (sMatch[2] ? parseFloat(sMatch[2]) : null);
        if (!isNaN(minYears)) {
          detectedSkillSpecific[skill] = {
            minYears,
            maxYears,
            type: isItemPreferred ? 'PREFERRED' : 'MANDATORY',
            sourceText: text
          };
          foundSkillMatch = true;
        }
      }
    }

    // Check numeric range: e.g. "0-2 years", "1-3 years"
    const rangeMatch = text.match(REGEX_PATTERNS.rangeExperience);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1]);
      const max = parseFloat(rangeMatch[2]);
      if (!isNaN(min) && !isNaN(max)) {
        if (!detectedRange || min >= detectedRange.min) {
          detectedRange = { min, max, text };
          if (!sourceText) sourceText = text;
        }
      }
    }

    // Check minimum experience: e.g. "minimum 2 years", "at least 3 years"
    const minMatch = text.match(REGEX_PATTERNS.minExperience);
    if (minMatch) {
      const min = parseFloat(minMatch[1]);
      if (!isNaN(min)) {
        if (!detectedMin || min > detectedMin.min) {
          detectedMin = { min, text };
          if (!sourceText) sourceText = text;
        }
      }
    }

    // Check plussed experience: e.g. "2+ years", "5+ years", "10+ years"
    const plusMatch = text.match(REGEX_PATTERNS.plusExperience);
    if (plusMatch) {
      const min = parseFloat(plusMatch[1]);
      if (!isNaN(min)) {
        if (!detectedMin || min > detectedMin.min) {
          detectedMin = { min, text };
          if (!sourceText) sourceText = text;
        }
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

  // Detect Contradictory statements (e.g. "Entry level" or "Freshers welcome" but "5+ years required")
  if (detectedFresher && ((detectedMin && detectedMin.min >= 5) || (detectedRange && detectedRange.min >= 5))) {
    conflictingStatements.push(`Fresher/Entry-level clause contradicts high-experience requirement (${detectedMin ? detectedMin.min : detectedRange.min}+ years)`);
  }
  if (detectedRange && detectedMin && Math.abs(detectedRange.min - detectedMin.min) >= 4) {
    conflictingStatements.push(`Range ${detectedRange.min}-${detectedRange.max} contradicts minimum ${detectedMin.min}`);
  }

  // Resolve Sponsorship & Work Authorization tri-state (true, false, null)
  let sponsorshipAvailable = null;
  if (detectedSponsorshipRestricted && detectedSponsorshipProvided) {
    sponsorshipAvailable = null;
    conflictingStatements.push('Job posting contains conflicting visa sponsorship statements (both restricted and offered)');
  } else if (detectedSponsorshipRestricted) {
    sponsorshipAvailable = false;
    requiresWorkAuthorization = true;
  } else if (detectedSponsorshipProvided) {
    sponsorshipAvailable = true;
    requiresWorkAuthorization = false;
  } else {
    sponsorshipAvailable = null; // Unspecified: employer has not stated policy
    requiresWorkAuthorization = false;
  }

  // If no overall experience was stated but skill-specific experience was parsed:
  // Derive overall minimum as the maximum required skill years (lower bound)
  if (!detectedRange && !detectedMin && !detectedMax && Object.keys(detectedSkillSpecific).length > 0) {
    const mandatorySkills = Object.values(detectedSkillSpecific).filter(s => s.type !== 'PREFERRED');
    const skillPool = mandatorySkills.length > 0 ? mandatorySkills : Object.values(detectedSkillSpecific);
    const maxSkillYears = Math.max(...skillPool.map(s => s.minYears || 0));
    if (maxSkillYears > 0) {
      detectedMin = { min: maxSkillYears, text: skillPool[0].sourceText };
      if (!sourceText) sourceText = skillPool[0].sourceText;
    }
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
    isFresherFriendly = false;
    minYears = detectedRange ? detectedRange.min : (detectedMin ? detectedMin.min : null);
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
  } else if (detectedRequirementType === REQUIREMENT_TYPES.PREFERRED) {
    minYears = detectedRange ? detectedRange.min : (detectedMin ? detectedMin.min : 0);
    maxYears = detectedRange ? detectedRange.max : (detectedMin ? null : 0);
    isFresherFriendly = true;
    category = assignCategoryFromYears(minYears, maxYears, isFresherFriendly);
    confidence = 0.90;
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
    graduationYearRestrictions: detectedGraduationYears,
    skillSpecificExperience: Object.keys(detectedSkillSpecific).length > 0 ? detectedSkillSpecific : null,
    sponsorshipAvailable,
    requiresWorkAuthorization
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

  // 1a. Contradictory or Ambiguous Requirements
  if (targetJob.experienceVerificationStatus === VERIFICATION_STATUS.NEEDS_VERIFICATION) {
    return {
      status: 'NEEDS_VERIFICATION',
      eligible: true,
      gapYears: 0,
      reason: 'Job posting contains contradictory or ambiguous experience requirements. Application verification required.',
      sourceText: targetJob.experienceSourceText,
      provenance: 'AMBIGUOUS_REQUIREMENTS'
    };
  }

  // 1b. Check Work Authorization / Visa Sponsorship
  if (candidate.requiresSponsorship === true) {
    if (targetJob.sponsorshipAvailable === false || targetJob.requiresWorkAuthorization === true) {
      return {
        status: 'INELIGIBLE',
        eligible: false,
        gapYears: 0,
        reason: 'Job requires independent work authorization or does not sponsor visas; candidate requires sponsorship.',
        sourceText: targetJob.experienceSourceText,
        provenance: 'SPONSORSHIP_RESTRICTED'
      };
    } else if (targetJob.sponsorshipAvailable === null || targetJob.sponsorshipAvailable === undefined) {
      return {
        status: 'NEEDS_VERIFICATION',
        eligible: false,
        gapYears: 0,
        reason: 'Employer visa sponsorship policy is unstated; verification required before application as candidate requires sponsorship.',
        sourceText: targetJob.experienceSourceText,
        provenance: 'SPONSORSHIP_UNSPECIFIED'
      };
    }
  }

  // 1c. Check Graduation Year Restrictions (e.g. 2025/2026 batch)
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

  // Compute effective qualifying candidate experience
  let qualifyingExperienceYears = fullTimeYears;
  if (acceptsInternships || isFresherFriendly || (jobMin !== null && jobMin <= 1)) {
    // Count internship experience when employer permits it or for entry roles
    qualifyingExperienceYears += internshipYears;
  }

  // 1d. Degree-Level Equivalence (M.Sc/Master degree can bridge up to 1 year of experience gap)
  if (degreeLevel === 'MASTER' && jobMin !== null && qualifyingExperienceYears < jobMin) {
    qualifyingExperienceYears += 1.0;
  }

  const effectiveJobMin = jobMin !== null ? jobMin : 0;
  const overallGap = Math.round((effectiveJobMin - qualifyingExperienceYears) * 10) / 10;

  // 2. High Mandatory Experience Gap (e.g. 0 yrs candidate vs 2+ yrs, or gap >= 2)
  if (jobMin !== null && qualifyingExperienceYears < jobMin && reqType !== REQUIREMENT_TYPES.PREFERRED && !isFresherFriendly) {
    if ((qualifyingExperienceYears === 0 && effectiveJobMin >= 2) || overallGap >= 2.0) {
      return {
        status: 'INELIGIBLE',
        eligible: false,
        gapYears: overallGap,
        reason: effectiveJobMin >= 8
          ? `Role requires Staff/Principal seniority (${effectiveJobMin}+ years experience); candidate has ${qualifyingExperienceYears} years verified employment.`
          : (effectiveJobMin >= 5
            ? `Role requires Senior seniority (${effectiveJobMin}+ years experience); candidate has ${qualifyingExperienceYears} years.`
            : `Job requires ${effectiveJobMin}+ years mandatory professional experience; candidate has ${qualifyingExperienceYears} years.`),
        sourceText: targetJob.experienceSourceText,
        provenance: 'EXPERIENCE_GAP'
      };
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

  // 6. Skill-Specific Experience Evaluation (checked for candidates with sufficient overall foundation)
  if (targetJob.skillSpecificExperience && typeof targetJob.skillSpecificExperience === 'object') {
    let rawSkills = candidate.skills || candidate.topSkills || [];
    if (typeof rawSkills === 'string') {
      try {
        rawSkills = JSON.parse(rawSkills);
      } catch {
        rawSkills = rawSkills.split(',').map(s => s.trim());
      }
    }
    if (!Array.isArray(rawSkills)) rawSkills = [];
    const candidateSkills = rawSkills.map(s => (typeof s === 'string' ? s.toLowerCase() : (s.name || '').toLowerCase()));
    const candidateSkillYears = candidate.skillYears || {};

    for (const [skillName, spec] of Object.entries(targetJob.skillSpecificExperience)) {
      const sLower = skillName.toLowerCase();
      const hasSkill = candidateSkills.some(cs => cs.includes(sLower) || sLower.includes(cs));
      const yearsHave = candidateSkillYears[sLower] !== undefined ? candidateSkillYears[sLower] : (hasSkill ? qualifyingExperienceYears : 0);

      if (spec.minYears && yearsHave < spec.minYears) {
        if (spec.type === REQUIREMENT_TYPES.MANDATORY) {
          return {
            status: 'NEEDS_VERIFICATION',
            eligible: true,
            gapYears: Math.round((spec.minYears - yearsHave) * 10) / 10,
            reason: `Job requires ${spec.minYears}+ years experience in ${skillName}; candidate profile indicates ${yearsHave} years.`,
            sourceText: targetJob.experienceSourceText,
            provenance: 'SKILL_EXPERIENCE_GAP'
          };
        }
      }
    }
  }

  // 7. General Mandatory Experience Evaluation
  if (qualifyingExperienceYears >= effectiveJobMin) {
    if (jobMax !== null && qualifyingExperienceYears > jobMax + 3) {
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
    // Gap is small (1 year or less)
    if (overallGap <= 1.0) {
      return {
        status: 'NEEDS_VERIFICATION',
        eligible: true,
        gapYears: overallGap,
        reason: `Job specifies ${effectiveJobMin}+ years; candidate has ${qualifyingExperienceYears} years (${overallGap} yr gap may be bridged by domain depth or verified coursework).`,
        sourceText: targetJob.experienceSourceText,
        provenance: 'MARGINAL_GAP'
      };
    }

    return {
      status: 'INELIGIBLE',
      eligible: false,
      gapYears: overallGap,
      reason: effectiveJobMin >= 8
        ? `Role requires Staff/Principal seniority (${effectiveJobMin}+ years experience); candidate has ${qualifyingExperienceYears} years`
        : (effectiveJobMin >= 5
          ? `Role requires Senior seniority (${effectiveJobMin}+ years experience); candidate has ${qualifyingExperienceYears} years`
          : `Experience requirement gap of ${overallGap} years (${qualifyingExperienceYears} yrs vs ${effectiveJobMin}+ yrs mandatory).`),
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
    degreeLevel: /\bm\.?s(?:c)?\b|\bmaster/i.test(eduStr) ? 'MASTER' : 'BACHELOR'
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
 * Supports safe batching (limit, offset), force re-indexing, idempotency, and audit logging.
 */
async function backfillExistingJobs(prismaClient, { limit = 50, offset = 0, force = false, triggeredBy = 'system' } = {}) {
  if (!prismaClient) return { updated: 0, skipped: 0, total: 0, limit: Number(limit) || 50, offset: Number(offset) || 0, hasMore: false };

  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200); // capped between 1 and 200
  const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const whereClause = force
    ? {}
    : {
        OR: [
          { experienceVerificationStatus: 'UNSPECIFIED' },
          { minExperienceYears: null, isFresherFriendly: false }
        ]
      };

  const totalMatching = await prismaClient.job.count({ where: whereClause });
  const jobs = await prismaClient.job.findMany({
    where: whereClause,
    skip: parsedOffset,
    take: parsedLimit,
    orderBy: { createdAt: 'desc' }
  });

  let updated = 0;
  let skipped = 0;
  const auditEntries = [];

  for (const job of jobs) {
    const classification = classifyJobExperience(job);
    const hasData = classification.experienceVerificationStatus !== VERIFICATION_STATUS.UNSPECIFIED || classification.isFresherFriendly || force;
    
    if (hasData) {
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
          graduationYearRestrictions: classification.graduationYearRestrictions,
          skillSpecificExperience: classification.skillSpecificExperience,
          sponsorshipAvailable: classification.sponsorshipAvailable
        }
      });
      updated++;
      auditEntries.push({
        jobId: job.id,
        title: job.title,
        company: job.company,
        minYears: classification.minExperienceYears,
        category: classification.experienceCategory,
        fresherFriendly: classification.isFresherFriendly
      });
    } else {
      skipped++;
    }
  }

  const logMessage = `[FEAT-016 Backfill Audit] Triggered by ${triggeredBy}: batch offset=${parsedOffset}, limit=${parsedLimit}. Updated: ${updated}, Skipped: ${skipped}, Remaining in query: ${Math.max(0, totalMatching - (parsedOffset + jobs.length))}`;
  console.log(logMessage);

  return {
    total: totalMatching,
    processed: jobs.length,
    updated,
    skipped,
    offset: parsedOffset,
    limit: parsedLimit,
    hasMore: (parsedOffset + jobs.length) < totalMatching,
    audit: auditEntries
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
