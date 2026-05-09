/**
 * Smoke test za Device model + validator.
 * Zazeni z: node scripts/smoke-device-model.js
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const User = require('../src/models/User');
const Device = require('../src/models/Device');
const {
  registerDeviceSchema,
  updateDeviceSchema,
  listDevicesQuerySchema,
} = require('../src/validators/device.validator');

let pass = 0;
let fail = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    pass++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    fail++;
  }
}

async function main() {
  await connectDatabase();
  console.log('\n=== Device model + validator smoke test ===\n');

  // Cleanup od prejsnjih runov
  await Device.deleteMany({ deviceId: { $regex: /^smoke-/ } });
  await User.deleteMany({ email: { $regex: /^smoke-dev-/ } });

  // Pripravimo testnega uporabnika
  const owner = new User({ email: `smoke-dev-${Date.now()}@example.test`, displayName: 'Owner X' });
  owner.setPassword('Strong123');
  await owner.save();

  // 1. Kreacija naprave
  const dev = new Device({
    deviceId: 'smoke-' + Date.now(),
    userId: owner._id,
    name: 'Test Device',
    platform: 'android',
    appVersion: '1.0.0',
  });
  await dev.save();
  check(dev._id, 'naprava shranjena');
  check(dev.isActive === true, 'isActive privzeto true');
  check(dev.lastSeenAtUtc instanceof Date, 'lastSeenAtUtc je Date');

  // 2. Duplicate deviceId
  let dupErr = null;
  try {
    const dup = new Device({ deviceId: dev.deviceId, userId: owner._id });
    await dup.save();
  } catch (e) { dupErr = e; }
  check(dupErr && dupErr.code === 11000, 'duplicate deviceId vrne E11000');

  // 3. Manjkajoci userId
  let missingUserErr = null;
  try {
    const orphan = new Device({ deviceId: 'smoke-orphan-' + Date.now() });
    await orphan.save();
  } catch (e) { missingUserErr = e; }
  check(missingUserErr && missingUserErr.name === 'ValidationError', 'manjkajoc userId zavrnjen');

  // 4. Invalid deviceId (presledki, slash)
  let badIdErrors = [];
  for (const bad of ['has spaces', 'has/slash', 'ž-sumnik', 'a', 'a'.repeat(100), 'wild+card', 'wild#card']) {
    try {
      const d = new Device({ deviceId: bad, userId: owner._id });
      await d.save();
    } catch (e) { badIdErrors.push(bad); }
  }
  check(badIdErrors.length === 7, `vsi nevalidni deviceId-ji zavrnjeni (${badIdErrors.length}/7)`);

  // 5. touchLastSeen atomic update
  const oldSeen = dev.lastSeenAtUtc.getTime();
  await new Promise(r => setTimeout(r, 30));
  await Device.touchLastSeen(dev.deviceId);
  const refreshed = await Device.findById(dev._id);
  check(refreshed.lastSeenAtUtc.getTime() > oldSeen, 'touchLastSeen posodobi lastSeenAtUtc');

  // ===== Validator smoke =====
  console.log('\n=== Joi validator smoke test ===\n');

  // 6. registerDeviceSchema - happy path
  const r1 = registerDeviceSchema.validate({ deviceId: 'good-id_123' });
  check(!r1.error, 'registerDevice: minimal valid');
  check(r1.value.platform === 'other', 'registerDevice: privzeti platform = other');

  // 7. registerDeviceSchema - bad deviceId
  const r2 = registerDeviceSchema.validate({ deviceId: 'has spaces' });
  check(r2.error, 'registerDevice: zavrne deviceId s presledki');

  // 8. registerDeviceSchema - invalid platform
  const r3 = registerDeviceSchema.validate({ deviceId: 'good-id', platform: 'symbian' });
  check(r3.error, 'registerDevice: zavrne nepoznano platformo');

  // 9. updateDeviceSchema - prazno telo
  const r4 = updateDeviceSchema.validate({});
  check(r4.error, 'updateDevice: zavrne prazno telo');

  // 10. updateDeviceSchema - en field
  const r5 = updateDeviceSchema.validate({ name: 'New name' });
  check(!r5.error, 'updateDevice: en field je dovolj');

  // 11. listDevicesQuerySchema - convert string limit -> number
  const r6 = listDevicesQuerySchema.validate({ limit: '25' });
  check(!r6.error && r6.value.limit === 25, 'listDevices: pretvori string limit v number');

  // 12. listDevicesQuerySchema - cursor mora biti hex 24
  const r7 = listDevicesQuerySchema.validate({ cursor: 'not-hex' });
  check(r7.error, 'listDevices: zavrne cursor ki ni 24-hex');

  const r8 = listDevicesQuerySchema.validate({ cursor: '507f1f77bcf86cd799439011' });
  check(!r8.error, 'listDevices: sprejme veljaven 24-hex cursor');

  // Cleanup
  await Device.deleteMany({ deviceId: { $regex: /^smoke-/ } });
  await User.deleteMany({ email: { $regex: /^smoke-dev-/ } });

  console.log(`\n=== ${pass} passed / ${fail} failed ===\n`);
  await disconnectDatabase();
  if (fail > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error('Smoke test error:', err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
