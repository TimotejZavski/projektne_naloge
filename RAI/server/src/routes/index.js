/**
 * Korenski API router. Tu se mountajo vse modulske rute.
 */

const express = require('express');

const router = express.Router();

// Auth rute (SCRUM-13): /api/auth/*
router.use('/auth', require('./auth.routes'));

// Devices rute (SCRUM-20): /api/devices/*
router.use('/devices', require('./devices.routes'));

// Sensor measurements (SCRUM-20): /api/measurements/*
router.use('/measurements', require('./measurements.routes'));

router.get('/_ping', (req, res) => res.json({ ok: true }));

// LEGACY (samo dev): generic CRUD endpointi iz prvotnega index.js.
// Ti endpointi NISO varni za produkcijo (brez auth, brez validacije).
// Po vzpostavljenem auth sistemu jih bomo zamenjali z eksplicitnimi
// resursnimi routerji (devices, playgrounds, ...).
const mongoose = require('mongoose');

router.get('/legacy/:collection', async (req, res, next) => {
  try {
    const docs = await mongoose.connection.db
      .collection(req.params.collection)
      .find({})
      .limit(100)
      .toArray();
    res.json(docs);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
