/**
 * Joi sheme za device endpoint-e.
 *
 * deviceId: 3-64 znakov, samo `a-zA-Z0-9._-`
 *           (sklad z DEVICE_ID_REGEX v Device modelu)
 *           - prepovedani so MQTT wildcards (+, #) in slash, ker bi
 *             pokvarili topic strukturo iz `SA/mqtt/topics.md`.
 * platform: enum (android, ios, ...)
 * name:     poljuben string do 80 znakov
 *
 * Pri create-u je deviceId obvezen, pri update-u ni mogoce spremeniti
 * (immutable identifier).
 */

const Joi = require('joi');

const PLATFORMS = ['android', 'ios', 'windows', 'macos', 'linux', 'web', 'other'];
const DEVICE_ID_PATTERN = /^[a-zA-Z0-9._-]{3,64}$/;

const registerDeviceSchema = Joi.object({
  deviceId: Joi.string().pattern(DEVICE_ID_PATTERN).required().messages({
    'string.pattern.base':
      'deviceId mora biti 3-64 znakov, samo a-z, A-Z, 0-9, ._-',
    'any.required': 'deviceId je obvezen.',
  }),
  name: Joi.string().trim().max(80).allow('').default(''),
  platform: Joi.string().lowercase().valid(...PLATFORMS).default('other'),
  appVersion: Joi.string().trim().max(40).allow('').default(''),
});

const updateDeviceSchema = Joi.object({
  name: Joi.string().trim().max(80).allow(''),
  platform: Joi.string().lowercase().valid(...PLATFORMS),
  appVersion: Joi.string().trim().max(40).allow(''),
  isActive: Joi.boolean(),
})
  .min(1) // vsaj eno polje za update (sicer je klic brez smisla)
  .messages({
    'object.min': 'Posredovati morate vsaj eno polje za posodobitev.',
  });

// Query za GET /api/devices (filtri + paginacija)
const listDevicesQuerySchema = Joi.object({
  isActive: Joi.boolean(),
  platform: Joi.string().lowercase().valid(...PLATFORMS),
  limit: Joi.number().integer().min(1).max(200).default(50),
  cursor: Joi.string().hex().length(24), // ObjectId cursor (last id from prev page)
});

// Path param: device ObjectId
const deviceIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'id mora biti veljaven ObjectId.',
    'string.length': 'id mora biti 24 znakov dolg ObjectId.',
  }),
});

// Path param: user-facing deviceId (SCRUM-29).
// Loci se od `id` (ObjectId) — `deviceId` je string, ki ga oddaja mobilna
// aplikacija (npr. 'pixel-8-azur'). Uporabljen v `GET /api/devices/by-device-id/:deviceId`.
const deviceIdLookupParamSchema = Joi.object({
  deviceId: Joi.string().pattern(DEVICE_ID_PATTERN).required().messages({
    'string.pattern.base':
      'deviceId mora biti 3-64 znakov, samo a-z, A-Z, 0-9, ._-',
    'any.required': 'deviceId je obvezen.',
  }),
});

module.exports = {
  registerDeviceSchema,
  updateDeviceSchema,
  listDevicesQuerySchema,
  deviceIdParamSchema,
  deviceIdLookupParamSchema,
};
