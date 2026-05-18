/**
 * SCRUM-19: integracija kamera + GPS senzorjev.
 */

const { setupTestDb, clearTestDb, teardownTestDb } = require('./setup');
const request = require('supertest');

jest.setTimeout(120000);

let app;
let SensorMeasurement;
let cameraDataSchema;

beforeAll(async () => {
  await setupTestDb();
  app = require('../src/app')();
  SensorMeasurement = require('../src/models/SensorMeasurement');
  ({ cameraDataSchema } = require('../src/validators/measurement.validator'));
});

afterEach(clearTestDb);
afterAll(teardownTestDb);

describe('SensorMeasurement model', () => {
  async function registerUser(email = 'camera-flow@example.com') {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'StrongP@ss123',
        displayName: 'Camera Tester',
      });

    return res.body.accessToken;
  }

  async function registerDevice(token, deviceId = 'camera-node-01') {
    return request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ deviceId, platform: 'android', name: 'Camera node' });
  }

  function cameraMeasurement(deviceId) {
    return {
      schemaVersion: '1.0',
      deviceId,
      sensorType: 'camera',
      timestampUtc: new Date(Date.now() - 1000).toISOString(),
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
    };
  }

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
      timestampUtc: new Date('2026-05-09T10:00:00Z'),
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
    const { error } = cameraDataSchema.validate({
      captureId: 'capture-002',
      mediaType: 'image/png',
    });

    expect(error).toBeDefined();
    expect(error.message).toContain('gps');
  });

  it('sprejme kamera meritev prek API endpointa in jo vrne pri branju', async () => {
    const token = await registerUser();
    const deviceId = 'camera-node-api';

    await registerDevice(token, deviceId);

    const createRes = await request(app)
      .post('/api/measurements')
      .set('Authorization', `Bearer ${token}`)
      .send(cameraMeasurement(deviceId));

    expect(createRes.status).toBe(201);
    expect(createRes.body.measurement.sensorType).toBe('camera');

    const readRes = await request(app)
      .get(`/api/measurements?deviceId=${deviceId}&sensorType=camera`)
      .set('Authorization', `Bearer ${token}`);

    expect(readRes.status).toBe(200);
    expect(readRes.body.measurements).toHaveLength(1);
    expect(readRes.body.measurements[0].data.gps.latitude).toBe(46.0569);
  });
});
