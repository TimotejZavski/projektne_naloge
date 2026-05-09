/**
 * Auth router - mountan na `/api/auth`.
 */

const express = require('express');

const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');
const { registerSchema, loginSchema } = require('../validators/auth.validator');
const ctrl = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', registerLimiter, validate(registerSchema), ctrl.register);
router.post('/login', loginLimiter, validate(loginSchema), ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);

router.get('/me', requireAuth, ctrl.me);
router.post('/logout-all', requireAuth, ctrl.logoutAll);

module.exports = router;
