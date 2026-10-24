// Rolevia AI · Enterprise Multi-Tenant Authentication Engine (FEAT-002 Hardened)
// Implements 15-minute short-lived access tokens, cryptographic refresh-token rotation in PostgreSQL,
// token revocation, HTTP-only secure cookie support, CSRF protection, and strict tenant boundary isolation.

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'rolevia_ai_super_secret_jwt_key_2026_production_ready';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'rolevia_ai_super_secret_refresh_jwt_key_2026_rotation';

const ACCESS_TOKEN_EXPIRY = '15m'; // Strict 15-minute lifetime
const REFRESH_TOKEN_DAYS = 7;      // 7-day refresh window

/**
 * Hash plain text password using bcrypt (cost factor 10)
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
 * Generate 15-minute short-lived access token with tenant context
 */
function generateAccessToken(user) {
  const payload = {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    name: user.name,
    tokenType: 'access'
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

/**
 * Create and persist a secure cryptographically random refresh token in PostgreSQL
 */
async function createRefreshToken(userId, userAgent = 'Unknown', ipAddress = '127.0.0.1') {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      userAgent,
      ipAddress,
      expiresAt,
      revoked: false
    }
  });

  return { rawToken, expiresAt };
}

/**
 * Rotate refresh token: validates existing token, revokes it, and issues new token pair
 */
async function rotateRefreshToken(rawRefreshToken, userAgent = 'Unknown', ipAddress = '127.0.0.1') {
  if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
    throw new Error('Valid refresh token required');
  }

  const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

  const existingToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!existingToken) {
    throw new Error('Invalid refresh token');
  }

  if (existingToken.revoked) {
    // Potential Token Theft: Invalidate all tokens for this user as a safeguard
    await prisma.refreshToken.updateMany({
      where: { userId: existingToken.userId },
      data: { revoked: true, revokedAt: new Date() }
    });
    throw new Error('Revoked token reuse detected. All active sessions invalidated.');
  }

  if (new Date() > existingToken.expiresAt) {
    throw new Error('Refresh token has expired');
  }

  // Generate new token pair
  const newRawToken = crypto.randomBytes(40).toString('hex');
  const newTokenHash = crypto.createHash('sha256').update(newRawToken).digest('hex');
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  // Atomic rotation in transaction
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existingToken.id },
      data: {
        revoked: true,
        revokedAt: new Date(),
        replacedByTokenHash: newTokenHash
      }
    }),
    prisma.refreshToken.create({
      data: {
        userId: existingToken.userId,
        tokenHash: newTokenHash,
        userAgent,
        ipAddress,
        expiresAt: newExpiresAt,
        revoked: false
      }
    })
  ]);

  const newAccessToken = generateAccessToken(existingToken.user);

  return {
    accessToken: newAccessToken,
    refreshToken: newRawToken,
    expiresAt: newExpiresAt,
    user: {
      id: existingToken.user.id,
      email: existingToken.user.email,
      name: existingToken.user.name,
      tenantId: existingToken.user.tenantId,
      credits: existingToken.user.credits
    }
  };
}

/**
 * Revoke a refresh token (e.g. during user logout)
 */
async function revokeRefreshToken(rawRefreshToken) {
  if (!rawRefreshToken) return false;
  const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
  try {
    await prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revoked: true, revokedAt: new Date() }
    });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Verify JWT access token string
 */
function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.tokenType && decoded.tokenType !== 'access') return null;
    return decoded;
  } catch (err) {
    return null;
  }
}

/**
 * Parse Bearer token from headers or cookies
 */
function extractAccessToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // Cookie fallback
  const cookieHeader = req.headers['cookie'];
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').reduce((acc, pair) => {
      const [key, val] = pair.trim().split('=');
      if (key && val) acc[key] = decodeURIComponent(val);
      return acc;
    }, {});
    if (cookies.rolevia_access_token) return cookies.rolevia_access_token;
  }

  return null;
}

/**
 * Multi-Tenant Authentication Middleware
 * Enforces authenticated tenant boundary and checks access token validity
 */
async function authenticateRequest(req) {
  const token = extractAccessToken(req);
  if (!token) {
    return { authenticated: false, error: 'Authorization token required' };
  }

  const decoded = verifyAccessToken(token);
  if (!decoded || !decoded.userId || !decoded.tenantId) {
    return { authenticated: false, error: 'Invalid or expired access token' };
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
async function registerUser({ email, password, name, phone, tenantSubdomain = 'default', userAgent, ipAddress }) {
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

  const accessToken = generateAccessToken(newUser);
  const { rawToken: refreshToken, expiresAt } = await createRefreshToken(newUser.id, userAgent, ipAddress);

  return {
    success: true,
    accessToken,
    refreshToken,
    expiresAt,
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
 * Authenticate login credentials and issue short-lived access token + rotating refresh token
 */
async function loginUser({ email, password, userAgent, ipAddress }) {
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

  const accessToken = generateAccessToken(user);
  const { rawToken: refreshToken, expiresAt } = await createRefreshToken(user.id, userAgent, ipAddress);

  return {
    success: true,
    accessToken,
    refreshToken,
    expiresAt,
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

/**
 * CSRF Protection Token Helper
 */
function generateCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

function verifyCsrfToken(cookieToken, headerToken) {
  if (!cookieToken || !headerToken || typeof cookieToken !== 'string' || typeof headerToken !== 'string') {
    return false;
  }
  const bufA = Buffer.from(cookieToken, 'utf8');
  const bufB = Buffer.from(headerToken, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  hashPassword,
  comparePassword,
  generateAccessToken,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  verifyAccessToken,
  authenticateRequest,
  registerUser,
  loginUser,
  generateCsrfToken,
  verifyCsrfToken
};
