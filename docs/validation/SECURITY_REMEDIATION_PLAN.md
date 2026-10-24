# SECURITY REMEDIATION PLAN: Production Hardening
**Project**: Autonomous AI Job Search & Application Platform (Tsenta AI Clone)  
**Date**: October 24, 2026  
**Auditor**: Staff Application Security Engineer & Principal Architect  
**Status**: Second-Pass Security Remediation Blueprint  

---

## 1. Security Vulnerability Matrix & Remediation Status

| Vulnerability ID | Vulnerability Description | Severity | CWE | Remediation Strategy | Target Milestone |
|---|---|---|---|---|---|
| **SEC-001** | Missing HMAC-SHA256 Payment Verification | **CRITICAL** | CWE-347 | Enforce server-side HMAC verification on orders and webhooks | Release 0.1 |
| **SEC-002** | Absence of Multi-Tenant Authentication | **CRITICAL** | CWE-306 | Implement JWT auth, bcrypt password hashing, and tenant middleware | Release 0.1 |
| **SEC-003** | Unencrypted Candidate Credentials at Rest | **HIGH** | CWE-312 | AES-256-GCM authenticated encryption for portal passwords | Release 0.1 |
| **SEC-004** | Candidate PII Leakage in Console Logs | **MEDIUM** | CWE-532 | Structured JSON logging with automated PII masking middleware | Release 0.1 |
| **SEC-005** | Lack of API Rate Limiting & Brute Force Gating | **MEDIUM** | CWE-307 | Redis-backed token bucket rate limiting on `/api/v1/auth/*` | Release 0.1 |
| **SEC-006** | Missing Strict Input Validation on Endpoints | **MEDIUM** | CWE-20 | Zod schema validation middleware for all request bodies | Release 0.1 |
| **SEC-007** | Replay Attacks on Application Submissions | **MEDIUM** | CWE-294 | Attempt UUID idempotency tokens with unique database constraints | Release 0.2 |

---

## 2. Technical Remediation Implementations

### SEC-001: Cryptographic Razorpay Signature Verification
- **Problem**: Current implementation accepts `razorpay_payment_id` and directly grants credits.
- **Remediation Specification**:
  ```typescript
  import crypto from 'node:crypto';

  export function verifyRazorpayPayment(
    orderId: string,
    paymentId: string,
    signature: string,
    secret: string
  ): boolean {
    const payload = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf-8'),
      Buffer.from(signature, 'utf-8')
    );
  }
  ```
- **Webhook Endpoint**: Implement `/api/v1/subscription/razorpay/webhook` verifying `x-razorpay-signature` over the raw unparsed request buffer before invoking subscription state changes.

---

### SEC-002: Multi-Tenant JWT Authentication & Session Hardening
- **Password Hashing**: Use `bcrypt` with cost factor 12:
  ```typescript
  import bcrypt from 'bcrypt';
  export async function hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12);
  }
  ```
- **Token Lifecycle**:
  - **Access Token**: Short-lived (15 minutes), signed with `JWT_ACCESS_SECRET` (RS256 or HS256 with 256-bit entropy).
  - **Refresh Token**: Long-lived (7 days), stored in an HTTP-only, `Secure`, `SameSite=Strict` cookie, persisted in Redis with device fingerprinting.
- **Tenant Isolation**: Prisma middleware automatically binds all queries to `req.user.id`:
  ```typescript
  // Enforces that users can ONLY access their own records
  const application = await prisma.application.findFirst({
    where: { id: req.params.id, userId: req.user.id }
  });
  if (!application) throw new NotFoundError();
  ```

---

### SEC-003: AES-256-GCM Credential Encryption at Rest
- **Requirement**: Candidate passwords for ATS accounts (e.g. Workday portals) must never be stored in plaintext.
- **Remediation Specification**:
  ```typescript
  import crypto from 'node:crypto';

  const ALGORITHM = 'aes-256-gcm';
  const ENCRYPTION_KEY = Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY!, 'hex'); // 32 bytes

  export function encryptCredential(plaintext: string): { ciphertext: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(12); // 96-bit IV
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return { ciphertext, iv: iv.toString('hex'), tag };
  }

  export function decryptCredential(ciphertext: string, iv: string, tag: string): string {
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
  }
  ```

---

### SEC-004: PII Redaction & Structured Logging
- **Requirement**: Application logs must never write candidate phone numbers, full addresses, or auth credentials into log files.
- **Remediation**: Configure `pino` logger with automated redaction:
  ```typescript
  import pino from 'pino';

  export const logger = pino({
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.phone',
        '*.email',
        '*.ssn',
        '*.workAuthorization'
      ],
      censor: '[REDACTED_PII]'
    }
  });
  ```

---

### SEC-005: Rate Limiting & Brute Force Defense
- Implement Redis-backed token bucket rate limiters:
  - **Auth Endpoints** (`/api/v1/auth/login`): 5 requests per minute per IP.
  - **Parsing Endpoints** (`/api/v1/resume/parse`): 10 uploads per hour per user.
  - **Application Endpoints** (`/api/v1/cloud-executions/*`): 60 requests per hour per user.

---

### SEC-006: Strict Request Body Schema Validation (Zod)
- All incoming JSON payloads must pass through Zod validators before hitting controller logic:
  ```typescript
  import { z } from 'zod';

  export const UpdateProfileSchema = z.object({
    fullName: z.string().min(2).max(100),
    roleTitle: z.string().min(2).max(100),
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
    location: z.string().max(100).optional(),
    needsSponsorship: z.boolean()
  }).strict(); // Rejects unknown injected fields
  ```

---

### SEC-007: Idempotency & Replay Protection
- Every job application submission must supply an `attemptUuid`.
- The database enforces a `UNIQUE(userId, jobId)` constraint on active applications, preventing double-clicks or network retries from creating redundant submissions or charging multiple credits.
