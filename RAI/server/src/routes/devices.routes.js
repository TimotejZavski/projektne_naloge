/**
 * Devices router - mountan na `/api/devices`.
 *
 * Vse poti zahtevajo prijavo (`requireAuth`).
 */

const express = require('express');

const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const {
  registerDeviceSchema,
  updateDeviceSchema,
  listDevicesQuerySchema,
  deviceIdParamSchema,
} = require('../validators/device.validator');
const {
  listMeasurementsQuerySchema,
} = require('../validators/measurement.validator');
const ctrl = require('../controllers/devices.controller');
const measurementsCtrl = require('../controllers/measurements.controller');

const router = express.Router();

router.use(requireAuth);

router.post('/', validate(registerDeviceSchema), ctrl.create);
router.get('/', validate(listDevicesQuerySchema, 'query'), ctrl.list);
router.get('/:id', validate(deviceIdParamSchema, 'params'), ctrl.getById);
router.patch('/:id',
  validate(deviceIdParamSchema, 'params'),
  validate(updateDeviceSchema),
  ctrl.update
);
router.delete('/:id', validate(deviceIdParamSchema, 'params'), ctrl.remove);

// Convenience: meritve za napravo (po Device ObjectId v poti)
router.get('/:id/measurements',
  validate(deviceIdParamSchema, 'params'),
  validate(listMeasurementsQuerySchema, 'query'),
  measurementsCtrl.listForDevice
);

module.exports = router;
