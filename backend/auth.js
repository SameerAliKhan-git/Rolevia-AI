// Rolevia AI · Multi-Tenant Authentication Engine (FEAT-002)
// Implements bcrypt password hashing, JWT Bearer tokens, HTTP-only cookie support, and strict tenant isolation.

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'rolevia_ai_super_secret_jwt_key_2026_production_ready';
const TOKEN_EXPIRY = '7d';

/**
 * Hash plain text password using bcrypt
 */
async function hashPassword(plainPassword) {
  if (!plainPassword || typeof plainPassword !== 'string' || plainPassword.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainPassword, salt);
}

/**
 * Verify plain text password against bcrypt hash
 */
async function comparePassword(plainPassword, hash) {
  if (!plainPassword || !hash) return false;
  return bcrypt.compare(plainPassword, hash);
}

/**
 * Generate signed JWT for authenticated user with tenant context
 */
function generateToken(user) {
  const payload = {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    name: user.name
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * Verify JWT token string
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Parse Bearer token from headers or cookies
 */
function extractToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // Fallback: Cookie parser
  const cookieHeader = req.headers['cookie'];
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').reduce((acc, pair) => {
      const [key, val] = pair.trim().split('=');
      if (key && val) acc[key] = decodeURIComponent(val);
      return acc;
    }, {});
    if (cookies.rolevia_token) return cookies.rolevia_token;
    if (cookies.token) return cookies.token;
  }

  return null;
}

/**
 * Multi-Tenant Authentication Middleware
 * Enforces authenticated tenant boundary on all protected routes
 */
async function authenticateRequest(req) {
  const token = extractToken(req);
  if (!token) {
    return { authenticated: false, error: 'Authorization token required' };
  }

  const decoded = verifyToken(token);
  if (!decoded || !decoded.userId || !decoded.tenantId) {
    return { authenticated: false, error: 'Invalid or expired authorization token' };
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    include: { tenant: true }
  });

  if (!user) {
    return { authenticated: false, error: 'Authenticated user record no longer exists' };
  }

  // Tenant Boundary Check: verify user strictly belongs to token's claimed tenant
  if (user.tenantId !== decoded.tenantId) {
    return { authenticated: false, error: 'Cross-tenant access violation detected' };
  }

  return { authenticated: true, user, tenantId: user.tenantId };
}

/**
 * Register a new user in a tenant
 */
async function registerUser({ email, password, name, phone, tenantSubdomain = 'default' }) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Valid email address is required');
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw new Error('An account with this email already exists');
  }

  const tenant = await prisma.tenant.upsert({
    where: { subdomain: tenantSubdomain },
    update: {},
    create: {
      name: `${name || 'Workspace'}'s Workspace`,
      subdomain: tenantSubdomain
    }
  });

  const passwordHash = await hashPassword(password);

  const newUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: normalizedEmail,
        passwordHash: passwordHash,
        name: (name || 'Candidate').trim(),
        phone: phone || null,
        credits: 50
      }
    });

    // Create CandidateProfile
    await tx.candidateProfile.create({
      data: {
        userId: user.id,
        skills: JSON.stringify(['Full Stack', 'Software Engineering']),
        certifications: JSON.stringify([]),
        targetRoles: JSON.stringify(['Software Engineer']),
        preferredLocations: JSON.stringify(['Remote']),
        needsSponsorship: false,
        atsReadinessScore: 85
      }
    });

    // Record welcome credit journal grant
    await tx.creditJournal.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        entryType: 'SUBSCRIPTION_GRANT',
        amount: 50,
        balanceAfter: 50,
        idempotencyKey: `reg-welcome-${user.id}`,
        referenceType: 'REGISTRATION',
        referenceId: user.id
      }
    });

    return user;
  });

  const token = generateToken(newUser);
  return {
    success: true,
    token,
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      tenantId: newUser.tenantId,
      credits: newUser.credits
    }
  };
}

/**
 * Authenticate login credentials
 */
async function loginUser({ email, password }) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { tenant: true }
  });

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const isValid = await comparePassword(password, user.passwordHash);
  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  const token = generateToken(user);
  return {
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      credits: user.credits,
      roleTitle: user.roleTitle,
      location: user.location
    }
  };
}

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  authenticateRequest,
  registerUser,
  loginUser
};
