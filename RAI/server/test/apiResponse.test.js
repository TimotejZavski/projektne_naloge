const assert = require("node:assert/strict");
const test = require("node:test");

const { serializeDocument } = require("../src/pipeline/apiResponse");

test("serializeDocument maps Mongo _id to id and hides internal fields", () => {
  const serialized = serializeDocument({
    _id: { toHexString: () => "65fa1c9b3e0e8a7d2c3a9e14" },
    email: "user@example.com",
    passwordHash: "secret",
    __v: 0,
  });

  assert.deepEqual(serialized, {
    id: "65fa1c9b3e0e8a7d2c3a9e14",
    email: "user@example.com",
  });
});

test("serializeDocument serializes nested dates for API output", () => {
  const serialized = serializeDocument({
    createdAtUtc: new Date("2026-05-20T10:00:00.000Z"),
    latestMeasurements: [
      {
        timestampUtc: new Date("2026-05-20T10:01:00.000Z"),
      },
    ],
  });

  assert.deepEqual(serialized, {
    createdAtUtc: "2026-05-20T10:00:00.000Z",
    latestMeasurements: [
      {
        timestampUtc: "2026-05-20T10:01:00.000Z",
      },
    ],
  });
});
