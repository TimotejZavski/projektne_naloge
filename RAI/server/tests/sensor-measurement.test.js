/**
 * SCRUM-19: integracija kamera + GPS senzorjev.
 */

const { setupTestDb, clearTestDb, teardownTestDb } = require('./setup');

jest.setTimeout(120000);

let SensorMeasurement;

beforeAll(async () => {
  await setupTestDb();
  SensorMeasurement = require('../src/models/SensorMeasurement');
});

afterEach(clearTestDb);
afterAll(teardownTestDb);

describe('SensorMeasurement model', () => {
  it('shrani GPS meritev', async () => {
    const measurement = await SensorMeasurement.create({
      deviceId: 'phone-srecko-01',
      sensorType: 'gps',
      timestampUtc: new Date('2026-05-09T10:00:00Z'),
      source: 'mqtt',
      data: {
        latitude: 46.0569,
        longitude: 14.5058,
        accuracyMeters: 4.2,
      },
    });

    expect(measurement.deviceId).toBe('phone-srecko-01');
    expect(measurement.sensorType).toBe('gps');
    expect(measurement.data.latitude).toBe(46.0569);
  });

  it('shrani kamera meritev samo z GPS lokacijo', async () => {
    const measurement = await SensorMeasurement.create({
      deviceId: 'camera-node-01',
      sensorType: 'camera',
      source: 'http',
      data: {
        captureId: 'capture-001',
        mediaType: 'image/jpeg',
        imageUrl: 'https://example.com/captures/capture-001.jpg',
        gps: {
          latitude: 46.0569,
          longitude: 14.5058,
          accuracyMeters: 5,
        },
      },
    });

    expect(measurement.sensorType).toBe('camera');
    expect(measurement.data.gps.longitude).toBe(14.5058);
  });

  it('zavrne kamera meritev brez GPS lokacije', async () => {
    const measurement = new SensorMeasurement({
      deviceId: 'camera-node-02',
      sensorType: 'camera',
      data: {
        captureId: 'capture-002',
        mediaType: 'image/png',
      },
    });

    await expect(measurement.validate()).rejects.toThrow('data se ne ujema');
  });

  it('zavrne GPS meritev z neveljavno sirino', async () => {
    const measurement = new SensorMeasurement({
      deviceId: 'phone-srecko-02',
      sensorType: 'gps',
      data: {
        latitude: 120,
        longitude: 14.5058,
      },
    });

    await expect(measurement.validate()).rejects.toThrow('data se ne ujema');
  });
});
