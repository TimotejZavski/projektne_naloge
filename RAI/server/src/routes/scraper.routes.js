/**
 * Scraper router (SCRUM-33) - mountan na `/api/scraper`.
 *
 * Avtentikacija je zahtevana za vse poti (requireAuth).
 * `POST /run` v produkciji omeji controller na admin role-o.
 */

const express = require('express');

const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const {
  runScraperSchema,
  listTrafficMeasurementsQuerySchema,
} = require('../validators/scraper.validator');
const ctrl = require('../controllers/scraper.controller');

const router = express.Router();

router.use(requireAuth);

router.post('/run', validate(runScraperSchema), ctrl.runPipeline);
router.get(
  '/measurements',
  validate(listTrafficMeasurementsQuerySchema, 'query'),
  ctrl.listMeasurements
);
router.get('/stations', ctrl.listStations);

module.exports = router;
