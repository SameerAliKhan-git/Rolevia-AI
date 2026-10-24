# REPORT 3 — End-to-End Code Review
**Platform**: Autonomous AI Job Search & Application Platform (Tsenta AI Clone)  
**Date**: October 24, 2026  
**Auditor Role**: Principal Software Architect & Staff Application Security Engineer  
**Files Audited**:
- [`backend/server.js`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/backend/server.js) (Lines 1–574)
- [`backend/database/store.json`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/backend/database/store.json)
- [`app.js`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/app.js) (Lines 1–2172)
- [`index.html`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/index.html) (Lines 1–525)
- [`styles.css`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/styles.css) (Lines 1–620)
- [`frontend/src/App.jsx`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/frontend/src/App.jsx)

---

## 1. Summary of Code Review Findings

| Severity | Count | Primary Impact Areas |
|---|---|---|
| **CRITICAL** | 5 | Application simulation, lack of multi-tenant auth, synchronous JSON race conditions, unverified payment signatures, missing document parsing pipeline. |
| **HIGH** | 4 | Hardcoded single candidate, mock recruiter inbox, missing CSRF/rate limiting, monolithic frontend file. |
| **MEDIUM** | 5 | In-memory SSE subscriber memory leak on disconnect, duplicate job filter logic, missing schema validation on API inputs, unhandled promise rejections on file streaming. |
| **LOW** | 3 | CSS class naming inconsistency, missing `<label>` associations for accessibility, unlinked frontend Vite workspace. |

---

## 2. Prioritized Issue Catalog

### ISSUE-001: Application Submission is Simulated (No Real Headless Browser Automation)
- **Severity**: **CRITICAL**
- **File & Line**: [`backend/server.js:314-389`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/backend/server.js#L314-L389)
- **Component**: Application Execution Engine (`/api/v1/cloud-executions/running`)
- **Description**: The endpoint intended to execute autonomous job applications does not invoke a headless browser driver (such as Playwright or Puppeteer). Instead, it synthesizes a mock application object with a randomized confirmation number (`OPENAI-ASHBY-910248`), decrements credits, and uses `setTimeout` to push simulated step events over SSE.
- **Reproduction Steps**:
  1. Open Network tab in browser DevTools.
  2. Click "Apply Now" on any job.
  3. Inspect `server.js` logs; observe that no browser instance is launched and no HTTP traffic leaves the server toward the employer's ATS endpoint.
- **Evidence**:
  ```javascript
  // server.js lines 375-384
  setTimeout(() => {
    broadcastSSE('execution:step', { appId: newApp.id, step: `[Cloud Runner] Navigating to ${job.url}` });
  }, 500);
  setTimeout(() => {
    broadcastSSE('execution:step', { appId: newApp.id, step: `[ATS Engine] Detected ${job.atsName} form structures; injecting Sameer Ali Khan profile` });
  }, 1200);
  ```
- **Root Cause**: The application runner was implemented as an interactive UX prototype rather than an orchestrated browser automation worker.
- **User Impact**: Candidates believe their application was submitted to an employer (e.g., OpenAI or Autodesk), but no actual application was received by the employer's ATS.
- **Security / Reliability Impact**: Catastrophic loss of user trust; non-compliance with commercial SaaS consumer protection standards.
- **Recommended Fix**: Integrate a dedicated background worker queue (BullMQ + Redis) with a headless **Playwright** automation pool containing verified ATS adapters for Ashby, Workday, and Greenhouse with human-in-the-loop screenshot diff verification.
- **Complexity**: High
- **Verification Test**: Execute a live submission to a staging ATS board and verify that the employer's webhook or confirmation email is received.

---

### ISSUE-002: Race Condition and Data Loss on Flat-File JSON Storage
- **Severity**: **CRITICAL**
- **File & Line**: [`backend/server.js:34-37`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/backend/server.js#L34-L37)
- **Component**: Persistence Layer (`saveDB()`)
- **Description**: All application state (users, jobs, applications, metrics, subscriptions) is held in memory in `let db` and written to disk synchronously via `fs.writeFileSync(STORE_PATH, JSON.stringify(db, null, 2), 'utf-8')`.
- **Reproduction Steps**:
  1. Trigger two simultaneous requests (e.g., adding a skill and updating profile metadata).
  2. Under concurrent requests, one `fs.writeFileSync` can overwrite the in-memory mutations of the other.
- **Evidence**:
  ```javascript
  function saveDB() {
    fs.writeFileSync(STORE_PATH, JSON.stringify(db, null, 2), 'utf-8');
  }
  ```
- **Root Cause**: Absence of an ACID-compliant database (PostgreSQL / SQLite with write-ahead logging).
- **User Impact**: Inflight applications, modified skills, or payment records can be silently wiped out if two requests coincide.
- **Security / Reliability Impact**: High data loss vulnerability.
- **Recommended Fix**: Migrate schema to **PostgreSQL** or **SQLite** using **Prisma ORM** with transaction locks (`$transaction`).
- **Complexity**: Medium
- **Verification Test**: Run an ApacheBench or Autocannon concurrency load test (`100 req/sec`) against skill addition; verify no data corruption occurs.

---

### ISSUE-003: Razorpay Payment Verification Lacks Cryptographic HMAC-SHA256 Signature Check
- **Severity**: **CRITICAL**
- **File & Line**: [`backend/server.js:456-508`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/backend/server.js#L456-L508)
- **Component**: Billing Gateway (`/api/v1/subscription/razorpay/verify-payment`)
- **Description**: The payment verification endpoint trusts the `razorpay_payment_id`, `razorpay_order_id`, and `planId` supplied in the client's HTTP request body without computing and matching the required HMAC-SHA256 signature using the server's private `RAZORPAY_KEY_SECRET`.
- **Reproduction Steps**:
  1. Send an unauthenticated HTTP POST to `/api/v1/subscription/razorpay/verify-payment`:
     ```json
     { "planId": "sub_power", "razorpay_payment_id": "fake_pay_123", "razorpay_order_id": "fake_order_123" }
     ```
  2. Server immediately grants 3,000 credits and activates "Power Auto-Pilot" for free.
- **Evidence**:
  ```javascript
  // server.js lines 461-468
  if (planId === 'sub_power') {
    db.subscription.planId = 'sub_power_inr_monthly';
    db.subscription.appsLimit = 4500;
    db.user.credits += 3000;
  }
  ```
- **Root Cause**: Missing verification logic: `crypto.createHmac('sha256', secret).update(order_id + "|" + payment_id).digest('hex') === signature`.
- **User Impact**: Total revenue leakage; users can obtain paid subscriptions without completing real transactions.
- **Security / Reliability Impact**: Severe financial vulnerability.
- **Recommended Fix**: Implement mandatory HMAC signature validation and Webhook secret validation with Razorpay API credentials stored in `.env`.
- **Complexity**: Low
- **Verification Test**: Submit forged payment parameters; confirm server returns HTTP 400 Bad Request ("Invalid payment signature").

---

### ISSUE-004: Resume Parsing Endpoint Returns Hardcoded Metadata (No Dynamic NLP Extraction)
- **Severity**: **CRITICAL**
- **File & Line**: [`backend/server.js:168-238`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/backend/server.js#L168-L238)
- **Component**: Resume Intelligence (`/api/v1/resume/parse`)
- **Description**: The endpoint checks whether `Sameer_Ali_Khan_Resume.pdf` exists and gets its byte size, but returns hardcoded pre-defined candidate properties from `db.user`. If a new user uploads their own resume, no actual text extraction, section segmentation, or semantic parsing occurs.
- **Reproduction Steps**:
  1. Upload or point to an alternative PDF resume.
  2. Call `GET /api/v1/resume/parse`.
  3. The response still returns "Sameer Ali Khan", Osmania University, and Mantarang Edtech.
- **Evidence**:
  ```javascript
  // server.js lines 180-194
  candidate: {
    name: db.user.name,
    email: db.user.email,
    education: {
      master: db.user.education,
      university: 'Osmania University, Hyderabad',
      gpa: '8.47 / 10.0'
    }
  }
  ```
- **Root Cause**: Missing document parser integration (`pdf-parse`, `pdfjs-dist`, or Anthropic/Gemini document intelligence API).
- **User Impact**: Any candidate other than the hardcoded profile cannot use the platform with their own credentials.
- **Recommended Fix**: Integrate `pdf-parse` / `unpdf` to extract raw text, and pass the text to an LLM extraction prompt with a structured Zod schema to produce a validated candidate Fact Store.
- **Complexity**: Medium
- **Verification Test**: Parse 3 distinct candidate PDF resumes and verify correct extraction of names, degrees, and work history.

---

### ISSUE-005: Absence of Authentication, Password Hashing & Multi-Tenant Isolation
- **Severity**: **CRITICAL**
- **File & Line**: Entire repository (`backend/server.js`, `app.js`)
- **Component**: Identity & Access Management (IAM)
- **Description**: There is no database table for users, no password hashing (bcrypt/argon2), and no JWT/cookie session verification on API endpoints. All visitors interact with the same shared account.
- **Root Cause**: Designed as a single-user prototype without an authentication layer.
- **User Impact**: Zero user privacy; any visitor can edit the profile, delete skills, or trigger applications on behalf of Sameer Ali Khan.
- **Security / Reliability Impact**: Violation of data privacy regulations (GDPR, DPDP).
- **Recommended Fix**: Implement **JWT-based authentication** (or Firebase Auth matching Tsenta's reverse-engineered schema) with bcrypt password hashing, HTTP-only cookies, and multi-tenant database isolation.
- **Complexity**: High
- **Verification Test**: Attempt accessing `/api/v1/users/profile` without a Bearer token; verify HTTP 401 Unauthorized is returned.

---

### ISSUE-006: In-Memory SSE Client Leak on Socket Termination
- **Severity**: **MEDIUM**
- **File & Line**: [`backend/server.js:21-32`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/backend/server.js#L21-L32)
- **Component**: Real-time Telemetry Hub (`broadcastSSE()`)
- **Description**: SSE connections are stored in `const sseClients = new Set()`. Clients are only removed when a write error throws during a broadcast (`catch (err) { sseClients.delete(client); }`). If a client closes their browser tab quietly, the socket descriptor remains in memory until the next broadcast attempt.
- **Evidence**:
  ```javascript
  req.on('close', () => {
    // Missing explicit sseClients.delete(res) in router!
  });
  ```
- **Recommended Fix**: Add `req.on('close', () => sseClients.delete(res))` inside the `/__transmit/events` route handler.
- **Complexity**: Low
- **Verification Test**: Open and close 100 browser tabs; verify `sseClients.size` returns to 0.

---

### ISSUE-007: Monolithic Frontend File (`app.js` is 2,172 Lines)
- **Severity**: **HIGH**
- **File & Line**: [`app.js:1-2172`](file:///c:/Users/admin/OneDrive/Desktop/Tsenta%20Ai%20Clone/app.js)
- **Component**: Client Architecture
- **Description**: All frontend logic—routing, state management, modal handling, multi-currency formatting, Razorpay SDK injection, DOM rendering, and SSE listener—is contained within a single 2,172-line vanilla JavaScript file.
- **User Impact**: Reduced maintainability, higher likelihood of unintended regressions during feature edits, and lack of component encapsulation.
- **Recommended Fix**: Unify with the existing React 19 / Vite workspace in `frontend/`, organizing into modular components (`components/JobCard.jsx`, `components/ProfileEditor.jsx`, `hooks/useTransmit.js`).
- **Complexity**: Medium
- **Verification Test**: Run `npm run build` in `frontend/` and ensure zero lint or TypeScript errors.
