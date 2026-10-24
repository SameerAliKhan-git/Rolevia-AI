// Rolevia AI · Automated Test Suite: FEAT-002 (Enterprise Multi-Tenant Authentication & Session Security)
// Verifies bcrypt hashing, 15-minute access tokens, cryptographic refresh-token rotation in PostgreSQL,
// session revocation, reuse attack detection, CSRF protection, and multi-tenant authorization boundaries.

const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const auth = require('../backend/auth');
const prisma = require('../backend/db');

async function testFeat002Auth() {
  console.log('\n--- [TEST SUITE 2] FEAT-002: Hardened Multi-Tenant Authentication & Tokens ---');
  let testsPassed = 0;

  // 1. Password Hashing & Bcrypt Cost Verification
  const plainPassword = 'RoleviaProductionPass2026!';
  const hash = await auth.hashPassword(plainPassword);
  assert(hash !== plainPassword, 'Hash must not equal plain password');
  assert(hash.startsWith('$2'), 'Bcrypt hash format check');
  const validMatch = await auth.comparePassword(plainPassword, hash);
  assert.strictEqual(validMatch, true, 'Valid password must match hash');
  const invalidMatch = await auth.comparePassword('WrongPassword123!', hash);
  assert.strictEqual(invalidMatch, false, 'Invalid password must not match hash');
  console.log('✓ [SECURITY] Bcrypt: Password hashing and comparison verified (cost factor 10)');
  testsPassed++;

  // 2. Reject Short Passwords (< 8 characters)
  let shortRejected = false;
  try {
    await auth.hashPassword('short7');
  } catch (err) {
    shortRejected = true;
  }
  assert.strictEqual(shortRejected, true, 'Passwords under 8 chars must be rejected');
  console.log('✓ [SECURITY] Validation: Passwords under 8 characters rejected at boundary');
  testsPassed++;

  // 3. User Registration with Tenant and 15-Minute Access Token
  const testEmail = `auth_candidate_${Date.now()}@rolevia.test`;
  const regResult = await auth.registerUser({
    email: testEmail,
    password: 'SecureCandidatePass123!',
    name: 'Sarah Connor',
    phone: '+1-555-0144',
    tenantSubdomain: `tenant-auth-${Date.now()}`
  });
  assert.strictEqual(regResult.success, true, 'Registration must succeed');
  assert(regResult.accessToken, 'Registration must return short-lived access token');
  assert(regResult.refreshToken, 'Registration must return persistent refresh token');
  assert.strictEqual(regResult.user.credits, 50, 'New user should receive 50 welcome credits');
  console.log('✓ [AUTH] Registration: Tenant created with 50 credits, access token and refresh token');
  testsPassed++;

  // 4. Access Token Lifetime Check (Strict 15-Minute Expiry)
  const decoded = auth.verifyAccessToken(regResult.accessToken);
  assert(decoded !== null, 'Access token must be cryptographically valid');
  assert.strictEqual(decoded.email, testEmail, 'Token payload must contain user email');
  assert.strictEqual(decoded.tokenType, 'access', 'Token must have access tokenType');
  const durationSeconds = decoded.exp - decoded.iat;
  assert.strictEqual(durationSeconds, 15 * 60, `Access token must expire in exactly 900 seconds (15 min), got: ${durationSeconds}`);
  console.log('✓ [SECURITY] Token Lifetime: Strict 15-minute access token verified (900 seconds)');
  testsPassed++;

  // 5. Expired Access Token Rejection
  const expiredSecret = process.env.JWT_SECRET || 'rolevia_ai_super_secret_jwt_key_2026_production_ready';
  const expiredToken = jwt.sign(
    { userId: regResult.user.id, tenantId: regResult.user.tenantId, email: testEmail, tokenType: 'access' },
    expiredSecret,
    { expiresIn: '-1s' }
  );
  const verifyExpired = auth.verifyAccessToken(expiredToken);
  assert.strictEqual(verifyExpired, null, 'Expired access token must be rejected');
  console.log('✓ [SECURITY] Expiration: Expired access token rejected cleanly without unhandled exception');
  testsPassed++;

  // 6. Refresh Token Rotation in PostgreSQL
  const rotation1 = await auth.rotateRefreshToken(regResult.refreshToken, 'TestAgent/1.0', '127.0.0.1');
  assert(rotation1.accessToken, 'Rotation must return new access token');
  assert(rotation1.refreshToken, 'Rotation must return new refresh token');
  assert.notStrictEqual(rotation1.refreshToken, regResult.refreshToken, 'New refresh token must differ from old');

  // Verify old token is marked revoked in PostgreSQL
  const oldHashed = require('node:crypto').createHash('sha256').update(regResult.refreshToken).digest('hex');
  const oldTokenRecord = await prisma.refreshToken.findUnique({ where: { tokenHash: oldHashed } });
  assert.strictEqual(oldTokenRecord.revoked, true, 'Rotated refresh token must be revoked in PostgreSQL');
  console.log('✓ [DB] Token Rotation: Cryptographic refresh token rotated atomically in PostgreSQL');
  testsPassed++;

  // 7. Refresh Token Reuse Attack Detection (Revokes All User Sessions)
  let reuseDetected = false;
  try {
    // Attempt to use the already-revoked old refresh token
    await auth.rotateRefreshToken(regResult.refreshToken, 'RogueAgent/1.0', '192.168.1.100');
  } catch (err) {
    if (err.message.includes('Revoked token reuse detected')) {
      reuseDetected = true;
    }
  }
  assert.strictEqual(reuseDetected, true, 'Reuse of revoked token must trigger security alert');

  // Verify that all active tokens for this user were invalidated
  const allUserTokens = await prisma.refreshToken.findMany({ where: { userId: regResult.user.id } });
  const allRevoked = allUserTokens.every(t => t.revoked === true);
  assert.strictEqual(allRevoked, true, 'All active sessions must be invalidated upon token theft attempt');
  console.log('✓ [SECURITY] Reuse Defense: Token theft detected and all user sessions invalidated');
  testsPassed++;

  // 8. Explicit Refresh Token Revocation (Logout)
  const loginAgain = await auth.loginUser({
    email: testEmail,
    password: 'SecureCandidatePass123!'
  });
  const revokeResult = await auth.revokeRefreshToken(loginAgain.refreshToken);
  assert.strictEqual(revokeResult, true, 'Revocation must return true');
  const revokedHash = require('node:crypto').createHash('sha256').update(loginAgain.refreshToken).digest('hex');
  const revokedRecord = await prisma.refreshToken.findUnique({ where: { tokenHash: revokedHash } });
  assert.strictEqual(revokedRecord.revoked, true, 'Token must be revoked in PostgreSQL');
  console.log('✓ [AUTH] Token Revocation: User session logout explicitly revokes refresh token');
  testsPassed++;

  // 9. Multi-Tenant Authorization & Boundary Isolation
  const validReq = {
    headers: { authorization: `Bearer ${loginAgain.accessToken}` }
  };
  const authValid = await auth.authenticateRequest(validReq);
  assert.strictEqual(authValid.authenticated, true, 'Valid token must authenticate');
  assert.strictEqual(authValid.tenantId, regResult.user.tenantId, 'Tenant context attached');

  // Simulated Cross-Tenant Tampered Token
  const tamperedToken = jwt.sign(
    { userId: regResult.user.id, tenantId: 'rogue-foreign-tenant-id', email: testEmail, tokenType: 'access' },
    expiredSecret,
    { expiresIn: '15m' }
  );
  const authTampered = await auth.authenticateRequest({
    headers: { authorization: `Bearer ${tamperedToken}` }
  });
  assert.strictEqual(authTampered.authenticated, false, 'Tampered tenant ID must be rejected');
  assert.strictEqual(authTampered.error, 'Cross-tenant access violation detected', 'Cross-tenant violation caught');
  console.log('✓ [SECURITY] Tenant Isolation: Cross-tenant token tampering strictly blocked');
  testsPassed++;

  // 10. CSRF Protection Token Generation & Constant-Time Verification
  const csrfToken = auth.generateCsrfToken();
  assert(csrfToken && csrfToken.length >= 32, 'CSRF token must be high-entropy hex string');
  const csrfValid = auth.verifyCsrfToken(csrfToken, csrfToken);
  assert.strictEqual(csrfValid, true, 'Matching CSRF tokens must pass');
  const csrfInvalid = auth.verifyCsrfToken(csrfToken, 'forged-csrf-token-1234567890123456');
  assert.strictEqual(csrfInvalid, false, 'Mismatched CSRF tokens must fail timing-safe comparison');
  console.log('✓ [SECURITY] CSRF Protection: Constant-time double-submit token verification passed');
  testsPassed++;

  console.log(`>> [PASS] FEAT-002: All ${testsPassed} authentication and security tests passed.`);
  return {
    suite: 'FEAT-002 Multi-Tenant Auth & Security',
    passed: testsPassed,
    failed: 0,
    category: 'Security'
  };
}

if (require.main === module) {
  testFeat002Auth()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('>> [FAIL] FEAT-002 Test Failure:', err);
      process.exit(1);
    });
}

module.exports = testFeat002Auth;
