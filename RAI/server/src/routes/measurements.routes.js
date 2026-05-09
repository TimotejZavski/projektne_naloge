/**
 * SensorMeasurements router - mountan na `/api/measurements`.
 *
 * Vse poti zahtevajo prijavo. Ingestion preverja lastnistvo naprav.
 */

const express = require('express');

const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const {
  singleMeasurementSchema,
  batchMeasurementsSchema,
} = require('../validators/measurement.validator');
const ctrl = require('../controllers/measurements.controller');

const router = express.Router();

router.use(requireAuth);

router.post('/', validate(singleMeasurementSchema), ctrl.ingestSingle);
router.post('/batch', validate(batchMeasurementsSchema), ctrl.ingestBatch);

// GET endpoint pride v commitu 4.

module.exports = router;
