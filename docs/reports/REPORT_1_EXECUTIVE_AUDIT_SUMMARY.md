# REPORT 1 — Executive Audit Summary
**Platform**: Autonomous AI Job Search & Application Platform (Tsenta AI Clone)  
**Date**: October 24, 2026  
**Auditor Role**: Principal Software Architect & Lead Systems Auditor  
**Audit Scope**: Complete Workspace (`backend/`, `frontend/`, root web files, `evidence/`, `research/`, `graphify-out/`)

---

## 1. Executive Summary

This platform was conceived as an intelligent, autonomous job discovery, resume optimization, and auto-application platform designed to achieve functional parity with **Tsenta** ([tsenta.com](https://tsenta.com/)), while introducing key regional and operational advantages (e.g., dual currency $ USD / ₹ INR / € EUR display, Razorpay international billing, and global remote/sponsorship filtering).

Our comprehensive end-to-end audit evaluated the codebase against production-grade commercial standards. The assessment reveals that while the current platform possesses a visually compelling **Tactile Claymorphic design system**, an initial **AdonisJS Transmit-compatible SSE event engine**, and real employer link ingestion (Greenhouse, Ashby, Workday), **the core application automation, document intelligence, database persistence, and user security currently operate at a Prototype / Interactive Demo maturity level**.

Significant architectural, data persistence, and automation enhancements are required before this platform can safely and reliably charge subscription fees to real candidates globally.

---

## 2. Platform Maturity Scorecard

| Domain | Current Maturity | Target Maturity | Gap Severity | Primary Deficiencies |
|---|---|---|---|---|
| **Candidate Profile & Fact Store** | Level 2 (Structured Demo) | Level 4 (Production) | **HIGH** | Ingests from static profile; lacks cryptographically verifiable multi-version Fact Store. |
| **Resume Parsing & NLP** | Level 2 (Metadata Proxy) | Level 4 (Production) | **CRITICAL** | Endpoint checks file size and returns hardcoded parsed entities rather than running a live LLM/OCR document extractor. |
| **Job Discovery & Ingestion** | Level 2 (Curated Static List) | Level 4 (Production) | **HIGH** | Has 12 live jobs and 1,358 company directory links, but lacks an automated continuous web crawler/scraper with ATS requisition deduplication. |
| **Explainable AI Matching** | Level 2 (Heuristic Regex) | Level 4 (Production) | **HIGH** | Calculates match scores using keyword intersections; lacks vector embedding semantic similarity and hard eligibility constraint evaluation. |
| **Per-Job Resume Optimization** | Level 2 (Mock Diff Engine) | Level 4 (Production) | **CRITICAL** | Injects static mock sentence diffs; lacks live LLM prompt pipeline generating truth-grounded ATS-aligned bullet rewrites. |
| **ATS Application Automation** | Level 1 (Simulated SSE) | Level 4 (Production) | **CRITICAL** | `cloud-executions/running` emits simulated progress timeouts; does not launch headless browser automation (Playwright/Puppeteer) to fill real forms. |
| **Database & Persistence** | Level 1 (Flat JSON File) | Level 4 (Production) | **CRITICAL** | Single `store.json` read/written synchronously; no ACID transactions, no migration tooling, no multi-tenant relational schema. |
| **Authentication & AuthZ** | Level 1 (Hardcoded Single User) | Level 4 (Production) | **CRITICAL** | No password hashing, no JWT/session issuance, no tenant isolation, hardcoded single user ("Sameer Ali Khan"). |
| **Billing & Quota Ledger** | Level 2 (Simulated Razorpay) | Level 4 (Production) | **HIGH** | Multi-currency frontend UI and mock order generation; lacks server-side HMAC-SHA256 signature verification and double-entry credit ledger. |
| **UI/UX & Frontend Design** | Level 4 (High Polish Claymorphism) | Level 4 (Production) | **LOW** | Rich claymorphic cards, multi-currency switcher, responsive layout, clear modal dialogs, and real-time SSE listener. |

---

## 3. Major Strengths Identified

1. **State-of-the-Art Visual Aesthetics**: The UI implements an original, bespoke Claymorphic design system (`styles.css`) that outperforms generic SaaS dashboards with tactile depth, glassmorphic accents, and distinct status badges.
2. **Reverse-Engineered Tsenta Intelligence**: The repository houses 236 decompiled/extracted production assets from Tsenta (`evidence/public-assets/`) and deep contract reverse-engineering (`research/static-api-analysis.md`, `research/subscription-blueprint.md`), providing full structural visibility into Tsenta's Redux Toolkit query schemas, 55 ATS recognizers, and application state machines.
3. **Genuine Employer Ingestion**: Ingests active, verified HTTP 200 jobs from Ashby, Workday, and Greenhouse, alongside an indexed directory of **1,358 global company career portals** mapped across Startups, Product Giants, and Enterprise Services.
4. **Live URL Health Check & Auto-Purge**: Implements an active preflight and scheduled crawler in `backend/server.js` (`purgeExpiredJobs`) that validates job URLs and purges taken-down postings automatically.
5. **Real-Time Telemetry Foundation**: Implements SSE (`/__transmit/events`) aligned with AdonisJS Transmit, establishing the pipeline for streaming live application steps to the candidate's browser.
6. **Candidate Profile Grounding**: Successfully modeled on a real candidate (Sameer Ali Khan, M.Sc Computer Science, Osmania University), providing an authentic data foundation for testing ATS tailoring without synthetic hallucinations.

---

## 4. Critical Weaknesses & Vulnerabilities

1. **Simulated Application Automation (Zero Real Submissions)**:
   - When a user clicks "Apply Now", the backend triggers `POST /api/v1/cloud-executions/running`, which runs `setTimeout` callbacks broadcasting simulated log messages ("Navigating to Workday...", "Injecting Sameer Ali Khan profile...", "Confirmation ID: ...").
   - **No headless browser (Playwright, Puppeteer, Selenium) is actually spawned**, no form elements are inspected, and no genuine submission is made to the employer's ATS.
2. **Pseudo-Resume Parsing**:
   - `GET /api/v1/resume/parse` reads `Sameer_Ali_Khan_Resume.pdf` via `fs.statSync` to check file size, but returns a hardcoded in-memory JSON object. If a candidate uploads a different PDF, the system cannot dynamically extract sections, parse work experience, or analyze keyword density without real document NLP.
3. **Single-File Flat JSON Database (`store.json`)**:
   - All state is stored in a 34 KB JSON file (`backend/database/store.json`).
   - Every read and write calls `fs.readFileSync` and `fs.writeFileSync`. Under concurrent user requests, race conditions will cause file corruption, data overwrites, and state desynchronization.
4. **Lack of Authentication and Multi-Tenancy**:
   - There is no user registration, password hashing (bcrypt/argon2), JWT token verification, or session store. Every visitor to the web application shares the exact same user identity and credentials.
5. **Simulated Payment Verification**:
   - The Razorpay flow creates mock orders and accepts client payment callbacks without verifying the cryptographic HMAC signature (`crypto.createHmac('sha256', secret)`). Anyone can craft a curl request to upgrade their plan without making a payment.
6. **Frontend Framework Split**:
   - The root application runs on Vanilla JS (`app.js`, 2,172 lines), while a separate `frontend/` directory contains an unlinked Vite + React 19 scaffold. The React app is disconnected from the running backend.

---

## 5. Development Readiness Assessment

* **Current Readiness for Public Commercial Launch**: **0% (Unacceptable for Real Billing)**. Charging candidates money while applications are simulated would represent a catastrophic product and commercial failure.
* **Readiness for Production Re-Architecture**: **100% (Ready to Build)**. The user flows, design tokens, UI layouts, ATS link structures, candidate profiles, and reverse-engineered Tsenta API contracts are completely defined and understood.
* **Recommended Next Step**: Complete all 10 audit reports and obtain explicit user approval at the **Phase 7 Approval Gate** before writing production implementation code.
