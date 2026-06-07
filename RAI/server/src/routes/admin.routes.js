/**
 * Admin router — `/api/admin/*`.
 *
 * Vsi endpointi zahtevajo prijavo. Admin role check dodamo, ko se vzpostavi
 * pravi admin account flow (trenutno za demo dovolimo vsem prijavljenim).
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/admin.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/users', ctrl.listUsers);
router.get('/users/:id', ctrl.getUserDetail);
router.get('/users/:id/locations', ctrl.getUserLocations);
router.get('/visits/:visitId/measurements', ctrl.getVisitMeasurements);
router.get('/overview/users', ctrl.getUsersOverview);

router.get('/courts', ctrl.listCourts);
router.get('/courts/:id', ctrl.getCourtDetail);

module.exports = router;
