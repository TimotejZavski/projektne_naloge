const { setupTestDb, clearTestDb, teardownTestDb } = require('./setup');

jest.mock('mqtt', () => ({ connect: jest.fn() }), { virtual: true });

jest.setTimeout(120000);

let Device;
let MqttListener;
let SensorMeasurement;
let User;

beforeAll(async () => {
  await setupTestDb();
  Device = require('../src/models/Device');
  MqttListener = require('../src/services/MqttListener');
  SensorMeasurement = require('../src/models/SensorMeasurement');
  User = require('../src/models/User');
});

afterEach(clearTestDb);
afterAll(teardownTestDb);

async function createOwnedDevice(deviceId = 'npo-gps-01') {
  const user = await User.create({
    email: `${deviceId}@example.com`,
    displayName: 'NPO GPS',
    passwordHash: 'StrongP@ss123',
  });

  await Device.create({
    deviceId,
    userId: user._id,
    name: 'NPO GPS naprava',
    platform: 'android',
  });

  return user;
}

describe('MQTT GPS ingestion', () => {
  it('shrani NPO GPS MQTT sporocilo s casom meritve in natancnostjo', async () => {
    const deviceId = 'npo-gps-01';
    const user = await createOwnedDevice(deviceId);
    const timestampUtc = new Date(Date.now() - 1000).toISOString();
    const listener = new MqttListener();

    await listener.handleMessage(
      `smart-playgrounds/devices/${deviceId}/sensors/gps`,
      Buffer.from(
        JSON.stringify({
          schemaVersion: '1.0',
          deviceId,
          sensorType: 'gps',
          timestampUtc,
          data: {
            latitude: 46.5547,
            longitude: 15.6459,
            accuracyMeters: 8.5,
          },
        }),
      ),
    );

    const measurement = await SensorMeasurement.findOne({ deviceId }).lean();

    expect(measurement).toBeTruthy();
    expect(measurement.userId.toString()).toBe(user._id.toString());
    expect(measurement.sensorType).toBe('gps');
    expect(measurement.source).toBe('mqtt');
    expect(measurement.schemaVersion).toBe('1.0');
    expect(measurement.timestampUtc.toISOString()).toBe(timestampUtc);
    expect(measurement.data).toEqual({
      latitude: 46.5547,
      longitude: 15.6459,
      accuracyMeters: 8.5,
    });
  });

  it('zavrne GPS payload, ki se ne ujema z MQTT topicom', async () => {
    await createOwnedDevice('npo-gps-02');
    const listener = new MqttListener();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await listener.handleMessage(
      'smart-playgrounds/devices/npo-gps-02/sensors/gps',
      Buffer.from(
        JSON.stringify({
          schemaVersion: '1.0',
          deviceId: 'druga-naprava',
          sensorType: 'gps',
          timestampUtc: new Date(Date.now() - 1000).toISOString(),
          data: {
            latitude: 46.5547,
            longitude: 15.6459,
          },
        }),
      ),
    );

    expect(warnSpy).toHaveBeenCalledWith(
      '[MQTT] Payload does not match topic: smart-playgrounds/devices/npo-gps-02/sensors/gps',
    );
    await expect(SensorMeasurement.countDocuments()).resolves.toBe(0);
    warnSpy.mockRestore();
  });
});
