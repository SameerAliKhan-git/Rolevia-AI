# TESTING & ACCEPTANCE CRITERIA: Measurable Release Gates
**Project**: Autonomous AI Job Search & Application Platform (Tsenta AI Clone)  
**Date**: October 24, 2026  
**Auditor**: Principal QA Architect & Staff Test Engineer  
**Status**: Second-Pass Test Suite Specification & Quality Gates  

---

## 1. Quality Gates & Release Gate Criteria

No milestone may be merged or deployed without 100% compliance with its defined Quality Gate:

```
┌────────────────────────────────────────────────────────────────────────┐
│ GATE 0.1: Core Foundation Gate (Release 0.1)                           │
├────────────────────────────────────────────────────────────────────────┤
│ ✓ PostgreSQL Prisma schema passes 100% of migration & rollback tests   │
│ ✓ 0 data loss under 100 concurrent requests (Autocannon load test)     │
│ ✓ Multi-tenant auth blocks 100% of unauthorized requests (HTTP 401)    │
│ ✓ Forged Razorpay HMAC signatures rejected with HTTP 400               │
│ ✓ Dynamic resume parser achieves >95% field extraction on 20 resumes   │
│ ✓ Job health check purges 100% of HTTP 404/410 dead links              │
├────────────────────────────────────────────────────────────────────────┤
│ GATE 0.2: Core Parity Gate (Release 0.2)                               │
├────────────────────────────────────────────────────────────────────────┤
│ ✓ Semantic vector matching reflects hard constraints & skill gaps      │
│ ✓ Resume tailoring passes zero-hallucination factual consistency audit │
│ ✓ Pre-submit diff approval modal persists user edits to submitted PDF  │
│ ✓ Playwright dry-run fills 100% of required fields on test ATS boards   │
│ ✓ Double-entry credit ledger prevents negative balances                │
├────────────────────────────────────────────────────────────────────────┤
│ GATE 0.3: Ecosystem Gate (Release 0.3)                                 │
├────────────────────────────────────────────────────────────────────────┤
│ ✓ Gmail OAuth2 listener accurately classifies recruiter replies (>90%) │
│ ✓ Chrome Extension queues jobs into cloud dashboard without errors     │
│ ✓ MCP server responds to Claude/Cursor queries via stdio and HTTP      │
├────────────────────────────────────────────────────────────────────────┤
│ GATE 0.4: Production Commercial Readiness (Release 0.4)                │
├────────────────────────────────────────────────────────────────────────┤
│ ✓ p95 API response latency < 150ms under peak load                      │
│ ✓ Zero high/critical vulnerabilities on automated OWASP dependency scan│
│ ✓ End-to-end user journey from signup to verified receipt validated    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Automated Test Suite Specifications

### 2.1 Unit Test Suite (`npm run test:unit`)
- **HMAC Verification Unit Test**:
  ```typescript
  test('rejects forged payment signature', () => {
    const isValid = verifyRazorpayPayment('order_123', 'pay_456', 'fake_sig', 'test_secret');
    expect(isValid).toBe(false);
  });
  test('accepts authentic payment signature', () => {
    const secret = 'test_secret';
    const payload = 'order_123|pay_456';
    const validSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifyRazorpayPayment('order_123', 'pay_456', validSig, secret)).toBe(true);
  });
  ```
- **Job Deduplication Hash Unit Test**:
  ```typescript
  test('generates identical hash for identical requisitions with messy whitespace', () => {
    const hash1 = generateJobHash('OpenAI', '  Research Engineer - AI Systems  ', 'REQ-101');
    const hash2 = generateJobHash('openai', 'research engineer - ai systems', 'REQ-101');
    expect(hash1).toBe(hash2);
  });
  ```
- **Currency Conversion Math**:
  Assert integer minor unit calculations (no floating-point decimal drift on INR/USD conversions).

---

### 2.2 Integration Test Suite (`npm run test:integration`)
- **Credit Reservation & Double-Spend Test**:
  1. Create a user with balance = 1 credit.
  2. Launch two simultaneous HTTP requests to `/api/v1/cloud-executions/running`.
  3. Assert that exactly 1 request returns HTTP 201 Created and the other returns HTTP 402 / 409 `INSUFFICIENT_CREDITS`.
  4. Assert `User.creditsBalance === 0` and `CreditLedger` has exactly 1 reservation.
- **Tenant Data Isolation Test**:
  1. User A logs in and creates resume profile `profile-A`.
  2. User B logs in and calls `GET /api/v1/resume-profiles/profile-A`.
  3. Assert server returns HTTP 404 Not Found (zero cross-tenant data leakage).

---

### 2.3 Headless ATS Automation Test Suite (`npm run test:automation`)
- **Playwright Dry-Run Harness**:
  ```typescript
  test('Greenhouse Form Fill Dry-Run', async ({ page }) => {
    const runner = new GreenhouseAdapter(page);
    await runner.navigate('https://job-boards.greenhouse.io/gitlab/jobs/8704363002');
    await runner.fillCandidateInfo(testCandidateFacts);
    await runner.uploadResume('test-assets/tailored_resume.pdf');
    
    // Assert all required fields populated
    expect(await page.inputValue('#first_name')).toBe(testCandidateFacts.firstName);
    expect(await page.inputValue('#email')).toBe(testCandidateFacts.email);
    
    // Dry-run safety: verify submit button was NOT clicked
    expect(page.url()).toContain('/jobs/8704363002');
  });
  ```

---

### 2.4 AI Factual Grounding Evaluation Suite (`npm run test:ai-eval`)
- **Benchmark Corpus**: 50 varied target job descriptions and 5 candidate resumes.
- **Evaluation Criteria**:
  - **Factual Hallucination Score**: 0.00%. Any output introducing an employer, university, or numeric metric not in the source Fact Store fails the build.
  - **Keyword Alignment Score**: > 80% coverage of target job qualifications.
  - **Grammar & Tone Compliance**: Assert professional, concise phrasing adhering to standard resume guidelines.

---

### 2.5 Security & Penetration Testing (`npm run test:security`)
- Run `npm audit` and `snyk test` asserting 0 high or critical dependency vulnerabilities.
- Run SQL injection and XSS fuzzing against all input fields using `supertest`.
- Assert all passwords in the database match the bcrypt `$2b$12$` pattern.
