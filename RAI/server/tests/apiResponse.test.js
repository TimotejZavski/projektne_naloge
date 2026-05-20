const { serializeDocument } = require('../src/pipeline/apiResponse');

describe('SCRUM-34 API output pipeline', () => {
  it('maps Mongo _id to id and hides internal fields', () => {
    const serialized = serializeDocument({
      _id: { toHexString: () => '65fa1c9b3e0e8a7d2c3a9e14' },
      email: 'user@example.com',
      passwordHash: 'secret',
      __v: 0,
    });

    expect(serialized).toEqual({
      id: '65fa1c9b3e0e8a7d2c3a9e14',
      email: 'user@example.com',
    });
  });

  it('serializes nested dates for API output', () => {
    const serialized = serializeDocument({
      createdAtUtc: new Date('2026-05-20T10:00:00.000Z'),
      latestMeasurements: [
        {
          timestampUtc: new Date('2026-05-20T10:01:00.000Z'),
        },
      ],
    });

    expect(serialized).toEqual({
      createdAtUtc: '2026-05-20T10:00:00.000Z',
      latestMeasurements: [
        {
          timestampUtc: '2026-05-20T10:01:00.000Z',
        },
      ],
    });
  });
});
