function parseBody(body) {
  if (typeof body === 'string') {
    return JSON.parse(body);
  }

  if (body && typeof body === 'object') {
    return body;
  }

  throw new Error('Traffic counter payload must be JSON string or object');
}

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function extractTrafficCounters(rawResult) {
  const payload = parseBody(rawResult.body);
  const counters = Array.isArray(payload.counters) ? payload.counters : [];

  return counters
    .map((counter) => {
      const latitude = toNumber(counter.latitude);
      const longitude = toNumber(counter.longitude);
      const vehicleCount = toNumber(counter.vehicleCount);
      const averageSpeedKmh = toNumber(counter.averageSpeedKmh);

      if (!counter.stationId || latitude === null || longitude === null || vehicleCount === null) {
        return null;
      }

      return {
        sourceId: rawResult.sourceId,
        stationId: String(counter.stationId),
        stationName: counter.stationName ? String(counter.stationName) : String(counter.stationId),
        location: {
          latitude,
          longitude,
        },
        metrics: {
          vehicleCount,
          averageSpeedKmh,
        },
        measuredAt: counter.measuredAt || payload.updatedAt || rawResult.fetchedAt,
        extractedAt: new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

module.exports = {
  extractTrafficCounters,
};
