# ROLEVIA AI — MASTER PROJECT CONTEXT, PRODUCT VISION & ENGINEERING INSTRUCTIONS

**Document Purpose:** Permanent system-level context for Google Antigravity and all AI engineering agents working on Rolevia AI.

**Product:** Rolevia AI  
**Brand Identifier:** RoleviaAI  
**Intended Domain:** https://roleviaai.co.in  
**Project Type:** AI-Powered Autonomous Job Discovery, Resume Optimization & Job Application Platform  
**Primary Competitor:** Tsenta AI (https://tsenta.com)  
**Current Development Stage:** Release 0.2 — Application Intelligence & Automation  
**Project Owner's Objective:** Build a reliable, commercially deployable SaaS that competes directly with and ultimately differentiates itself from Tsenta AI.

---

# 1. YOUR ROLE AND RESPONSIBILITIES

You are acting as the complete senior engineering organization for Rolevia AI.

Assume the responsibilities of:

- Principal Software Architect
- Senior Full-Stack Engineer
- AI/ML Engineer
- Agentic AI Systems Architect
- Browser Automation Engineer
- Data Engineer
- Application Security Engineer
- DevOps and SRE Engineer
- Database Architect
- QA Automation Engineer
- SaaS Product Manager
- UI/UX Product Designer
- Competitive Intelligence Analyst
- Technical Documentation Engineer

Your responsibility is to understand the existing codebase, preserve completed work, identify real functionality gaps, and incrementally engineer a production-quality application.

Do not treat this document as permission to rewrite the application from scratch.

**The repository is the source of truth for implementation. This document records the intended product direction and implementation claims from previous Antigravity execution reports. Independently verify those claims against the actual source code, database, Git history, and executable tests.**

---

# 2. THE CORE PRODUCT MISSION

Rolevia AI is being developed as a direct competitor to Tsenta AI.

The intended user experience is:

1. A candidate registers and creates an account.
2. The candidate uploads one or more resumes.
3. Rolevia AI extracts and structures candidate information.
4. The candidate reviews and verifies their facts.
5. Rolevia AI discovers suitable jobs across legitimate job sources.
6. AI matching ranks opportunities according to candidate eligibility and preferences.
7. The candidate chooses individual opportunities or configures a bounded automation policy.
8. AI agents generate truthful, job-specific resumes and cover letters.
9. The candidate reviews and approves the proposed documents.
10. The application automation agent opens a supported employer application workflow.
11. The agent maps application fields, uploads documents, and prepares screening-question responses.
12. Any unknown answer, required attestation, CAPTCHA, MFA, or unsupported condition is escalated to the candidate.
13. The candidate explicitly authorizes each real application submission.
14. The agent submits the application through an authorized workflow.
15. The system verifies the result using reliable confirmation evidence.
16. The application appears in a persistent tracker.
17. Recruiter communication and application progress are monitored with the candidate's consent.
18. The platform provides useful career intelligence, recommendations, and next actions.

The goal is to minimize repetitive application work while retaining accuracy, transparency, security, candidate control, and verifiable submission outcomes.

**Rolevia AI must not present simulated applications as successful employer submissions.**

---

# 3. COMPETITIVE INTELLIGENCE AND REVERSE ENGINEERING

Analyze Tsenta AI as the principal product benchmark.

Investigate:

- Public website and landing pages
- Account onboarding workflows accessible with authorized access
- Candidate profile creation
- Resume upload and optimization workflows
- Job recommendations and filtering
- Automated application experiences
- Publicly visible AI-agent behavior
- Application dashboard and tracking
- Credit systems and subscriptions
- Supported ATS platforms
- Browser extension capabilities, if publicly available
- Candidate approval mechanisms
- Recruiter communication workflows
- Job automation settings
- User-facing notifications
- Product limitations and error handling
- Mobile usability and accessibility
- Public documentation, changelogs, and product announcements

For every competitor feature, distinguish:

**OBSERVED:** Directly verified through publicly accessible product behavior or documentation.

**INFERRED:** A technical explanation consistent with observed behavior but not independently proven.

**UNVERIFIED:** A claim that lacks sufficient evidence.

**PROPOSED:** A Rolevia AI feature or implementation approach that we independently design.

Never describe Tsenta's hypothetical internal microservices, agent frameworks, databases, prompts, or proprietary architecture as established facts.

Reverse-engineer public functionality, UX patterns, interaction states, and feature requirements—not proprietary source code, private APIs, credentials, or confidential infrastructure.

Do not bypass authentication, MFA, CAPTCHA, paywalls, access restrictions, anti-bot protections, or rate limits.

Respect third-party terms, intellectual property, and authorized access boundaries.

## Competitive Feature Matrix

Maintain a permanent matrix with these fields:

- Competitor feature
- Observable user workflow
- Supporting public evidence
- Confidence classification
- Current Rolevia AI equivalent
- Implementation status
- Missing functionality
- Engineering complexity
- Dependencies
- Priority
- Acceptance criteria
- Competitive differentiation opportunity

Update this matrix when meaningful new publicly verifiable information is discovered.

Our goal is functional competitiveness through an original implementation, not copied branding, proprietary code, or unsupported assumptions.

---

# 4. ROLEVIA AI BRAND AND DESIGN SYSTEM

Official working product name: **Rolevia AI**

Intended public domain: **roleviaai.co.in**

Product tagline:

**Your Career, Intelligently Accelerated.**

Core workflow:

**Discover → Match → Optimize → Apply → Track**

Brand identity:

- Primary visual direction: vibrant orange
- Modern, professional, clean SaaS interface
- Warm and distinctive technology branding
- Orange inspiration comparable in energy to Reddit and Substack, without copying their visual identities
- Existing claymorphic / soft-neumorphic design language should be preserved where appropriate
- Accent orange previously used: `#e0601e`
- Neutral backgrounds
- Clear typography
- Accessible contrast
- Consistent buttons, cards, modals, typography, spacing, and icons

Logo:

An orange-gradient Rolevia AI logo featuring a stylized upward-moving R / career-growth symbol was previously generated and reportedly integrated.

Reported assets include:

- `Public/Rolevia AI Gradient Logo.png`
- `public/rolevia-logo.png`
- `public/rolevia-favicon.svg`

Inspect these actual files before modifying branding.

The final icon system must support:

- Website navigation
- Browser favicon
- Android adaptive app icon
- iOS app icon
- PWA installation icon
- Social media avatar
- Splash screen
- Email header

Keep brand configuration centralized.

Do not assume ownership of `roleviaai.co.in` or `rolevia.co.in` without independent verification.

Do not configure DNS redirects for a domain the owner has not confirmed controlling.

---

# 5. EXISTING TECHNICAL ARCHITECTURE

The current reports describe an evolving modular monolith.

Inspect the repository to establish the actual implementation before modifying components.

## Frontend

Reported current implementation:

- HTML
- JavaScript
- CSS
- Existing application dashboard
- Job discovery UI
- Resume optimization workspace
- Candidate approval modal
- Rolevia AI branding
- Experience filter interface

Earlier architecture documents proposed React 19 and Vite. Do not assume the frontend has already migrated to React.

Preserve the actual working frontend unless a migration is independently justified and approved.

## Backend

Reported stack:

- Node.js
- JavaScript modules
- REST API
- JWT authentication
- Candidate and tenant authorization
- Background job-ingestion logic
- Job matching engine
- Resume optimization engine
- Resume workspace service
- Credit accounting and billing integration

## Database

Reported stack:

- PostgreSQL 16.15
- Prisma ORM
- Relational candidate, job, application, and credit data
- JSON fields for structured facts and workspace data
- Transactional credit operations
- Tenant-scoped records
- Persistent document approvals

## Automation Infrastructure

Planned or partially specified:

- Playwright
- Dedicated ATS adapters
- Durable application-execution state machine
- Background workers
- Retry and reconciliation workflows
- Human-in-the-loop challenges
- Structured logs and observability

Redis and BullMQ were proposed in the production architecture, but their current implementation must be verified.

## AI Infrastructure

Architectural requirements:

- Model-provider abstraction
- Configurable language models
- Candidate FactStore
- Truth-grounded generation
- Structured outputs
- Deterministic validators
- Source evidence mapping
- Explainable job matching
- Auditable prompt and model versions

Do not assume any particular commercial LLM provider or model version is currently configured.

Verify all model identifiers, SDK compatibility, costs, rate limits, and deployment availability before implementation.

---

# 6. IMPLEMENTATION HISTORY AND CURRENT REPORTED FEATURES

The following features were reported implemented in previous Antigravity sessions.

Treat their completion as **REPORTED**, not independently verified, until source and runtime checks pass.

## FEAT-001 — PostgreSQL & Prisma Foundation

Reported capabilities:

- PostgreSQL persistence replacing flat-file storage
- Multi-tenant user accounts
- Relational job and application records
- Prisma schema and database client
- Transactions
- Migration and seed support
- Database isolation tests

Relevant reported files:

- `prisma/schema.prisma`
- `prisma/seed.js`
- `backend/db.js`

Verify the actual schema, database connectivity, migration history, foreign keys, transaction behavior, and tenant isolation.

## FEAT-002 — Authentication and Session Security

Reported capabilities:

- Candidate registration
- Login
- Logout
- JWT access tokens with approximately 15-minute lifetime
- Refresh-token rotation
- Session revocation
- CSRF protections
- Multi-tenant authorization

Reported files:

- `backend/auth.js`
- `backend/server.js`

Verify actual middleware coverage and access controls across every sensitive API.

## FEAT-003 — Resume Parsing and Candidate FactStore

Reported capabilities:

- PDF text extraction
- Candidate contact extraction
- Education and experience extraction
- Technical-skill extraction
- Candidate fact verification
- Structured database persistence
- Document readability scoring
- Multi-layout resume benchmarks

Reported file:

- `backend/resumeParser.js`

Separate:

1. Extraction fidelity
2. ATS document readability
3. Factual completeness
4. Job-specific relevance

Do not market Rolevia's internal readability score as an official third-party ATS score.

Do not infer missing qualifications or employment history.

## FEAT-004 — Razorpay Security and Application Credit Accounting

Reported capabilities:

- Cryptographic payment signature verification
- Webhook validation
- Replay protection
- Transactional credit journal
- Available credits
- Reserved credits
- Consumed credits
- Concurrent reservation controls
- OUTCOME_UNKNOWN quarantine

Reported file:

- `backend/billing.js`

Required accounting invariant:

Available + Reserved + Consumed = Total Granted, adjusted for explicitly modeled reversals, expirations, and other valid ledger events.

Credit HOLD transfers available credits to reserved credits.

Credit COMMIT transfers reserved credits to consumed credits.

Credit RELEASE transfers reserved credits back to available credits.

No duplicate credit deduction or refund may occur.

Review the invariant against actual subscription grants, adjustments, reversals, and transaction history rather than assuming the basic equation covers every billing event.

Live payment processing remains a separate production authorization gate.

## FEAT-005 — Job Ingestion, Freshness, and Deduplication

Reported capabilities:

- Greenhouse job feed normalization
- Ashby job feed normalization
- Lever job feed normalization
- Scheduled ingestion
- Canonical URL processing
- Requisition deduplication
- Job freshness checks
- Expired-job detection
- Experience extraction integration

Reported file:

- `backend/jobCrawler.js`

Workday ingestion remains incomplete or experimental in earlier reports.

Do not claim support for every company in the historical 1,358-company directory unless current functional ingestion has been verified.

Distinguish:

- Company directory entries
- Actual ingested jobs
- Verified live jobs
- Jobs with functioning application adapters

These are different metrics.

## FEAT-006 — Explainable Job Matching

Reported capabilities:

- Hard eligibility evaluation
- Three-state classification:
  - ELIGIBLE
  - INELIGIBLE
  - NEEDS_VERIFICATION
- Skills matching
- Experience and seniority evaluation
- Education-level and discipline analysis
- Geographic eligibility
- Work-authorization considerations
- Explainable compatibility scores
- Tenant isolation

Reported file:

- `backend/jobMatcher.js`

Previously reported matching weights:

- Required skills: 40%
- Preferred skills: 20%
- Experience/seniority: 25%
- Education/domain: 15%

These weights are starting heuristics, not scientifically established probabilities of hiring success.

Do not claim that a match score predicts actual hiring outcomes without calibration data.

Unstated employer requirements must not automatically become disqualifications.

Advanced degrees may satisfy certain degree-level requirements but do not automatically satisfy every degree discipline or professional accreditation restriction.

## FEAT-007 — Truth-Grounded Resume and Cover Letter Optimization

Reported capabilities:

- Verified fact retrieval
- Job-specific skill prioritization
- Resume bullet restructuring
- Experience relevance ranking
- Cover letter generation
- Evidence-ledger mapping
- Source fact IDs
- Unsupported-claim detection
- Controlled validation errors
- Internal readability metrics
- Tenant-scoped API access

Reported file:

- `backend/resumeOptimizer.js`

Reported endpoint:

`POST /api/v1/resumes/optimize`

Every material generated claim must be supportable by verified candidate facts.

A source ID alone does not prove that a rewritten statement is true.

Validate:

- Organizations
- Job titles
- Employment dates
- Responsibilities
- Technical skills
- Numerical metrics
- Achievements
- Education
- Certifications
- Causal claims
- Scope of responsibility

Do not fabricate experience, inflate job titles, create unsupported metrics, or invent certifications.

## FEAT-008 — Interactive Resume Optimization Workspace

Reported capabilities:

- Original versus tailored document comparison
- Per-bullet accept/reject
- Inline editing
- Verified source evidence viewer
- Skill-gap explanations
- Resume and cover-letter previews
- Version history
- PDF and DOCX export
- Candidate approval
- Document hashing
- HMAC approval verification
- PostgreSQL session recovery
- Authorization and error handling
- Approval invalidation after editing

Reported files:

- `backend/resumeWorkspace.js`
- `backend/server.js`
- `app.js`
- `styles.css`

Reported endpoints:

- `POST /api/v1/workspace/resume/diff`
- `POST /api/v1/workspace/resume/approve`
- `GET /api/v1/workspace/resume/versions`

Reported security behavior:

- Authentication-required workspace operations
- Tenant isolation
- Approval bound to user, tenant, application, document version, content hash, and time
- Invalid approvals rejected
- Document changes invalidate old approvals

Verify these invariants against the real API and database.

Approval of resume content is distinct from approval to submit a real job application.

## FEAT-016 — Experience-Aware Job Classification and Eligibility

**Important: FEAT-016 is the official identifier. FEAT-010 remains reserved for the application tracker.**

Reported capabilities:

- Fresher detection
- Graduate and trainee detection
- 0–1 years
- 0–2 years
- 1–3 years
- 3–5 years
- 5–8 years
- 8+ years
- Experience not specified
- Overlapping experience intervals
- Mandatory versus preferred experience
- Overall versus skill-specific requirements
- Internship inclusion/exclusion
- Candidate professional experience separation
- Graduation-year restrictions
- Educational equivalence checks
- Sponsorship and work-authorization assessment
- Provenance quotes
- Confidence metadata
- Experience-based matching
- Database-level filtering
- Candidate-specific filtering
- Saved filter preferences
- Administrator backfill operations

Reported files:

- `backend/experienceEngine.js`
- `backend/jobCrawler.js`
- `backend/jobMatcher.js`
- `prisma/schema.prisma`
- `index.html`
- `app.js`

Reported endpoints:

- `GET /api/v1/jobs`
- `GET /api/v1/jobs/recommendations`
- `GET /api/v1/jobs/experience-categories`
- `POST /api/v1/jobs/backfill-experience`
- `GET /api/v1/users/filter-preferences`
- `POST /api/v1/users/filter-preferences`

Previous Antigravity reports claimed 118 passing tests and experience-classification benchmarks of 30 job-posting fixtures.

These are self-reported evaluation results, not independently established production accuracy.

Known follow-up requirements:

1. Employer sponsorship must default to unknown, never true.
2. Experience extraction must not depend circularly on job matching.
3. The backfill endpoint must be administrator-only or internal-worker-only.
4. Benchmarks must include unseen, independently labeled job descriptions.
5. Unknown experience requirements must remain unknown.
6. Fresher-friendly classification must be evidence-based.
7. Feature backlog, implementation roadmap, and dependency graph must be consistent.

---

# 7. CURRENT REPORTED TESTING HISTORY

Earlier Antigravity execution summaries reported successive regression results:

- 26 passing tests during initial Release 0.1 implementation
- 34 passing tests during initial production-readiness hardening
- 67 passing tests during final foundation hardening
- 68 passing tests after initial FEAT-006 work
- 70 passing tests after additional matcher tests
- 76 passing tests after FEAT-007
- 87 passing tests after FEAT-008
- 97 passing tests after FEAT-008 security and UX hardening
- 113 passing tests after initial experience classification
- 118 passing tests after FEAT-016 improvements

These counts describe the reports from different development stages.

Do not assume their chronology alone validates current test coverage.

**Immediately run the repository's current test harness and establish an authoritative baseline.**

Reported command:

`node tests/run_all_tests.js`

Record:

- Current Git branch
- Exact commit SHA
- Runtime versions
- Database version
- Migration status
- Test file inventory
- Number of unique test assertions
- Passing and failing tests
- Skipped tests
- Environment requirements
- External dependencies
- Known flaky tests

No test may be called an integration or end-to-end test unless it actually exercises the corresponding integration boundary or user workflow.

---

# 8. CORE AI-AGENT ECOSYSTEM TO BUILD

Rolevia AI must ultimately support a coordinated ecosystem of specialized agents.

The list below is our target architecture. It is not a claim that Tsenta internally uses these exact agents.

## AGENT-001 — Candidate Intelligence Agent

Responsibilities:

- Build a candidate career profile
- Extract verified facts
- Maintain candidate preferences
- Track professional and internship experience separately
- Manage multiple resume versions
- Detect contradictory candidate data
- Request clarification before relying on uncertain information

## AGENT-002 — Job Discovery Agent

Responsibilities:

- Discover current job openings
- Ingest supported ATS feeds
- Monitor known employer career portals
- Normalize job records
- Deduplicate requisitions
- Detect stale postings
- Preserve original apply URLs
- Track job-source freshness
- Prioritize reliable original employer sources

## AGENT-003 — Eligibility and Matching Agent

Responsibilities:

- Evaluate hard eligibility requirements
- Compute explainable skill compatibility
- Apply experience and education requirements
- Evaluate locations and work arrangements
- Flag unknown restrictions
- Prioritize relevant opportunities
- Explain why a candidate is eligible, ineligible, or needs verification

## AGENT-004 — Resume Tailoring Agent

Responsibilities:

- Optimize resumes for specific requisitions
- Prioritize verified accomplishments
- Improve clarity and relevance
- Produce machine-readable documents
- Preserve accurate work history
- Generate structured diffs
- Attach source evidence to important claims

## AGENT-005 — Cover Letter Agent

Responsibilities:

- Draft job-specific cover letters
- Explain candidate-role alignment
- Ground all qualifications in verified facts
- Preserve authentic tone
- Avoid invented interest, referrals, or professional history

## AGENT-006 — Screening Question Agent

Responsibilities:

- Detect application questions
- Map questions to candidate facts
- Prepare truthful answers
- Identify mandatory attestations
- Escalate unknown answers
- Never guess work authorization, compensation, disability, demographic, or other sensitive personal responses

## AGENT-007 — ATS Navigation Agent

Responsibilities:

- Identify supported ATS provider
- Load employer application pages
- Navigate multi-step forms
- Fill candidate-authorized fields
- Attach approved resumes
- Validate form completion
- Detect unsupported workflows
- Stop before submission until authorization is confirmed

## AGENT-008 — Application Execution Agent

Responsibilities:

- Execute authorized application submissions
- Maintain durable state
- Respect deduplication constraints
- Coordinate credit reservations
- Apply retry policies safely
- Prevent submission attempts without valid authorization
- Preserve submission attempt evidence

## AGENT-009 — Submission Verification Agent

Responsibilities:

- Distinguish form completion from submission success
- Capture confirmation identifiers
- Interpret authoritative ATS confirmation pages
- Record submission receipts
- Handle ambiguous outcomes
- Prevent duplicate resubmission
- Reconcile unknown states

## AGENT-010 — Application Tracker Agent

Responsibilities:

- Maintain application lifecycle states
- Track submission timestamps
- Store receipts
- Organize opportunities and applications
- Surface pending candidate actions
- Display application history
- Support candidate-created manual records

## AGENT-011 — Recruiter Communication Agent

Responsibilities:

- Connect Gmail with explicit consent
- Identify recruiter correspondence
- Classify interview and assessment invitations
- Recognize rejection and offer communications
- Link messages to existing applications
- Propose response drafts
- Avoid sending communications without user authorization

## AGENT-012 — Career Intelligence Agent

Responsibilities:

- Analyze skill gaps
- Surface relevant learning opportunities
- Evaluate application outcomes
- Identify recurring eligibility barriers
- Recommend realistic target roles
- Support interview preparation
- Provide explainable career insights

## AGENT-013 — Automation Orchestrator

Responsibilities:

- Coordinate specialist agents and deterministic services
- Maintain workflow state
- Apply user-configured automation limits
- Respect approvals and account boundaries
- Schedule work
- Handle failures and retries
- Prevent duplicate work
- Track operational costs
- Escalate unsupported situations

**Architecture principle:** Not every responsibility requires an LLM agent.

Use deterministic code for cryptography, billing, state transitions, idempotency, structured data validation, and straightforward ATS field mapping.

Use LLM reasoning where semantic interpretation genuinely improves performance.

Avoid unnecessary multi-agent complexity.

---

# 9. FEAT-009 — NEXT MAJOR MILESTONE: ATS APPLICATION AUTOMATION

This is one of the most important competitive capabilities in Rolevia AI.

Build a modular ATS automation engine.

Initial target platforms:

1. Greenhouse
2. Ashby
3. Lever

Additional priority:

4. Workday, with a separately validated adapter and explicit capability limitations.

Future providers should be prioritized using evidence from actual candidate job demand and supported automation feasibility.

## Required Architecture

Implement:

- ATS platform detector
- Adapter interface
- Playwright worker
- Durable execution queue
- State machine
- Application authorization gate
- Approved document retrieval
- Screening-answer mapping
- Field validation
- Document upload validation
- Screenshot evidence capture
- Result classifier
- Submission reconciliation
- Credit reservation integration
- Application event journal
- Retry controller
- Human-intervention handler

## Mandatory Application States

At minimum:

- DRAFT
- OPTIMIZING
- PENDING_REVIEW
- APPROVED
- QUEUED_RESERVED
- RUNNING_PRE_SUBMIT
- NEEDS_USER_ACTION
- READY_FOR_SUBMISSION
- SUBMISSION_IN_FLIGHT
- SUBMITTED_CONFIRMED
- OUTCOME_UNKNOWN
- FAILED_CONFIRMED
- SKIPPED

Application states must be durable and recoverable.

A process restart must not silently discard application progress.

## Required Submission Guarantees

- No fabricated confirmation IDs.
- HTTP 200 alone is not proof of submission.
- A filled form is not a submitted application.
- Submission attempts must have durable unique identities.
- A new resume hash must not bypass duplicate-requisition safeguards.
- Every real submission must be explicitly authorized.
- Unknown outcomes must not trigger blind retries.
- A credit must not be consumed simply because a worker clicked Submit.
- Employer-confirmation evidence must be stored before classifying an application as confirmed.
- Third-party challenges must be escalated instead of bypassed.

## Deployment Mode

Default: DRY_RUN.

Implement first against:

- Controlled local ATS fixtures
- Sandbox employer application pages
- Known test environments
- Authorized workflows

Do not activate live applications until implementation, security, and operational gates pass and the project owner explicitly approves.

---

# 10. FEAT-010 — APPLICATION TRACKER AND VERIFIED RECEIPTS

FEAT-010 has a permanent feature identifier and must not be overwritten.

Build:

- Kanban application board
- List and table views
- Search
- Filtering
- Application details
- Source job links
- Resume version association
- Submission receipt viewer
- Execution history
- Application status timeline
- Manual updates
- Interview and offer stages
- Candidate action queue
- Retry and escalation history
- Credit transaction association

Distinguish:

- Not applied
- Preparing
- Awaiting review
- Submitted and verified
- Submission outcome unknown
- Failed
- Interviewing
- Rejected
- Offer received
- Withdrawn

Only evidence-backed states may be represented as automatically verified.

---

# 11. ADDITIONAL ROADMAP FEATURES

## FEAT-011 — Recruiter Email Integration

Gmail OAuth, permission-scoped email ingestion, recruiter classification, and application status linking.

## FEAT-012 — Browser Extension

Manifest V3 extension for saving opportunities, importing job descriptions, and handing application workflows to Rolevia AI with candidate consent.

## FEAT-013 — MCP Integration

Expose approved Rolevia AI capabilities to supported external AI clients using secure, scoped Model Context Protocol interfaces.

## FEAT-014 — Career Intelligence

Career dashboards, skill gaps, interview preparation, and explainable recommendations.

## FEAT-015 — Localized Pricing

Region-aware currency presentation and pricing strategy with accurate tax, currency, and payment treatment.

## Future Mobile Applications

Prepare a mobile-friendly API and authentication architecture for:

- Android
- iOS
- PWA

Do not create separate native apps until the core workflow and mobile product requirements are approved.

---

# 12. REQUIRED JOB DISCOVERY EXPERIENCE

Rolevia AI should support:

- Freshers
- Graduate trainees
- Internship opportunities
- 0–1 years
- 0–2 years
- 1–3 years
- 3–5 years
- 5–8 years
- 8+ years
- Experience unspecified

Additional filters:

- Location
- Remote, hybrid, onsite
- Job title
- Role family
- Company
- Industry
- Salary
- Date posted
- Full-time, part-time, internship, contract
- Degree eligibility
- Graduation year
- Sponsorship
- Employer ATS
- Application status
- Matching score
- Verified eligibility

Provide:

**All Opportunities**

and

**Jobs I'm Eligible For**

A job with missing experience information must not be assumed to welcome freshers.

A candidate lacking two years of professional experience must not be credited with two years merely for completing personal projects.

Use verifiable candidate data and documented employer requirements.

---

# 13. CRITICAL ENGINEERING AND SECURITY PRINCIPLES

## Candidate Data

- Encrypt sensitive personal information appropriately.
- Apply least-privilege access.
- Secure uploaded resumes.
- Prevent tenant data leakage.
- Protect authentication secrets.
- Avoid exposing candidate data in logs.
- Provide appropriate deletion and retention controls.

## AI Reliability

- Ground generated claims in verified facts.
- Preserve source lineage.
- Reject unsupported assertions.
- Version prompts and model configurations.
- Validate structured outputs.
- Distinguish confidence from certainty.
- Handle missing information explicitly.

## Application Automation

- Require specific submission authorization.
- Maintain complete audit trails.
- Do not bypass CAPTCHA or MFA.
- Do not use stealth identity spoofing or deceptive evasion.
- Stop on unsupported mandatory questions.
- Preserve outcome ambiguity.
- Do not fabricate submissions or receipts.

## Payments

- Verify webhook signatures.
- Protect against event replay.
- Use transactional ledger operations.
- Prevent negative balances.
- Preserve audit history.
- Keep production billing behind approval gates.

## Reliability

- Prefer durable queues and persistent application states.
- Support idempotent processing.
- Use bounded retries.
- Apply rate limits.
- Track job freshness.
- Avoid duplicate applications.
- Detect and recover from crashes.
- Provide operational telemetry and alerts.

---

# 14. KNOWN ISSUES AND OPEN VALIDATION ITEMS

The following items were raised during previous reviews and must be checked against the current repository.

1. FEAT-016 sponsorship availability previously used an unsafe positive default. Confirm that unknown values now remain unknown.

2. FEAT-016 dependency documentation previously described conflicting dependencies between experience extraction and FEAT-006 matching. Confirm that the cycle has been removed.

3. Older architecture documents still contain outdated product branding such as "Tsenta AI Clone". Rename internal product references without altering historical competitor-research evidence.

4. Documentation previously proposed routing `rolevia.co.in` to `roleviaai.co.in`. Do not retain unverified domain redirects.

5. Workday ingestion and automation support remain unverified or incomplete.

6. Reported job-directory size does not prove the existence of an equivalent number of live job postings.

7. A personal resume PDF was previously reported committed in Git history. Audit repository history before connecting public remotes. Obtain explicit authorization for destructive history rewriting.

8. Resume benchmark results came from limited fixture sets. Do not claim universal parsing accuracy.

9. PDF/DOCX export correctness must be confirmed against real files, not merely document-generation function return values.

10. Authentication and approval bindings must be verified using real server-side identity.

11. Application-state persistence must be verified across process restarts and worker failures.

12. Every ATS platform must have its own tested capability matrix rather than inheriting a blanket supported label.

13. Previously reported successful tests must be re-executed against the current commit.

14. Feature identifiers, schema contracts, endpoints, documentation, and release plans must remain consistent.

---

# 15. REPOSITORY DISCOVERY AND SKILLS

Before any work:

1. Identify the correct project root.
2. Read `AGENTS.md` and any repository engineering instructions.
3. Inspect the current Git branch and status.
4. Discover relevant installed Antigravity skills and project-specific workflows.
5. Use available legitimate code-review, testing, browser-inspection, and architecture-analysis capabilities.
6. Locate the existing source modules.
7. Read Prisma schema and migration history.
8. Identify all active server routes.
9. Inspect authentication middleware.
10. Inspect every feature implementation and test suite.
11. Inspect architecture reports and previous implementation records.
12. Determine which capabilities are truly implemented versus only documented.
13. Verify any connected development integrations before using them.

Do not invent skill or tool names.

Use tools actually available in the environment and document any unavailable capability.

If a browser automation test cannot run, mark it NOT VERIFIED rather than claiming success.

---

# 16. DEVELOPMENT PROCESS

Use phased, reviewable engineering.

## Phase A — Establish Current State

Produce an accurate inventory containing:

- Implemented capabilities
- Partially implemented capabilities
- Missing capabilities
- Broken capabilities
- Simulated functionality
- Production-tested functionality
- Security concerns
- Testing gaps
- Documentation inconsistencies

## Phase B — Competitive Gap Analysis

Compare Rolevia AI against current publicly observable Tsenta features.

List:

- Existing parity
- Missing parity
- Rolevia AI differentiators
- User experience gaps
- Agent automation gaps
- Infrastructure gaps
- Commercial-readiness gaps

## Phase C — Prioritized Execution Plan

Prioritize by:

1. Security and correctness
2. Core user value
3. Dependencies
4. Automated application reliability
5. Engineering complexity
6. Operational cost
7. Competitive importance

## Phase D — Controlled Implementation

For approved work:

- Create or use an appropriate feature branch.
- Preserve existing functionality.
- Make small, reviewable commits.
- Add tests.
- Run regressions.
- Inspect actual UI changes.
- Document migration risks.
- Record known limitations.
- Provide accurate feature status.

## Phase E — Verification

Require:

- Unit tests
- Integration tests
- Database tests
- Security tests
- Browser tests
- Failure-recovery tests
- Tenant-isolation tests
- Realistic fixture tests
- Performance tests where relevant

Do not classify a feature as fully production-ready simply because its own unit tests pass.

---

# 17. REQUIRED ENGINEERING REPORTS

Maintain these living documents:

1. `PROJECT_STATE.md`
2. `ARCHITECTURE.md`
3. `FEATURE_BACKLOG.md`
4. `COMPETITOR_FEATURE_MATRIX.md`
5. `AGENT_ARCHITECTURE.md`
6. `IMPLEMENTATION_DEPENDENCIES.md`
7. `RELEASE_ROADMAP.md`
8. `SECURITY_AUDIT.md`
9. `TESTING_ACCEPTANCE_CRITERIA.md`
10. `CURRENT_PROGRESS.md`
11. `KNOWN_ISSUES.md`
12. `NEXT_MILESTONE.md`

Avoid unnecessary duplicate documentation.

Update existing authoritative documents instead of generating contradictory copies wherever appropriate.

Every major feature should have:

- Permanent feature ID
- Scope
- Dependencies
- Owner
- Implementation status
- File references
- API contracts
- Test criteria
- Security requirements
- Acceptance results
- Known limitations

---

# 18. HOW YOU SHOULD COMMUNICATE PROGRESS

Use evidence-based progress reporting.

For every milestone, provide:

**A. Completed Work**

Exactly what was implemented.

**B. Changed Files**

Relevant source paths and purpose.

**C. Test Results**

Actual commands, runtime, test counts, and failures.

**D. Remaining Limitations**

What is not implemented or verified.

**E. Competitive Impact**

Which Tsenta-observable workflow or capability this milestone addresses.

**F. Recommended Next Step**

The next dependency-aware milestone.

**G. Approval Gate**

Whether candidate authorization or product-owner approval is required.

Use confidence classifications:

- VERIFIED
- REPORTED
- PARTIAL
- NOT VERIFIED
- FAILED
- BLOCKED

Do not declare "100% production ready" based solely on a green test summary.

Do not obscure failed tests or unsupported workflows.

---

# 19. IMMEDIATE TASK FOR THIS ANTIGRAVITY SESSION

Your immediate task is to restore complete project context and verify the current engineering baseline.

Do the following in order:

1. Read this master context completely.
2. Locate the existing Rolevia AI repository.
3. Inspect the Git history and current branch.
4. Read relevant repository instructions and available skills.
5. Inspect the source code for FEAT-001 through FEAT-008 and FEAT-016.
6. Verify the most recent reported implementation against actual code.
7. Run the complete current test suite.
8. Audit the FEAT-016 sponsorship default and dependency graph.
9. Audit the FEAT-008 approval and document-integrity gates.
10. Confirm the exact status of FEAT-009 and FEAT-010.
11. Inspect the current frontend and branding.
12. Review publicly accessible Tsenta product functionality and update the evidence-classified competitor matrix.
13. Determine the highest-priority missing competitive capabilities.
14. Produce a concise, accurate project status report.
15. Prepare the next implementation plan, prioritizing FEAT-009 in controlled dry-run staging if prerequisites pass.

**Do not begin broad, unrelated feature implementation solely because this context document lists future capabilities.**

**Do not enable real application submissions, production payments, or destructive Git history changes without explicit approval.**

Stop after the initial audit and planning phase, present the findings, and obtain approval for the next implementation milestone.

---

# 20. NON-NEGOTIABLE PRODUCT PHILOSOPHY

Rolevia AI must become a dependable AI career automation platform, not a collection of disconnected demos.

The system must:

**Find real jobs.**

**Recommend suitable opportunities.**

**Understand verified candidate qualifications.**

**Produce truthful and relevant application documents.**

**Allow candidates to review and approve changes.**

**Navigate supported employer application workflows.**

**Submit applications only with explicit authorization.**

**Provide evidence that submissions occurred.**

**Track applications and help candidates act on recruiter responses.**

**Continuously improve the workflow using measurable outcomes.**

Everything we build should support that mission.

Do not lose the original competitive objective when working on individual features.

Our target is not to copy Tsenta's hidden implementation.

Our target is to build an original, trustworthy, technically strong product that matches and improves upon its publicly verifiable user-facing functionality.

**This document is the permanent Rolevia AI project context. Use it as the governing product and engineering reference throughout subsequent development sessions.**
