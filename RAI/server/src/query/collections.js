const READABLE_COLLECTIONS = new Set([
  'analytics',
  'devices',
  'playgrounds',
  'reservations',
  'sensor_measurements',
  'users',
  'weather_logs',
]);

function assertReadableCollection(collectionName) {
  if (!READABLE_COLLECTIONS.has(collectionName)) {
    const error = new Error(`Collection '${collectionName}' is not exposed`);
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }
}

module.exports = {
  READABLE_COLLECTIONS,
  assertReadableCollection,
};
