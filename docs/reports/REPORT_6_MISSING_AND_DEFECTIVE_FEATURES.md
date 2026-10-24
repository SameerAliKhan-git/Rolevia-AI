# REPORT 6 — Missing and Defective Features Inventory
**Platform**: Autonomous AI Job Search & Application Platform (Tsenta AI Clone)  
**Date**: October 24, 2026  
**Auditor Role**: Principal Product Architect & Systems Engineer  

---

## 1. Classification Methodology

To establish a complete, unambiguous engineering roadmap, all capabilities are categorized into:
- **RETAIN**: Existing functionality that is production-ready, high quality, and should be preserved.
- **IMPROVE**: Partially implemented features that require hardening, scale, or better UX.
- **REPAIR**: Features currently implemented as mocks, simulations, or prototypes that must be replaced with real production logic.
- **BUILD**: Critical or missing capabilities required for parity with Tsenta and enterprise production standards.

---

## 2. Exhaustive Feature Inventory by Category

### CATEGORY 1: PLATFORM FOUNDATION
- **Multi-Tenant User Registration & Login**: **BUILD**. JWT Bearer authentication, bcrypt/argon2 password hashing, secure refresh tokens in HTTP-only cookies, password reset via email.
- **Relational Database Engine**: **BUILD**. Migrate from flat JSON (`store.json`) to PostgreSQL with Prisma ORM and automated database migrations.
- **Distributed Worker Queue**: **BUILD**. BullMQ + Redis for background job scheduling, retry policies, exponential backoff, and dead-letter queues.
- **Candidate Master Fact Store**: **BUILD**. Normalized schema storing verified career facts: contact, education, work experience, projects, skills, certifications, and work authorization preferences.
- **AdonisJS Transmit SSE Hub**: **IMPROVE**. Retain the `/__transmit/events` streaming architecture; fix the client socket disconnect leak and tie channels to authenticated tenant IDs.
- **Tactile Claymorphic UI**: **RETAIN**. Keep the tactile Claymorphic design tokens (`styles.css`), badge styles, and cards.

### CATEGORY 2: INTELLIGENT JOB DISCOVERY
- **1,358 Company Directory Integration**: **RETAIN & IMPROVE**. Ingestion from the 3 Google Sheets (Startups, Product Giants, Enterprise Services) is indexed in `company_directories.json`. Needs an automated background crawler.
- **Automated ATS Job Crawler**: **BUILD**. Automated crawler workers targeting Greenhouse, Ashby, and Workday endpoints for the 1,358 company portals on a 6-hour schedule.
- **Requisition Deduplication**: **BUILD**. Hash-based deduplication combining employer name, normalized job title, and ATS requisition ID to eliminate duplicate postings.
- **Live URL Health Check & Auto-Purge**: **RETAIN**. Keep `isJobUrlLive` and `purgeExpiredJobs` running on a 30-minute schedule to ensure zero broken or taken-down links.
- **Category & Region Filtering**: **RETAIN**. Keep UI filters for Startups, Product Giants, Enterprise Services, and geographic regions (US/Canada, Remote Worldwide, Europe/EMEA, India/APAC).

### CATEGORY 3: AI JOB MATCHING & EXPLAINABILITY
- **Semantic Vector Match Scoring**: **BUILD**. Replace heuristic keyword counts with cosine similarity embeddings (`text-embedding-3-small` / Gemini embeddings) comparing candidate facts against target job descriptions.
- **Hard Eligibility Constraint Evaluation**: **BUILD**. Programmatic checks for candidate graduation year, required degree level (B.Sc vs M.Sc), work authorization, and country eligibility.
- **Missing Skill Gap Explanations**: **BUILD**. Display specific missing keywords and competencies on job cards (e.g., "Missing: Kubernetes, CI/CD") with suggested learning pathways.

### CATEGORY 4: ADVANCED RESUME OPTIMIZATION
- **Dynamic PDF Resume Parser**: **REPAIR**. Replace the file size mock in `/api/v1/resume/parse` with `pdf-parse` / `unpdf` and an LLM extraction pipeline to parse any uploaded PDF into the candidate Fact Store.
- **Truth-Grounded Bullet Rewriter**: **REPAIR**. Replace hardcoded diff objects with an LLM prompting pipeline (Gemini / Claude) operating in `honest` mode: reframing existing experience to match job keywords without fabricating history.
- **Interactive Diff Review Modal**: **IMPROVE**. Enhance `#diff-modal` to allow candidates to click and edit any proposed bullet rewrite or reject specific suggestions before submission.
- **Tailored PDF Document Generator**: **BUILD**. Dynamic compilation of single-column ATS-compliant PDF resumes using Headless Chromium / Puppeteer HTML-to-PDF rendering.

### CATEGORY 5: AI JOB APPLICATION AGENT
- **Headless Browser Automation Engine**: **REPAIR**. Replace simulated `setTimeout` execution with a real **Playwright** browser automation worker pool.
- **Greenhouse ATS Adapter**: **BUILD**. Automated form fill: personal info, resume upload, cover letter, demographic dropdowns, custom screening question answers.
- **Ashby ATS Adapter**: **BUILD**. Automated JSON/REST form interaction and multi-step modal completion.
- **Workday ATS Adapter**: **BUILD**. Multi-page Workday navigation, candidate account creation/sign-in, resume upload, experience field mapping, and pre-submit review.
- **Human-in-the-Loop Pre-Submit Approval**: **IMPROVE**. Halt browser automation at the final review screen; display captured screenshot and answers to the candidate for 1-click authorization.
- **Application Receipt Generator**: **RETAIN & IMPROVE**. Keep the confirmation modal (`#receipt-modal`) and bind it to real HTTP 200 confirmation responses from the ATS.

### CATEGORY 6: APPLICATION MANAGEMENT & TRACKER
- **Interactive Kanban Board**: **IMPROVE**. Upgrade `renderKanban()` to support drag-and-drop state transitions synced to the database.
- **Application Status Sync**: **BUILD**. Automatic status updates reflecting submission, recruiter interview scheduling, and offer letters.

### CATEGORY 7: AI & MULTI-AGENT ORCHESTRATION
- **Deterministic vs Agentic Separation**: **BUILD**.
  - Deterministic services: Job ingestion, deduplication, URL health checking, credit billing, and document PDF compilation.
  - LLM Agentic services: Resume parsing, bullet point optimization, screening question answering, and recruiter email classification.
- **Strict Cost & Latency Controls**: **BUILD**. Enforce token limits, temperature controls (0.1 for factual accuracy), and cached prompt templates.

### CATEGORY 8: USER EXPERIENCE
- **Naukri-Style Candidate Profile**: **RETAIN & IMPROVE**. Keep education, experience, interactive skills addition/deletion, and verified certifications.
- **Claymorphic Danger Logout Buttons**: **RETAIN**. Keep the top navigation, profile card, and session security logout buttons with `#logout-modal`.
- **Multi-Currency Pricing Switcher**: **RETAIN**. Keep the ₹ INR, $ USD, and € EUR billing toggle.

### CATEGORY 9: INTEGRATIONS
- **Razorpay International Subscription Gateway**: **REPAIR**. Add server-side HMAC-SHA256 signature verification, webhook signature processing, and recurring plan synchronization.
- **Gmail / Recruiter Email Sync**: **REPAIR**. Replace mock recruiter cards in `app.js` with a real Gmail OAuth2 / IMAP ingestion worker that tags recruiter emails and drafts replies.
- **Chrome Extension (Manifest V3)**: **BUILD**. Browser extension to allow candidates to clip jobs from LinkedIn/Indeed into their cloud queue.
- **Model Context Protocol (MCP) Server**: **BUILD**. Stdio and HTTP MCP server exposing job search, resume tailoring, and queue inspection tools to Claude/Cursor.

### CATEGORY 10: SECURITY & PRODUCTION OPERATIONS
- **Secret & Key Isolation**: **BUILD**. Move all secrets (`RAZORPAY_KEY_SECRET`, `JWT_SECRET`, `LLM_API_KEY`) to an encrypted `.env` file; eliminate hardcoded test credentials.
- **Rate Limiting & CSRF Protection**: **BUILD**. Protect API endpoints against brute-force attacks and cross-site scripting.
- **Structured JSON Logging & Observability**: **BUILD**. Pino / Winston structured logging and Sentry error tracking for production reliability.
