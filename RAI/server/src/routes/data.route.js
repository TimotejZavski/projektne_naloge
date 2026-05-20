const express = require("express");

const {
  getById,
  getDeviceWithMeasurements,
  listAnalytics,
  listCollection,
  listNearbyPlaygrounds,
  listPlaygrounds,
  listReservations,
  listSensorMeasurements,
  listWeatherLogs,
} = require("../query/databaseQueries");
const { sendItem, sendList } = require("../pipeline/apiResponse");

const router = express.Router();

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

router.get(
  "/api/sensor-measurements",
  asyncHandler(async (req, res) => {
    const result = await listSensorMeasurements(req.query);
    sendList(res, result.items, result.meta);
  })
);

router.get(
  "/api/playgrounds/nearby",
  asyncHandler(async (req, res) => {
    const result = await listNearbyPlaygrounds(req.query);
    sendList(res, result.items, result.meta);
  })
);

router.get(
  "/api/playgrounds",
  asyncHandler(async (req, res) => {
    const result = await listPlaygrounds(req.query);
    sendList(res, result.items, result.meta);
  })
);

router.get(
  "/api/devices/:deviceId",
  asyncHandler(async (req, res) => {
    const device = await getDeviceWithMeasurements(req.params.deviceId, req.query);
    sendItem(res, device);
  })
);

router.get(
  "/api/reservations",
  asyncHandler(async (req, res) => {
    const result = await listReservations(req.query);
    sendList(res, result.items, result.meta);
  })
);

router.get(
  "/api/weather-logs",
  asyncHandler(async (req, res) => {
    const result = await listWeatherLogs(req.query);
    sendList(res, result.items, result.meta);
  })
);

router.get(
  "/api/analytics",
  asyncHandler(async (req, res) => {
    const result = await listAnalytics(req.query);
    sendList(res, result.items, result.meta);
  })
);

router.get(
  "/api/:collection/:id",
  asyncHandler(async (req, res) => {
    const item = await getById(req.params.collection, req.params.id);
    sendItem(res, item);
  })
);

router.get(
  "/api/:collection",
  asyncHandler(async (req, res) => {
    const result = await listCollection(req.params.collection, req.query);
    sendList(res, result.items, result.meta);
  })
);

module.exports = router;
