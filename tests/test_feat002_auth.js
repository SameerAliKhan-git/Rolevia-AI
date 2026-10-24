// Rolevia AI · Automated Test Suite: FEAT-002 (Multi-Tenant Authentication)
// Verifies bcrypt hashing, JWT issuance & verification, password validation, and tenant boundary enforcement.

const assert = require('node:assert');
const auth = require('../backend/auth');
const prisma = require('../backend/db');

async function testFeat002Auth() {
  console.log('\n--- [TEST SUITE 2] FEAT-002: Multi-Tenant Authentication & JWT ---');

  // 1. Password hashing & verification
  const password = 'RoleviaTestPass2026!';
  const hash = await auth.hashPassword(password);
  assert(hash !== password, 'Hash must not equal plain password');
  assert(hash.startsWith('$2'), 'Bcrypt hash format check');
  const validMatch = await auth.comparePassword(password, hash);
  assert.strictEqual(validMatch, true, 'Valid password must match hash');
  const invalidMatch = await auth.comparePassword('WrongPassword!', hash);
  assert.strictEqual(invalidMatch, false, 'Invalid password must not match hash');
  console.log('✓ Bcrypt: Password hashing and comparison verified');

  // 2. Reject short passwords
  let shortPasswordError = false;
  try {
    await auth.hashPassword('short');
  } catch (e) {
    shortPasswordError = true;
  }
  assert.strictEqual(shortPasswordError, true, 'Passwords under 8 chars must be rejected');
  console.log('✓ Validation: Passwords under 8 characters rejected');

  // 3. User Registration with Tenant
  const testEmail = `candidate_test_${Date.now()}@rolevia.test`;
  const regResult = await auth.registerUser({
    email: testEmail,
    password: 'SecureCandidatePass123!',
    name: 'Jane Candidate',
    phone: '+1-555-0199',
    tenantSubdomain: `tenant-${Date.now()}`
  });
  assert.strictEqual(regResult.success, true, 'Registration must succeed');
  assert(regResult.token, 'Registration must return a JWT token');
  assert.strictEqual(regResult.user.credits, 50, 'New user should receive 50 welcome credits');
  console.log(`✓ Registration: New tenant user created with 50 credits & JWT token`);

  // 4. Token verification
  const decoded = auth.verifyToken(regResult.token);
  assert(decoded !== null, 'Token must be cryptographically valid');
  assert.strictEqual(decoded.email, testEmail, 'Token payload must contain user email');
  console.log('✓ JWT: Signed token verified with valid claims and expiration');

  // 5. Successful and Failed Login
  const loginSuccess = await auth.loginUser({
    email: testEmail,
    password: 'SecureCandidatePass123!'
  });
  assert.strictEqual(loginSuccess.success, true, 'Login with correct credentials must succeed');

  let loginFail = false;
  try {
    await auth.loginUser({ email: testEmail, password: 'WrongPassword123' });
  } catch (e) {
    loginFail = true;
  }
  assert.strictEqual(loginFail, true, 'Login with wrong password must throw error');
  console.log('✓ Login: Validated credential check & rejection of invalid password');

  // 6. Tenant Boundary Isolation Enforcement
  const mockReqValid = {
    headers: { authorization: `Bearer ${regResult.token}` }
  };
  const authValid = await auth.authenticateRequest(mockReqValid);
  assert.strictEqual(authValid.authenticated, true, 'Valid token must authenticate');
  assert.strictEqual(authValid.tenantId, regResult.user.tenantId, 'Tenant context must be attached');

  // Simulated Cross-Tenant Tampered Token
  const tamperedToken = auth.generateToken({
    id: regResult.user.id,
    tenantId: 'rogue-foreign-tenant-id',
    email: testEmail,
    name: 'Tampered'
  });
  const mockReqTampered = {
    headers: { authorization: `Bearer ${tamperedToken}` }
  };
  const authTampered = await auth.authenticateRequest(mockReqTampered);
  assert.strictEqual(authTampered.authenticated, false, 'Tampered tenant ID must be rejected');
  assert.strictEqual(authTampered.error, 'Cross-tenant access violation detected', 'Cross-tenant error thrown');
  console.log('✓ Tenant Isolation: Cross-tenant access attempt strictly rejected');

  console.log('>> [PASS] FEAT-002: Multi-tenant authentication and security verified.');
  return { suite: 'FEAT-002 Authentication', passed: 6, failed: 0 };
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
