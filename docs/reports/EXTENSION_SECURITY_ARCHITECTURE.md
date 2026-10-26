# Rolevia AI — Chrome Extension Security Architecture (FEAT-012)

**Product:** Rolevia AI ([roleviaai.co.in](https://roleviaai.co.in))  
**Feature ID:** `FEAT-012`  
**Feature Name:** Chrome Extension Companion & In-Browser Autofill Assistant  
**Date:** October 26, 2026  
**Engineering Discipline:** Application Security & Browser Automation  
**Status:** SPECIFIED & SECURITY-REVIEWED (Awaiting Client-Side Build in Release 0.4)  

---

## 1. Executive Summary & Design Principles

Tsenta AI relies heavily on a browser extension companion to assist candidates in filling application forms on employer career pages. For Rolevia AI, `FEAT-012` specifies a modern **Manifest V3 Chrome Extension** designed around strict security, candidate sovereignty, and zero-trust authentication.

### Core Security Invariants:
1. **Zero Raw JWT Sharing**: The extension NEVER has access to the primary web session JWT or refresh tokens stored in `localStorage` or `httpOnly` cookies.
2. **Short-Lived, Scoped Extension Credentials**: The web application issues dedicated, revocable extension tokens (`rolevia_ext_auth_*`) with a maximum lifetime of 1 hour and restricted scopes (`extension:read_profile`, `extension:fill_draft`).
3. **Explicit Candidate Action Only**: Forms are NEVER automatically or silently filled. Autofill requires candidate initiation via the extension popup or side panel after inspecting field mappings.
4. **Zero CAPTCHA / MFA Bypass**: The extension strictly halts at CAPTCHAs, bot detections (Cloudflare, PerimeterX), or MFA challenges, escalating control to the candidate.
5. **No Submission Authority**: The extension can fill fields and attach documents, but CANNOT click "Submit Application" without explicit candidate review and HMAC authorization.

---

## 2. Manifest V3 Configuration & Permission Scoping

The extension adheres strictly to the Chrome Web Store Manifest V3 specification:

```json
{
  "manifest_version": 3,
  "name": "Rolevia AI Companion",
  "version": "1.0.0",
  "description": "Intelligent job discovery, document optimization, and form-fill assistant for Rolevia AI.",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_title": "Rolevia AI Companion"
  },
  "background": {
    "service_worker": "background/serviceWorker.js",
    "type": "module"
  },
  "permissions": [
    "activeTab",
    "storage",
    "alarms"
  ],
  "optional_permissions": [
    "scripting"
  ],
  "host_permissions": [
    "https://roleviaai.co.in/*",
    "https://*.greenhouse.io/*",
    "https://*.ashbyhq.com/*",
    "https://*.lever.co/*",
    "https://*.workday.com/*",
    "https://*.smartrecruiters.com/*"
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

### Permission Justification:
- `activeTab`: Grants temporary execution on the employer portal only when the candidate clicks the extension icon, avoiding broad `<all_urls>` permission creep.
- `storage`: Uses `chrome.storage.session` (in-memory, destroyed when browser closes) for temporary token caching.
- `host_permissions`: Strictly scoped to verified ATS domains and Rolevia's public domain.

---

## 3. Extension Authentication & Pairing Protocol

```
Candidate Browser          Rolevia Web Dashboard          Rolevia Auth Server
      │                              │                             │
      ├── 1. Click "Pair Extension" ─┼────────────────────────────►│
      │                              │  Generates one-time code    │
      │                              │  `EXT-PAIR-XXXXXX` (5m TTL) │
      │                              │◄────────────────────────────┤
      │  2. Displays Pairing Code    │                             │
      │◄─────────────────────────────┤                             │
      │                                                            │
Extension Popup                                                    │
      │  3. Candidate enters `EXT-PAIR-XXXXXX`                     │
      ├───────────────────────────────────────────────────────────►│
      │                                Validates pairing code,     │
      │                                issues scoped auth token    │
      │                                `rolevia_ext_auth_*` (1h)   │
      │◄───────────────────────────────────────────────────────────┤
      │  4. Stores in `chrome.storage.session`                     │
```

### Revocation & Session Invalidation:
- Candidates can revoke extension access immediately from their Rolevia dashboard (`POST /api/v1/auth/extension/revoke`).
- Tokens are cryptographically tied to the candidate's `tenantId` and `userId`.
- If the candidate logs out of the web application, all active extension sessions for that user are revoked.

---

## 4. In-Browser Form Field Mapping & Candidate Consent Flow

1. **DOM Field Inspection**:
   - The content script identifies form input elements using ATS heuristics (`name`, `id`, `aria-label`, `placeholder`).
2. **Draft Preview Overlay**:
   - The extension presents a floating review card displaying the proposed mapping:
     - Name: `Candidate Full Name` (Source: FactStore)
     - Email: `candidate@email.com` (Source: FactStore)
     - Resume: `Resume_Rolevia_Tailored.pdf` (Source: Approved Diff `hash_abc123`)
     - Screening Q1: "Authorized to work in India?" -> "Yes" (Source: FactStore)
3. **Candidate Approval**:
   - The candidate clicks **"Confirm & Autofill"**.
   - The extension injects synthetic trusted input events (`input`, `change`, `blur`) into the form fields.
4. **Audit Trail**:
   - Upon completing the autofill operation, the extension posts a telemetry record to the backend:
     `POST /api/v1/applications/extension-event`:
     ```json
     {
       "eventType": "EXTENSION_FORM_AUTOFILL_COMPLETED",
       "requisitionUrl": "https://boards.greenhouse.io/corp/jobs/5512",
       "fieldsFilledCount": 12,
       "candidateConsentTimestamp": "2026-10-26T10:04:00Z"
     }
     ```

---

## 5. Job Import Capability

When browsing an unindexed career page or LinkedIn/Indeed job posting:
1. Candidate clicks **"Import Job to Rolevia"**.
2. The extension extracts structured metadata:
   - Job Title, Company Name, Location, Description text, Apply URL.
3. Sends extraction payload to `POST /api/v1/jobs/import`.
4. Rolevia backend computes SHA-256 requisition hash, performs deduplication, executes experience classification (`FEAT-016`), and runs the matching engine (`FEAT-006`).
5. Displays candidate eligibility badge directly in the extension popup.

---

## 6. Security Guarantees & Milestones

- **Manifest V3 Fully Compliant**: No remote code execution (`eval()` or external CDN scripts are prohibited).
- **Dry-Run Enforcement**: In Release 0.4, the extension operates in **ASSISTED_FILL_ONLY** mode; real employer submission buttons remain locked until explicit manual user submission.
- **Audit Logging**: Every action taken by the extension generates an immutable entry in PostgreSQL `ApplicationEvent`.
