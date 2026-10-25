# Rolevia AI · Experience-Aware Job Classification & Eligibility Engine (FEAT-010)

## Overview & Architecture Integration
The Rolevia AI experience-aware job classification and eligibility engine extends the platform's job ingestion (FEAT-005) and explainable matching (FEAT-006) modules. It replaces crude single-number thresholding with truth-grounded extraction, overlapping interval arithmetic, provenance tracking, candidate experience disaggregation, and dual discovery views.

### System Architecture
```
                           [Job Posting Text / Feed (FEAT-005)]
                                             │
                                             ▼
                             [Experience Extraction Engine]
                     ┌───────────────────────┴───────────────────────┐
                     ▼                                               ▼
         [Deterministic Regex Engine]                   [Provenance & Verification]
         - Fresher & Zero-Year Patterns                 - Source Quote Anchoring
         - Explicit Ranges [A, B]                       - Confidence Metric (0.0-1.0)
         - Minimums / Maximums                          - Tri-State Status (VERIFIED,
         - Preferred vs Mandatory Experience              NEEDS_VERIFICATION, UNSPECIFIED)
         - Internship Inclusion/Exclusion Gate          - Contradiction Detection
                     │                                               │
                     └───────────────────────┬───────────────────────┘
                                             │
                                             ▼
                              [PostgreSQL Job Schema Storage]
                              - minExperienceYears Float?
                              - maxExperienceYears Float?
                              - experienceCategory String?
                              - experienceRequirementType String
                              - experienceSourceText String?
                              - experienceExtractionConfidence Float?
                              - experienceVerificationStatus String
                              - isFresherFriendly Boolean
                              - acceptsInternships Boolean?
                              - graduationYearRestrictions Json?
                                             │
                     ┌───────────────────────┴───────────────────────┐
                     ▼                                               ▼
          [Interval Filter Engine]                      [Explainable Matcher (FEAT-006)]
          - [A, B] ∩ [C, D] Overlap Check               - Disaggregated Candidate Experience:
          - Infinite Upper Bound Support                  * Full-Time Professional Years
          - Multi-Facet DB & Memory Filtering             * Internship / Industrial Training Years
                                                          * Verified Project Demonstrations
                                                        - Preferred Exp Non-Penalty Rule
                                                        - MSc ≡ BTech/BSc Degree Equivalence
                                                        - Tri-State Eligibility (ELIGIBLE,
                                                          INELIGIBLE, NEEDS_VERIFICATION)
                                             │
                                             ▼
                                  [Frontend UI & API]
                      - Dual Views: All Jobs vs Jobs I'm Eligible For
                      - Clay-Neumorphic Orange Filter Bar (#e0601e)
                      - Live Interval Badges & Provenance Snippets
                      - Active Filter Preview & 1-Click "Copy selection"
```

---

## 1. Database Schema Extensions & Migration
The PostgreSQL/Prisma `Job` model was extended in [`prisma/schema.prisma`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/prisma/schema.prisma) with full indexing for sub-millisecond querying:

```prisma
model Job {
  id                             String        @id @default(uuid())
  company                        String
  title                          String
  url                            String
  applyUrl                       String?
  ats                            String
  atsName                        String
  location                       String?
  jobType                        String?
  salary                         String?
  postedAt                       String?
  requirements                   String        // JSON array string
  requisitionHash                String        @unique // SHA-256 deduplication
  status                         String        @default("ACTIVE")

  // Experience Classification & Intelligence Fields (FEAT-005/006 Integration)
  minExperienceYears             Float?
  maxExperienceYears             Float?
  experienceCategory             String?       // FRESHER, 0-1, 0-2, 1-3, 3-5, 5-8, 8+, NOT_SPECIFIED
  experienceRequirementType      String        @default("UNSPECIFIED") // MANDATORY, PREFERRED, UNSPECIFIED
  experienceSourceText           String?       // Verbatim extracted source quote
  experienceExtractionConfidence Float?        // 0.0 to 1.0 confidence score
  experienceVerificationStatus   String        @default("UNSPECIFIED") // VERIFIED, NEEDS_VERIFICATION, UNSPECIFIED
  isFresherFriendly              Boolean       @default(false)
  acceptsInternships             Boolean?      @default(false)
  graduationYearRestrictions     Json?         // Array of eligible graduation batches e.g. ["2025", "2026"]

  lastCheckedAt                  DateTime      @default(now())
  createdAt                      DateTime      @default(now())
  updatedAt                      DateTime      @updatedAt
  applications                   Application[]

  @@index([status])
  @@index([requisitionHash])
  @@index([minExperienceYears])
  @@index([maxExperienceYears])
  @@index([isFresherFriendly])
  @@index([experienceCategory])
  @@index([experienceVerificationStatus])
}
```

---

## 2. Extraction & Classification Engine Logic
Implemented in [`backend/experienceEngine.js`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/backend/experienceEngine.js):

1. **Fresher & Zero-Experience Detection**:
   - Matches keywords: "freshers welcome", "no prior experience required", "recent graduate", "entry level", "graduate trainee", "0 years".
   - Assigns `minExperienceYears: 0`, `maxExperienceYears: 0`, `category: FRESHER`, `isFresherFriendly: true`.
2. **Intervals & Overlapping Mathematics**:
   - Parses ranges: "0–1 years", "0–2 years", "1 to 3 years", "3-5 years", "5-8 years".
   - Interval overlap condition between posting `[A, B]` and filter `[C, D]`:
     $$\max(A, C) \le \min(B, D)$$
   - Roles requiring 1–3 years appropriately match candidate queries for 2 years or 0–2 years filters.
3. **Unbounded Upper Intervals**:
   - Parses "5+ years", "at least 3 years", "minimum 2 years".
   - Stores `maxExperienceYears: null` (unbounded), not 0 or fabricated integers.
4. **Preferred vs Mandatory Experience**:
   - Detects "experience preferred but not mandatory" or "preferred qualification".
   - Sets `experienceRequirementType: 'PREFERRED'`, ensuring candidates with 0 or fewer years are NOT marked ineligible or penalized in scoring.
5. **Separation of Candidate Experience Types**:
   - Separates full-time employment, internships/industrial training, and verified project experience.
   - Evaluates `acceptsInternships: true` when postings explicitly mention "internship experience accepted" or for entry-level/fresher categories.
6. **No Title Guessing & Ambiguity Handling**:
   - Associate Engineer, SDE I, Analyst, Junior Developer without explicit experience statements remain `NOT_SPECIFIED` with `status: NEEDS_VERIFICATION`.
   - Conflicting statements (e.g. "Entry-level role" combined with "minimum 5 years") are flagged as `NEEDS_VERIFICATION`.
7. **MSc Degree Equivalence**:
   - Candidates holding M.Sc Computer Science meet Bachelor's requirements (BSc, BTech, BCA) without automated disqualification unless the employer explicitly restricts the role to undergraduate degrees only.

---

## 3. Sample API Responses

### A. Experience Categories & Live Counts
`GET /api/v1/jobs/experience-categories`
```json
{
  "success": true,
  "counts": {
    "all": 33,
    "fresher": 6,
    "0-1": 11,
    "0-2": 15,
    "1-3": 8,
    "3-5": 5,
    "5-8": 4,
    "8+": 2,
    "unspecified": 3
  }
}
```

### B. Filtered Recommendations with Explainable Provenance
`GET /api/v1/jobs?experienceRange=0-1&eligibilityMode=eligible_only&view=eligible`
```json
{
  "success": true,
  "view": "eligible",
  "total": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1,
  "jobs": [
    {
      "id": "job-fintech-fresher-001",
      "company": "Apex Fintech",
      "title": "Junior Backend Developer (2025/2026 Batch)",
      "url": "https://apexfintech.test/jobs/jr-dev",
      "ats": "greenhouse",
      "location": "Remote",
      "salary": "$85,000 - $110,000",
      "experience": {
        "min": 0,
        "max": 1,
        "category": "0-1",
        "type": "MANDATORY",
        "isFresherFriendly": true,
        "acceptsInternships": true,
        "verificationStatus": "VERIFIED",
        "sourceSnippet": "Looking for fresh graduates (2025/2026 batch) or candidates with 0-1 years of software development experience.",
        "confidence": 0.95
      },
      "eligibility": {
        "status": "ELIGIBLE",
        "isFresherEligible": true,
        "reason": "Matches verified experience profile (0.50 yrs relevant experience vs 0-1 yrs required)",
        "sourceSnippet": "Looking for fresh graduates (2025/2026 batch) or candidates with 0-1 years of software development experience.",
        "experienceDeficit": 0
      }
    }
  ]
}
```

---

## 4. Test Suite Execution & Acceptance Criteria Matrix

| Criterion | Requirement | Test Suite & ID | Result |
| :--- | :--- | :--- | :---: |
| **0 Years / Fresher** | Fresh graduates / 0 yrs classified as FRESHER (0 min, 0 max) | `GATE-11 [EXP 1/16]` | **PASS** |
| **0–1 Years** | 0-1 interval classified with min=0, max=1, isFresherFriendly=true | `GATE-11 [EXP 2/16]` | **PASS** |
| **0–2 Years** | 0-2 interval classified with min=0, max=2, isFresherFriendly=true | `GATE-11 [EXP 3/16]` | **PASS** |
| **1–3 Years Overlap** | Overlapping interval arithmetic correctly matches 2-year profiles | `GATE-11 [EXP 4/16]` | **PASS** |
| **3–5 Years Exclusion**| Correctly excluded from fresher/0-1 filters | `GATE-11 [EXP 5/16]` | **PASS** |
| **5+ Years Unbounded** | Modeled as min=5, max=null without artificial ceiling | `GATE-11 [EXP 6/16]` | **PASS** |
| **Minimum-Only** | "At least 3 years" parsed with min=3, max=null | `GATE-11 [EXP 7/16]` | **PASS** |
| **Maximum-Only** | "Up to 5 years" parsed with min=0, max=5 | `GATE-11 [EXP 8/16]` | **PASS** |
| **Internships Accepted**| Internships counted toward required experience when permitted | `GATE-11 [EXP 9/16]` | **PASS** |
| **Internships Excluded**| Strict full-time requirement enforced without internship inflation | `GATE-11 [EXP 10/16]` | **PASS** |
| **Preferred Experience**| Preferred qualification does not block fresh candidate eligibility | `GATE-11 [EXP 11/16]` | **PASS** |
| **No Title Guessing** | Unstated experience avoids guessing; flags `NEEDS_VERIFICATION` | `GATE-11 [EXP 12/16]` | **PASS** |
| **Contradictory Rules**| Conflicting statements flagged as `NEEDS_VERIFICATION` | `GATE-11 [EXP 13/16]` | **PASS** |
| **MSc Equivalence** | M.Sc satisfies BSc/BTech requirement without auto-rejection | `GATE-11 [EXP 14/16]` | **PASS** |
| **Tenant Isolation** | Multi-tenant database partitioning strictly preserved | `GATE-11 [EXP 15/16]` | **PASS** |
| **Combined Filtering** | Complex query (startup + 0-2 yrs overlap + pagination) verified | `GATE-11 [EXP 16/16]` | **PASS** |

---

## 5. Remaining Limitations
1. **ATS Semantic Variants**: Novel phrasing outside standard English formats (e.g. non-English ATS feeds or Roman numerals like "IV years") falls back to `NOT_SPECIFIED` with `NEEDS_VERIFICATION`.
2. **Workday Dynamic Crawling**: Workday job requisitions require session cookies and multi-step modal rendering, which remains scoped for Release 0.2 Playwright automation.
3. **Automated Submissions**: FEAT-009 automated application submissions remain gated until candidate profile approval sign-off.
