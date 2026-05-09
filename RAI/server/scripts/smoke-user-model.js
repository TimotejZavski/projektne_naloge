/**
 * Smoke test za User in Session model.
 * Zazeni z: node scripts/smoke-user-model.js
 *
 * Preveri:
 *  - kreacija uporabnika (geslo se hashira)
 *  - hash NI enak originalu
 *  - comparePassword vrne true za pravilno, false za napacno
 *  - findByCredentials vrne uporabnika za pravilno, null za napacno
 *  - toJSON ne razkrije passwordHash
 *  - duplicate email vrne E11000
 *  - session createForToken + findByRefreshToken delujeta
 */

const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const User = require('../src/models/User');
const Session = require('../src/models/Session');

const TEST_EMAIL = `smoke-${Date.now()}@example.test`;

async function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function main() {
  await connectDatabase();
  console.log('\n=== User model smoke test ===\n');

  // --- Cleanup od prejsnjih runov
  await User.deleteMany({ email: { $regex: /^smoke-/ } });
  await Session.deleteMany({});

  // 1. Kreacija uporabnika
  const user = new User({
    email: TEST_EMAIL,
    displayName: 'Smoke Test',
  });
  user.setPassword('SuperSecret123!');
  await user.save();
  await assert(user._id, 'uporabnik je shranjen z _id');

  // 2. passwordHash je hashiran (ni enak originalu)
  await assert(user.passwordHash !== 'SuperSecret123!', 'passwordHash NI enak plain geslu');
  await assert(user.passwordHash.startsWith('$2'), 'passwordHash je v bcrypt formatu');

  // 3. comparePassword
  const okRight = await user.comparePassword('SuperSecret123!');
  await assert(okRight === true, 'comparePassword vrne true za pravilno geslo');
  const okWrong = await user.comparePassword('WrongPassword!');
  await assert(okWrong === false, 'comparePassword vrne false za napacno geslo');

  // 4. findByCredentials
  const found = await User.findByCredentials(TEST_EMAIL, 'SuperSecret123!');
  await assert(found && found._id.equals(user._id), 'findByCredentials najde s pravilnim geslom');
  const notFound = await User.findByCredentials(TEST_EMAIL, 'wrong');
  await assert(notFound === null, 'findByCredentials vrne null za napacno geslo');
  const notFoundUser = await User.findByCredentials('does-not-exist@x.com', 'whatever');
  await assert(notFoundUser === null, 'findByCredentials vrne null za neobstojec email');

  // 5. toJSON ne razkrije passwordHash
  const json = user.toJSON();
  await assert(!('passwordHash' in json), 'toJSON ne vsebuje passwordHash');
  await assert(!('__v' in json), 'toJSON ne vsebuje __v');
  await assert(json.email === TEST_EMAIL.toLowerCase(), 'email je shranjen lowercase');

  // 6. Duplicate email
  let duplicateError = null;
  try {
    const dup = new User({ email: TEST_EMAIL, displayName: 'Dup' });
    dup.setPassword('AnotherPass1!');
    await dup.save();
  } catch (err) {
    duplicateError = err;
  }
  await assert(duplicateError && duplicateError.code === 11000, 'duplicate email vrne E11000');

  // 7. Validacija - prazno geslo
  let emptyPwError = null;
  try {
    new User({ email: 'x@x.com', displayName: 'X' }).setPassword('');
  } catch (err) {
    emptyPwError = err;
  }
  await assert(emptyPwError, 'setPassword zavrne prazen string');

  // 8. Email validacija
  const badEmailUser = new User({ email: 'not-an-email', displayName: 'X' });
  badEmailUser.setPassword('Valid12345!');
  let validationError = null;
  try {
    await badEmailUser.save();
  } catch (err) {
    validationError = err;
  }
  await assert(validationError && validationError.name === 'ValidationError', 'invalid email format zavrnjen');

  console.log('\n=== Session model smoke test ===\n');

  // 9. Session createForToken + findByRefreshToken
  const fakeToken = 'fake-refresh-token-' + Date.now();
  const session = await Session.createForToken({
    userId: user._id,
    rawToken: fakeToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    userAgent: 'smoke-test/1.0',
    ipAddress: '127.0.0.1',
  });
  await assert(session._id, 'session shranjena');
  await assert(session.refreshTokenHash !== fakeToken, 'session shrani SAMO hash, ne raw token');

  const foundSession = await Session.findByRefreshToken(fakeToken);
  await assert(foundSession && foundSession._id.equals(session._id), 'findByRefreshToken najde sejo');

  // 10. isActive + revoke
  await assert(foundSession.isActive() === true, 'sveza seja je aktivna');
  await foundSession.revoke('logout');
  await assert(foundSession.isActive() === false, 'po revoke seja NI aktivna');

  // Cleanup
  await User.deleteMany({ email: { $regex: /^smoke-/ } });
  await Session.deleteMany({});

  console.log('\n✅ Vsi smoke testi opravljeni.\n');
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error('Smoke test failed:', err);
  await disconnectDatabase();
  process.exit(1);
});
