const mongoose = require('mongoose');
const { assertReadableCollection } = require('./collections');
const { buildDateRange, buildPagination, buildSort } = require('./queryParams');

function db() {
  if (!mongoose.connection.db) {
    const error = new Error('Database connection is not ready');
    error.statusCode = 503;
    error.code = 'SERVICE_UNAVAILABLE';
    throw error;
  }

  return mongoose.connection.db;
}

function objectIdFrom(value, fieldName = 'id') {
  const { ObjectId } = mongoose.Types;

  if (!ObjectId.isValid(value)) {
    const error = new Error(`${fieldName} must be a valid MongoDB ObjectId`);
    error.statusCode = 400;
    error.code = 'BAD_REQUEST';
    throw error;
  }

  return new ObjectId(value);
}

async function findMany(collectionName, filter, options) {
  assertReadableCollection(collectionName);

  const pagination = options.pagination || buildPagination({});
  const sort = options.sort || {};
  const projection = options.projection || {};

  const collection = db().collection(collectionName);
  const [items, total] = await Promise.all([
    collection
      .find(filter, { projection })
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    items,
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
    },
  };
}

function userProjection() {
  return {
    passwordHash: 0,
  };
}

async function listCollection(collectionName, query) {
  const pagination = buildPagination(query);

  return findMany(
    collectionName,
    {},
    {
      pagination,
      sort: { _id: -1 },
      projection: collectionName === 'users' ? userProjection() : {},
    }
  );
}

async function listSensorMeasurements(query) {
  const pagination = buildPagination(query);
  const timestampRange = buildDateRange(query);
  const filter = {
    ...(query.deviceId ? { deviceId: query.deviceId } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.sensorType ? { sensorType: query.sensorType } : {}),
    ...(timestampRange ? { timestampUtc: timestampRange } : {}),
  };

  return findMany('sensor_measurements', filter, {
    pagination,
    sort: buildSort(query, ['timestampUtc', 'sensorType', 'deviceId'], {
      field: 'timestampUtc',
      direction: -1,
    }),
  });
}

async function listPlaygrounds(query) {
  const pagination = buildPagination(query);
  const filter = {
    ...(query.isPublic ? { isPublic: query.isPublic === 'true' } : {}),
    ...(query.sport ? { sports: query.sport } : {}),
    ...(query.q ? { name: { $regex: query.q, $options: 'i' } } : {}),
  };

  return findMany('playgrounds', filter, {
    pagination,
    sort: buildSort(query, ['name', 'createdAtUtc'], {
      field: 'name',
      direction: 1,
    }),
  });
}

async function listNearbyPlaygrounds(query) {
  const longitude = Number.parseFloat(query.lng);
  const latitude = Number.parseFloat(query.lat);
  const radiusMeters = Number.parseInt(query.radiusMeters || '1000', 10);

  if (
    Number.isNaN(longitude) ||
    Number.isNaN(latitude) ||
    Number.isNaN(radiusMeters)
  ) {
    const error = new Error('lat, lng and radiusMeters must be valid numbers');
    error.statusCode = 400;
    error.code = 'BAD_REQUEST';
    throw error;
  }

  const pagination = buildPagination(query);
  const items = await db()
    .collection('playgrounds')
    .aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          distanceField: 'distanceMeters',
          maxDistance: radiusMeters,
          spherical: true,
          query: {
            ...(query.sport ? { sports: query.sport } : {}),
            ...(query.isPublic ? { isPublic: query.isPublic === 'true' } : {}),
          },
        },
      },
      { $skip: pagination.skip },
      { $limit: pagination.limit },
    ])
    .toArray();

  return {
    items,
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total: items.length,
      radiusMeters,
    },
  };
}

async function getDeviceWithMeasurements(deviceId, query) {
  const limit = buildPagination({ limit: query.limit || 25 }).limit;
  const [device] = await db()
    .collection('devices')
    .aggregate([
      { $match: { deviceId } },
      {
        $lookup: {
          from: 'sensor_measurements',
          let: { deviceId: '$deviceId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$deviceId', '$$deviceId'] } } },
            { $sort: { timestampUtc: -1 } },
            { $limit: limit },
          ],
          as: 'latestMeasurements',
        },
      },
    ])
    .toArray();

  return device || null;
}

async function listReservations(query) {
  const pagination = buildPagination(query);
  const startsRange = buildDateRange(query);
  const filter = {
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.playgroundId ? { playgroundId: query.playgroundId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(startsRange ? { startsAtUtc: startsRange } : {}),
  };

  return findMany('reservations', filter, {
    pagination,
    sort: buildSort(query, ['startsAtUtc', 'status'], {
      field: 'startsAtUtc',
      direction: 1,
    }),
  });
}

async function listWeatherLogs(query) {
  const pagination = buildPagination(query);
  const fetchedRange = buildDateRange(query);
  const filter = {
    ...(query.sourceName ? { sourceName: query.sourceName } : {}),
    ...(fetchedRange ? { fetchedAtUtc: fetchedRange } : {}),
  };

  return findMany('weather_logs', filter, {
    pagination,
    sort: buildSort(query, ['fetchedAtUtc', 'sourceName'], {
      field: 'fetchedAtUtc',
      direction: -1,
    }),
  });
}

async function listAnalytics(query) {
  const pagination = buildPagination(query);
  const periodRange = buildDateRange(query);
  const filter = {
    ...(query.type ? { type: query.type } : {}),
    ...(query.playgroundId ? { playgroundId: query.playgroundId } : {}),
    ...(periodRange ? { periodStartUtc: periodRange } : {}),
  };

  return findMany('analytics', filter, {
    pagination,
    sort: buildSort(query, ['periodStartUtc', 'type'], {
      field: 'periodStartUtc',
      direction: -1,
    }),
  });
}

async function getById(collectionName, id) {
  assertReadableCollection(collectionName);

  return db()
    .collection(collectionName)
    .findOne(
      { _id: objectIdFrom(id) },
      { projection: collectionName === 'users' ? userProjection() : {} }
    );
}

module.exports = {
  getById,
  getDeviceWithMeasurements,
  listAnalytics,
  listCollection,
  listNearbyPlaygrounds,
  listPlaygrounds,
  listReservations,
  listSensorMeasurements,
  listWeatherLogs,
};
