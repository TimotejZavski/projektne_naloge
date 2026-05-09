/**
 * Device model.
 *
 * Skladno z `RAI/database/mongodb-collections.json` (kolekcija `devices`):
 *   obvezna polja: deviceId, lastSeenAtUtc, isActive
 *   unique index: deviceId
 *   secondary index: userId
 *
 * Naprava je vedno povezana z natanko enim uporabnikom (`userId`).
 * Endpoint-i preverjajo lastnistvo (ownership) -> uporabnik vidi/spreminja
 * SAMO svoje naprave.
 *
 * `deviceId` je nakljucen string, ki ga generira mobilna aplikacija
 * (priporocljivo UUIDv4 ali stable device-specific identifier).
 * Backend ga zgolj sprejema in zagotovi unikatnost na ravni baze.
 */

const mongoose = require('mongoose');

// Dovoljeni znaki za deviceId: alfanumeri, dash, underscore, pika.
// Prepovedani: presledki, slash, sumniki, MQTT wildcards (+ #).
const DEVICE_ID_REGEX = /^[a-zA-Z0-9._-]{3,64}$/;

const PLATFORMS = ['android', 'ios', 'windows', 'macos', 'linux', 'web', 'other'];

const deviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: [true, 'deviceId je obvezen.'],
      unique: true,
      trim: true,
      validate: {
        validator: (v) => DEVICE_ID_REGEX.test(v),
        message: 'deviceId mora biti 3-64 znakov, samo a-z, A-Z, 0-9, ._-',
      },
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId je obvezen.'],
      index: true,
    },
    name: {
      type: String,
      trim: true,
      maxlength: [80, 'name je predolg.'],
      default: '',
    },
    platform: {
      type: String,
      enum: PLATFORMS,
      default: 'other',
      lowercase: true,
    },
    appVersion: {
      type: String,
      trim: true,
      maxlength: [40, 'appVersion je predolg.'],
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSeenAtUtc: {
      type: Date,
      default: () => new Date(),
    },
    createdAtUtc: {
      type: Date,
      default: () => new Date(),
      immutable: true,
    },
    updatedAtUtc: {
      type: Date,
      default: () => new Date(),
    },
  },
  {
    collection: 'devices',
    versionKey: false,
    minimize: false,
  }
);

// Updated-at posodobimo ob save (ne ob immutable createdAtUtc).
deviceSchema.pre('save', function setUpdatedAt(next) {
  if (!this.isNew) this.updatedAtUtc = new Date();
  next();
});

// Helper: posodobi `lastSeenAtUtc` brez polnega save-a (atomic).
// Uporabljeno ob vsakem POST measurements -> vidimo "online" stanje.
deviceSchema.statics.touchLastSeen = function touchLastSeen(deviceId) {
  return this.updateOne(
    { deviceId },
    { $set: { lastSeenAtUtc: new Date(), updatedAtUtc: new Date() } }
  );
};

deviceSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

deviceSchema.statics.PLATFORMS = PLATFORMS;
deviceSchema.statics.DEVICE_ID_REGEX = DEVICE_ID_REGEX;

module.exports = mongoose.model('Device', deviceSchema);
