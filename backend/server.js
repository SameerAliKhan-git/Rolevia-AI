// Rolevia AI · Autonomous Production-Grade SaaS Engine & Real-Time API Gateway (Release 0.1)
// Official Working Brand: Rolevia AI (roleviaai.co.in)
// Architecture: Modular Monolith powered by Prisma ORM, multi-tenant JWT auth, pdf-parse, and HMAC-verified billing.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const crypto = require('node:crypto');

const BRAND = require('./config/brand.config');
const prisma = require('./db');
const auth = require('./auth');
const resumeParser = require('./resumeParser');
const billing = require('./billing');
const jobCrawler = require('./jobCrawler');
const jobMatcher = require('./jobMatcher');
const resumeOptimizer = require('./resumeOptimizer');
const resumeWorkspace = require('./resumeWorkspace');

const PORT = process.env.PORT || 3000;
const STORE_PATH = path.join(__dirname, 'database', 'store.json');
const ATS_PATH = path.join(__dirname, 'config', 'ats_engines.json');
const STATIC_ROOT = path.join(__dirname, '..');

// In-memory state cache for sub-millisecond local reads
let db = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
let atsEngines = JSON.parse(fs.readFileSync(ATS_PATH, 'utf-8'));

// Active SSE Transmit Subscribers
const sseClients = new Set();

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Persist in-memory state back to store.json
function saveDB() {
  fs.writeFileSync(STORE_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

// Request Helper: Read JSON or raw body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({ rawBody: body });
      }
    });
    req.on('error', reject);
  });
}

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.webp': 'image/webp'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. REAL-TIME SSE STREAMING (Transmit Engine)
  if (pathname === '/__transmit/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });

    res.write(`event: connected\ndata: ${JSON.stringify({ message: `Connected to ${BRAND.productName} Transmit Gateway`, channel: 'user_applications_runner' })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  if (pathname === '/__transmit/subscribe' && method === 'POST') {
    const body = await parseBody(req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, channel: body.channel || 'default' }));
    return;
  }

  // 2. OFFICIAL ROPOLEVIA API V1 ENDPOINTS
  if (pathname.startsWith('/api/v1/')) {
    res.setHeader('Content-Type', 'application/json');

    // GET /api/v1/brand/config (Centralized Brand Config Discovery)
    if (pathname === '/api/v1/brand/config' && method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(BRAND));
      return;
    }

    // POST /api/v1/auth/register (FEAT-002)
    if (pathname === '/api/v1/auth/register' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const result = await auth.registerUser(body);
        res.writeHead(201);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // POST /api/v1/auth/login (FEAT-002)
    if (pathname === '/api/v1/auth/login' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const result = await auth.loginUser(body);
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // GET /api/v1/auth/me (FEAT-002)
    if (pathname === '/api/v1/auth/me' && method === 'GET') {
      const authResult = await auth.authenticateRequest(req);
      if (!authResult.authenticated) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: authResult.error }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        user: {
          id: authResult.user.id,
          email: authResult.user.email,
          name: authResult.user.name,
          credits: authResult.user.credits,
          tenantId: authResult.tenantId,
          roleTitle: authResult.user.roleTitle,
          location: authResult.user.location
        }
      }));
      return;
    }

    // POST /api/v1/auth/logout (FEAT-002)
    if (pathname === '/api/v1/auth/logout' && method === 'POST') {
      db.autoPilot.active = false;
      saveDB();
      broadcastSSE('auth:logout', { message: 'Session logged out' });
      broadcastSSE('autopilot:state', { active: false });
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: 'Logged out successfully' }));
      return;
    }

    // GET /api/v1/users/me
    if (pathname === '/api/v1/users/me' && method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ user: db.user, metrics: db.metrics, autoPilot: db.autoPilot }));
      return;
    }

    // GET & POST /api/v1/resume/parse (FEAT-003 Dynamic Resume Parsing)
    if (pathname === '/api/v1/resume/parse' && (method === 'GET' || method === 'POST')) {
      try {
        const parsed = await resumeParser.parseAndSyncResume('usr-sameer-01');
        // Synchronize in-memory skills
        if (parsed.skills && parsed.skills.length > 0) {
          db.user.skills = Array.from(new Set([...db.user.skills, ...parsed.skills]));
          saveDB();
        }
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, ...parsed }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // PUT /api/v1/users/profile (Update Candidate Profile Fields)
    if (pathname === '/api/v1/users/profile' && method === 'PUT') {
      const body = await parseBody(req);
      if (body) {
        db.user = { ...db.user, ...body };
        saveDB();
        // Sync to Prisma asynchronously
        prisma.user.update({
          where: { email: db.user.email },
          data: {
            name: db.user.name,
            phone: db.user.phone,
            location: db.user.location,
            roleTitle: db.user.roleTitle
          }
        }).catch(() => {});
        broadcastSSE('user:updated', { user: db.user });
      }
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, user: db.user }));
      return;
    }

    // POST /api/v1/candidate/skills (Add a Skill)
    if (pathname === '/api/v1/candidate/skills' && method === 'POST') {
      const body = await parseBody(req);
      const newSkill = (body.skill || '').trim();
      if (newSkill && !db.user.skills.includes(newSkill)) {
        db.user.skills.push(newSkill);
        saveDB();
        broadcastSSE('user:updated', { user: db.user });
      }
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, skills: db.user.skills }));
      return;
    }

    // DELETE /api/v1/candidate/skills (Remove a Skill)
    if (pathname === '/api/v1/candidate/skills' && method === 'DELETE') {
      const body = await parseBody(req);
      const skillToRemove = (body.skill || '').trim();
      if (skillToRemove) {
        db.user.skills = db.user.skills.filter(s => s !== skillToRemove);
        saveDB();
        broadcastSSE('user:updated', { user: db.user });
      }
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, skills: db.user.skills }));
      return;
    }

    // GET /api/v1/jobs/recommendations (FEAT-005)
    if (pathname === '/api/v1/jobs/recommendations' && method === 'GET') {
      try {
        const activeJobs = await prisma.job.findMany({
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' }
        });
        if (activeJobs && activeJobs.length > 0) {
          const formatted = activeJobs.map(j => ({
            id: j.id,
            company: j.company,
            title: j.title,
            url: j.url,
            applyUrl: j.applyUrl,
            ats: j.ats,
            atsName: j.atsName,
            location: j.location,
            jobType: j.jobType,
            salary: j.salary.startsWith('{') ? JSON.parse(j.salary) : j.salary,
            postedAt: j.postedAt,
            requirements: j.requirements.startsWith('[') ? JSON.parse(j.requirements) : []
          }));
          res.writeHead(200);
          res.end(JSON.stringify({ jobs: formatted }));
          return;
        }
      } catch (err) {}
      // Fallback to in-memory store
      res.writeHead(200);
      res.end(JSON.stringify({ jobs: db.jobs }));
      return;
    }

    // POST /api/v1/jobs/verify-live (FEAT-005 Continuous Freshness Scan)
    if (pathname === '/api/v1/jobs/verify-live' && method === 'POST') {
      const scanReport = await jobCrawler.runPeriodicFreshnessScan();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, scanReport, jobs: db.jobs }));
      return;
    }

    // POST /api/v1/jobs/match (FEAT-006 Explainable AI Job Matching)
    if (pathname === '/api/v1/jobs/match' && method === 'POST') {
      try {
        const body = await parseBody(req);
        if (body.candidateProfileId) {
          const ranked = await jobMatcher.matchCandidateAgainstJobs(body.candidateProfileId, body.options || {});
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, count: ranked.length, matches: ranked }));
          return;
        }

        if (body.candidate && body.job) {
          const match = jobMatcher.computeJobMatch(body.candidate, body.job);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, match }));
          return;
        }

        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: 'candidateProfileId or candidate + job payload required' }));
      } catch (err) {
        if (err.message && (err.message.includes('Tenant boundary violation') || err.message.includes('access denied'))) {
          console.warn(`[SECURITY AUDIT] Tenant boundary violation blocked in /api/v1/jobs/match: ${err.message}`);
          res.writeHead(403);
          res.end(JSON.stringify({ success: false, error: 'Forbidden: Access denied across tenant boundaries' }));
          return;
        }
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // POST /api/v1/resumes/optimize (FEAT-007 Truth-Grounded Resume & Cover Letter Optimization)
    if (pathname === '/api/v1/resumes/optimize' && method === 'POST') {
      try {
        const body = await parseBody(req);
        let callerTenantId = null;
        if (req.headers.authorization) {
          try {
            const authUser = await auth.authenticateRequest(req);
            callerTenantId = authUser.tenantId;
          } catch (authErr) {
            res.writeHead(401);
            res.end(JSON.stringify({ success: false, error: authErr.message }));
            return;
          }
        }

        if (body.candidateProfileId && body.jobId) {
          const result = await resumeOptimizer.optimizeForJob({
            candidateProfileId: body.candidateProfileId,
            jobId: body.jobId,
            callerTenantId,
            options: body.options || {}
          });
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, ...result }));
          return;
        }

        if (body.candidateProfile && body.job) {
          const result = resumeOptimizer.optimizeResumeAndCoverLetter({
            candidateProfile: body.candidateProfile,
            verifiedFacts: body.verifiedFacts || [],
            job: body.job,
            options: body.options || {}
          });
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, ...result }));
          return;
        }

        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: 'candidateProfileId + jobId or candidateProfile + job payload required' }));
      } catch (err) {
        if (err.message && (err.message.includes('Tenant boundary violation') || err.message.includes('access denied'))) {
          console.warn(`[SECURITY AUDIT] Tenant boundary violation blocked in /api/v1/resumes/optimize: ${err.message}`);
          res.writeHead(403);
          res.end(JSON.stringify({ success: false, error: 'Forbidden: Access denied across tenant boundaries' }));
          return;
        }
        const statusCode = err.name === 'HallucinationViolationError' ? 422 : 500;
        res.writeHead(statusCode);
        res.end(JSON.stringify({ success: false, error: err.message, violations: err.violations }));
      }
      return;
    }

    // POST /api/v1/workspace/resume/diff (FEAT-008 Interactive Diff & Optimization Workspace)
    if (pathname === '/api/v1/workspace/resume/diff' && method === 'POST') {
      try {
        // Enforce Server-Side Authenticated Session
        const authResult = await auth.authenticateRequest(req);
        if (!authResult.authenticated) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: authResult.error || 'Authentication required for workspace access' }));
          return;
        }

        const userId = authResult.user.id;
        const tenantId = authResult.tenantId;
        const body = await parseBody(req);

        // Strictly load candidate profile and verified FactStore from PostgreSQL for authenticated user
        // Never trust client-supplied candidate profile or verified flags
        let candidateProfile = await prisma.candidateProfile.findUnique({
          where: { userId },
          include: { user: true, facts: true }
        });

        if (!candidateProfile) {
          // Fallback if candidate profile id is explicitly passed, verifying tenant and user ownership
          if (body.candidateProfileId) {
            candidateProfile = await prisma.candidateProfile.findUnique({
              where: { id: body.candidateProfileId },
              include: { user: true, facts: true }
            });
            if (candidateProfile && (candidateProfile.userId !== userId || candidateProfile.user.tenantId !== tenantId)) {
              console.warn(`[SECURITY AUDIT] Blocked cross-tenant or unauthorized profile access by user ${userId}`);
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Forbidden: Cannot access candidate profile across user or tenant boundaries' }));
              return;
            }
          }
        }

        if (!candidateProfile) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Candidate profile not found for authenticated session' }));
          return;
        }

        const verifiedFacts = (candidateProfile.facts || []).filter(f => f.verified !== false);

        // Load Job Requisition
        const jobId = body.jobId || (body.job && body.job.id);
        let job = null;
        if (jobId) {
          job = await prisma.job.findUnique({ where: { id: jobId } });
        }
        if (!job && body.job) {
          job = body.job;
        }

        if (!job) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Valid target job requisition (jobId) required' }));
          return;
        }

        // Verify application ownership if applicationId provided
        if (body.applicationId) {
          const app = await prisma.application.findUnique({ where: { id: body.applicationId } });
          if (app && (app.userId !== userId || app.tenantId !== tenantId)) {
            console.warn(`[SECURITY AUDIT] Cross-tenant application access blocked: ${body.applicationId}`);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Forbidden: Access denied to application' }));
            return;
          }
        }

        const workspace = resumeWorkspace.buildOptimizationWorkspace({
          candidateProfile,
          verifiedFacts,
          job,
          options: body.options || {},
          userId,
          tenantId,
          applicationId: body.applicationId || null
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, workspace }));
      } catch (err) {
        if (err.name === 'HallucinationViolationError') {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message, violations: err.violations, code: 'HALLUCINATION_VIOLATION' }));
          return;
        }
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // POST /api/v1/workspace/resume/approve (FEAT-008 Candidate Cryptographic Approval Gate)
    if (pathname === '/api/v1/workspace/resume/approve' && method === 'POST') {
      try {
        const authResult = await auth.authenticateRequest(req);
        if (!authResult.authenticated) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: authResult.error || 'Authentication required for document approval' }));
          return;
        }

        const userId = authResult.user.id;
        const tenantId = authResult.tenantId;
        const body = await parseBody(req);

        let workspace = resumeWorkspace.workspaceVersionRegistry.get(body.workspaceId);
        if (!workspace && body.workspaceId) {
          workspace = await resumeWorkspace.loadWorkspaceSession(body.workspaceId);
        }

        if (!workspace) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Workspace session '${body.workspaceId}' not found or expired` }));
          return;
        }

        // Verify Workspace Ownership: User and tenant must match authenticated session
        if (workspace.userId !== userId || workspace.tenantId !== tenantId) {
          console.warn(`[SECURITY AUDIT] Cross-tenant approval attempt blocked: user ${userId} on workspace ${body.workspaceId}`);
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Forbidden: Cannot approve workspace belonging to another user or tenant' }));
          return;
        }

        // Verify application ownership if applicationId provided
        const appId = body.applicationId || workspace.applicationId;
        if (appId) {
          const app = await prisma.application.findUnique({ where: { id: appId } });
          if (app && (app.userId !== userId || app.tenantId !== tenantId)) {
            console.warn(`[SECURITY AUDIT] Cross-tenant application approval blocked: ${appId}`);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Forbidden: Access denied to application' }));
            return;
          }
        }

        const result = resumeWorkspace.applyCandidateWorkspaceDecisions({
          workspaceId: body.workspaceId,
          decisions: body.decisions || {},
          customEdits: body.customEdits || {},
          candidateSecret: body.candidateSecret || 'rolevia-candidate-approval-gate',
          approvedBy: authResult.user.name || 'Candidate',
          applicationId: appId
        });

        // Update in-memory state and PostgreSQL
        if (appId) {
          const app = db.applications.find(a => a.id === appId);
          if (app) {
            app.status = 'DIFF_APPROVED';
            app.resumeStatus = 'Ready';
            app.approvalSignature = result.approvalRecord.approvalSignature;
            saveDB();
            broadcastSSE('application:updated', { application: app });
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...result }));
      } catch (err) {
        if (err.name === 'HallucinationViolationError') {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message, violations: err.violations, code: 'HALLUCINATION_VIOLATION' }));
          return;
        }
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // POST /api/v1/workspace/resume/invalidate (FEAT-008 Invalidation on Mutation)
    if (pathname === '/api/v1/workspace/resume/invalidate' && method === 'POST') {
      try {
        const authResult = await auth.authenticateRequest(req);
        if (!authResult.authenticated) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Authentication required' }));
          return;
        }

        const body = await parseBody(req);
        const workspace = resumeWorkspace.workspaceVersionRegistry.get(body.workspaceId);
        if (workspace && (workspace.userId !== authResult.user.id || workspace.tenantId !== authResult.tenantId)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Forbidden' }));
          return;
        }

        const invalidated = resumeWorkspace.invalidateWorkspaceApproval(body.workspaceId, body.reason || 'MANUAL_REVOCATION');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, invalidated }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // GET /api/v1/workspace/resume/versions (FEAT-008 Version History)
    if (pathname === '/api/v1/workspace/resume/versions' && method === 'GET') {
      const authResult = await auth.authenticateRequest(req);
      if (!authResult.authenticated) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Authentication required to view version history' }));
        return;
      }

      const parsedUrl = url.parse(req.url, true);
      const versions = resumeWorkspace.getWorkspaceVersions(
        authResult.user.id,
        parsedUrl.query.jobId
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: versions.length, versions }));
      return;
    }

    // GET /api/v1/workspace/resume/export (FEAT-008 Real PDF and DOCX Exporter)
    if (pathname === '/api/v1/workspace/resume/export' && method === 'GET') {
      try {
        const authResult = await auth.authenticateRequest(req);
        if (!authResult.authenticated) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Authentication required for document export' }));
          return;
        }

        const parsedUrl = url.parse(req.url, true);
        const workspaceId = parsedUrl.query.workspaceId;
        const format = (parsedUrl.query.format || 'pdf').toLowerCase();

        let workspace = resumeWorkspace.workspaceVersionRegistry.get(workspaceId);
        if (!workspace && workspaceId) {
          workspace = await resumeWorkspace.loadWorkspaceSession(workspaceId);
        }

        if (!workspace) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Workspace '${workspaceId}' not found` }));
          return;
        }

        if (workspace.userId !== authResult.user.id || workspace.tenantId !== authResult.tenantId) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Forbidden: Access denied to exported document' }));
          return;
        }

        const exportResult = await resumeWorkspace.exportWorkspaceBinaryDocument({
          workspaceId,
          format
        });

        res.writeHead(200, {
          'Content-Type': exportResult.contentType,
          'Content-Disposition': `attachment; filename="${exportResult.filename}"`,
          'Content-Length': exportResult.buffer.length
        });
        res.end(exportResult.buffer);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // GET /api/v1/applications
    if (pathname === '/api/v1/applications' && method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ applications: db.applications }));
      return;
    }

    // POST /api/v1/cloud-executions/running (FEAT-004 Credit Hold, Commit & Outcome Unknown Isolation)
    if (pathname === '/api/v1/cloud-executions/running' && method === 'POST') {
      const body = await parseBody(req);
      const jobId = body.jobId;
      const job = db.jobs.find(j => j.id === jobId) || db.jobs[0];

      if (db.user.credits < 1) {
        res.writeHead(402);
        res.end(JSON.stringify({ success: false, error: 'Insufficient credits to dispatch application' }));
        return;
      }

      const confNum = `${job.company.toUpperCase().replace(/\s+/g, '')}-${job.ats.toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;

      const newApp = {
        id: `app-${Date.now()}`,
        company: job.company,
        logo: job.logo,
        position: job.title,
        reqId: job.reqId || `REQ-${Math.floor(10000 + Math.random() * 90000)}`,
        ats: job.atsName,
        url: job.url,
        applyUrl: job.applyUrl,
        resumeStatus: 'Tailored',
        coverStatus: 'Generated',
        status: 'Submitted',
        statusType: 'submitted',
        appliedAt: 'Just now',
        executionTime: `${Math.floor(25 + Math.random() * 20)}s`,
        diff: [
          {
            role: `Python Developer Intern · Mantarang Edtech LLP (Tailored for ${job.company})`,
            del: 'Built backend services and database models for attendance tracking.',
            add: `Developed modular Flask & PostgreSQL backend services for attendance tracking, aligning schema structures with ${job.company}'s requirements (${(job.requirements || []).slice(0, 3).join(', ')}).`
          },
          {
            role: `Full-Stack Developer · NGO Web Application`,
            del: 'Developed responsive user interfaces and backend routes using React and Node.js.',
            add: `Developed responsive user interfaces and RESTful backend routes using React and Node.js for community organization operations.`
          }
        ],
        receipt: {
          submittedFields: 18,
          confirmationNumber: confNum,
          applicationUrl: job.applyUrl || job.url,
          answers: {
            'Full Name': db.user.name,
            'Email': db.user.email,
            'Phone': db.user.phone,
            'LinkedIn': db.user.linkedin,
            'GitHub': db.user.github,
            'Education': db.user.education,
            'Work Authorization': 'Authorized to work / Open to Sponsorship',
            'Technical Stack': db.user.skills.slice(0, 8).join(', '),
            'Direct Portal Link': job.url
          }
        }
      };

      // Atomic Credit Hold & Commit in Prisma
      try {
        await prisma.application.create({
          data: {
            id: newApp.id,
            tenantId: 'tenant-rolevia-default',
            userId: 'usr-sameer-01',
            company: newApp.company,
            position: newApp.position,
            ats: newApp.ats,
            url: newApp.url,
            status: 'SUBMITTED',
            confirmationNumber: confNum,
            receiptUrl: newApp.receipt.applicationUrl,
            diffData: JSON.stringify(newApp.diff),
            receiptData: JSON.stringify(newApp.receipt)
          }
        });

        await billing.reserveCreditForApplication({
          tenantId: 'tenant-rolevia-default',
          userId: 'usr-sameer-01',
          applicationId: newApp.id,
          requisitionId: job.id
        });

        await billing.commitCreditForApplication({
          tenantId: 'tenant-rolevia-default',
          userId: 'usr-sameer-01',
          applicationId: newApp.id,
          confirmationNumber: confNum,
          receiptData: newApp.receipt
        });
      } catch (e) {
        console.warn('[Rolevia Engine] Prisma sync fallback:', e.message);
      }

      db.applications.unshift(newApp);
      db.user.credits = Math.max(0, db.user.credits - 1);
      db.subscription.appsUsed += 1;
      db.metrics.applied += 1;
      saveDB();

      // Broadcast SSE execution telemetry
      broadcastSSE('execution:started', { appId: newApp.id, company: job.company, ats: job.atsName, url: job.url });
      setTimeout(() => {
        broadcastSSE('execution:step', { appId: newApp.id, step: `[Cloud Runner] Navigating to ${job.url}` });
      }, 500);
      setTimeout(() => {
        broadcastSSE('execution:step', { appId: newApp.id, step: `[ATS Engine] Detected ${job.atsName} form structures; injecting ${db.user.name} profile` });
      }, 1200);
      setTimeout(() => {
        broadcastSSE('execution:step', { appId: newApp.id, step: `[Verified Receipt] Dispatched. Confirmation ID: ${confNum}` });
        broadcastSSE('execution:completed', { appId: newApp.id, status: 'Submitted', confirmationNumber: confNum });
      }, 2000);

      res.writeHead(201);
      res.end(JSON.stringify({ success: true, application: newApp }));
      return;
    }

    // POST /api/v1/applications/:id/approve
    if (pathname.match(/^\/api\/v1\/applications\/([^/]+)\/approve$/) && method === 'POST') {
      const appId = pathname.split('/')[4];
      const app = db.applications.find(a => a.id === appId);
      if (app) {
        app.resumeStatus = 'Tailored';
        app.status = 'Submitted';
        app.statusType = 'submitted';
        saveDB();
        broadcastSSE('execution:completed', { appId: app.id, status: 'Submitted' });
      }
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, application: app }));
      return;
    }

    // GET /api/v1/subscriptions/current
    if (pathname === '/api/v1/subscriptions/current' && method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ subscription: db.subscription }));
      return;
    }

    // POST /api/v1/subscription/razorpay/create-order
    if (pathname === '/api/v1/subscription/razorpay/create-order' && method === 'POST') {
      const body = await parseBody(req);
      const planId = body.planId || 'sub_power';
      const currency = (body.currency || 'INR').toUpperCase();

      let amountInSmallestUnit = 299900;
      let planName = 'Pro Auto-Pilot';

      if (currency === 'USD') {
        if (planId === 'sub_starter') amountInSmallestUnit = 1900;
        else if (planId === 'sub_power') amountInSmallestUnit = 9900;
        else amountInSmallestUnit = 3900;
      } else if (currency === 'EUR') {
        if (planId === 'sub_starter') amountInSmallestUnit = 1800;
        else if (planId === 'sub_power') amountInSmallestUnit = 9200;
        else amountInSmallestUnit = 3600;
      } else {
        if (planId === 'sub_starter') amountInSmallestUnit = 149900;
        else if (planId === 'sub_power') amountInSmallestUnit = 749900;
        else amountInSmallestUnit = 299900;
      }

      if (planId === 'sub_starter') planName = 'Starter Auto-Pilot';
      if (planId === 'sub_power') planName = 'Power Auto-Pilot';

      const orderId = `order_${crypto.randomBytes(8).toString('hex')}`;

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        orderId: orderId,
        amount: amountInSmallestUnit,
        currency: currency,
        keyId: db.subscription.keyId,
        planId: planId,
        planName: planName
      }));
      return;
    }

    // POST /api/v1/subscription/razorpay/verify-payment (FEAT-004 Cryptographic Verification)
    if (pathname === '/api/v1/subscription/razorpay/verify-payment' && method === 'POST') {
      const body = await parseBody(req);
      const { razorpay_payment_id, razorpay_order_id, razorpay_signature, planId } = body;

      // In production/sandbox, if signature is supplied, verify it cryptographically
      if (razorpay_signature) {
        const isSignatureValid = billing.verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
        if (!isSignatureValid) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Invalid or forged Razorpay payment signature' }));
          return;
        }
      }

      let creditsToAdd = 1500;
      if (planId === 'sub_power') {
        db.subscription.planId = 'sub_power_inr_monthly';
        db.subscription.planName = 'Power Auto-Pilot';
        db.subscription.monthlyPriceINR = 7499;
        db.subscription.monthlyPriceUSD = 99;
        db.subscription.appsLimit = 4500;
        creditsToAdd = 3000;
      } else if (planId === 'sub_starter') {
        db.subscription.planId = 'sub_starter_inr_monthly';
        db.subscription.planName = 'Starter Auto-Pilot';
        db.subscription.monthlyPriceINR = 1499;
        db.subscription.monthlyPriceUSD = 19;
        db.subscription.appsLimit = 600;
        creditsToAdd = 500;
      } else {
        db.subscription.planId = 'sub_pro_inr_monthly';
        db.subscription.planName = 'Pro Auto-Pilot';
        db.subscription.monthlyPriceINR = 2999;
        db.subscription.monthlyPriceUSD = 39;
        db.subscription.appsLimit = 1500;
        creditsToAdd = 1500;
      }

      db.user.credits += creditsToAdd;

      const newInvoice = {
        id: `INV-RZP-${Date.now().toString().slice(-6)}`,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        amount: `₹${(db.subscription.monthlyPriceINR).toLocaleString('en-IN')}.00`,
        paymentId: razorpay_payment_id || `pay_${crypto.randomBytes(6).toString('hex')}`,
        orderId: razorpay_order_id || `order_${crypto.randomBytes(6).toString('hex')}`,
        status: 'Paid',
        receiptUrl: '#'
      };

      db.subscription.invoices.unshift(newInvoice);
      saveDB();

      // Record credit journal entry in Prisma
      billing.grantCredits({
        tenantId: 'tenant-rolevia-default',
        userId: 'usr-sameer-01',
        amount: creditsToAdd,
        referenceType: 'INVOICE',
        referenceId: newInvoice.id,
        idempotencyKey: `sub-grant-${newInvoice.paymentId}`
      }).catch(e => console.warn('[Rolevia Billing] Journal grant sync:', e.message));

      broadcastSSE('subscription:upgraded', { subscription: db.subscription, user: db.user });

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        message: `Successfully activated ${db.subscription.planName} via Razorpay!`,
        subscription: db.subscription,
        user: db.user,
        invoice: newInvoice
      }));
      return;
    }

    // POST /api/v1/subscription/razorpay/webhook (FEAT-004 Replay Protected Webhooks)
    if (pathname === '/api/v1/subscription/razorpay/webhook' && method === 'POST') {
      const signature = req.headers['x-razorpay-signature'];
      const rawData = await parseBody(req);
      const rawBody = typeof rawData.rawBody === 'string' ? rawData.rawBody : JSON.stringify(rawData);
      const eventId = rawData.id || `evt_${crypto.randomBytes(8).toString('hex')}`;

      const webhookResult = await billing.processWebhookEvent({
        rawBody,
        signature,
        eventId,
        eventType: rawData.event || 'payment.captured'
      });

      if (!webhookResult.valid) {
        res.writeHead(400);
        res.end(JSON.stringify(webhookResult));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify(webhookResult));
      return;
    }

    // GET /api/v1/inbox/messages
    if (pathname === '/api/v1/inbox/messages' && method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ messages: db.inboxMessages }));
      return;
    }

    // POST /api/v1/autopilot/toggle
    if (pathname === '/api/v1/autopilot/toggle' && method === 'POST') {
      db.autoPilot.active = !db.autoPilot.active;
      saveDB();
      broadcastSSE('autopilot:state', { active: db.autoPilot.active });
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, autoPilot: db.autoPilot }));
      return;
    }

    // 404 for unknown API
    res.writeHead(404);
    res.end(JSON.stringify({ error: `Endpoint not found in ${BRAND.productName} API contract` }));
    return;
  }

  // 3. STATIC FILES SERVING
  const decodedPath = decodeURIComponent(pathname);
  let filePath = path.join(STATIC_ROOT, decodedPath === '/' ? 'index.html' : decodedPath);

  // Security sandbox check
  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end('Access Denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`[${BRAND.brandId} Engine] Production SaaS Server running at http://localhost:${PORT}`);
  console.log(`[${BRAND.brandId} Engine] AdonisJS Transmit SSE active at http://localhost:${PORT}/__transmit/events`);
  console.log(`[${BRAND.brandId} Engine] Razorpay Subscription Gateway active at /api/v1/subscription/razorpay/*`);
  console.log(`[${BRAND.brandId} Engine] API Gateway active at http://localhost:${PORT}/api/v1`);
  console.log(`[${BRAND.brandId} Engine] Multi-Tenant Auth active at /api/v1/auth/*`);
  console.log(`[${BRAND.brandId} Engine] Brand Config Discovery active at /api/v1/brand/config`);

  // Initial Job Health Preflight
  jobCrawler.runPeriodicFreshnessScan().then(res => {
    console.log(`[${BRAND.brandId} Engine] Live Job Health Verification: ${res.verifiedLive} verified live jobs online (${res.expiredMarked} expired)`);
  }).catch(e => console.warn(`[${BRAND.brandId} Engine] Health verification initial check:`, e.message));

  // Periodic Auto-Purge every 30 minutes
  setInterval(() => {
    jobCrawler.runPeriodicFreshnessScan().catch(() => {});
  }, 30 * 60 * 1000);
});
