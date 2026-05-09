/**
 * Session model - hrani aktivne refresh token-e v bazi.
 *
 * Zakaj DB session za stateless JWT?
 *   - logout MORA biti efektiven: ce refresh token ostane veljaven po
 *     logoutu, je to varnostna luknja. Z DB sessions lahko refresh token
 *     dejansko *invalidiramo* (revokeS).
 *   - rotation: ob vsakem refreshu nov refresh token + invalidacija
 *     starega -> ce napadalec ukrade nekoc uporabljen token, ga sistem
 *     zazna kot reuse in razveljavi celotno verigo.
 *
 * Hramba: shranimo zgolj **hash** refresh tokena (sha256). Ce nekdo
 * ukrade DB, ne dobi uporabnih tokenov.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Hash refresh token-a (sha256). Cisti token NIKOLI ne pride v bazo.
    refreshTokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    // Telemetrija - koristno za "moje seje" UI in revizijo.
    userAgent: { type: String, maxlength: 500 },
    ipAddress: { type: String, maxlength: 64 },

    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    // Ce je seja revokana, je tu pojasnilo: "logout", "rotation", "reuse-detected".
    revokedReason: {
      type: String,
      default: null,
    },
    // Ko obnavljamo (rotation), si zapomnimo hash novega tokena za detection
    // ponovne uporabe starega.
    replacedByHash: {
      type: String,
      default: null,
    },

    createdAtUtc: {
      type: Date,
      default: () => new Date(),
      immutable: true,
    },
  },
  {
    collection: 'sessions',
    versionKey: false,
  }
);

// TTL index: MongoDB samodejno brise potekle dokumente.
// 0 sekund = takoj ob `expiresAt`.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Najdi sejo po surovem refresh tokenu (interno hashira in poisce).
 */
sessionSchema.statics.findByRefreshToken = function findByRefreshToken(rawToken) {
  if (typeof rawToken !== 'string' || !rawToken) return null;
  return this.findOne({ refreshTokenHash: sha256(rawToken) });
};

/**
 * Ustvari novo sejo za podan refresh token.
 */
sessionSchema.statics.createForToken = function createForToken({
  userId,
  rawToken,
  expiresAt,
  userAgent,
  ipAddress,
}) {
  return this.create({
    userId,
    refreshTokenHash: sha256(rawToken),
    expiresAt,
    userAgent,
    ipAddress,
  });
};

/**
 * Revokaj sejo z razlogom.
 */
sessionSchema.methods.revoke = function revoke(reason = 'manual', replacedByRawToken = null) {
  this.revokedAt = new Date();
  this.revokedReason = reason;
  if (replacedByRawToken) {
    this.replacedByHash = sha256(replacedByRawToken);
  }
  return this.save();
};

/**
 * Vrne true, ce seja se vedno aktivna (ne revokana, ne potekla).
 */
sessionSchema.methods.isActive = function isActive() {
  if (this.revokedAt) return false;
  if (this.expiresAt && this.expiresAt.getTime() < Date.now()) return false;
  return true;
};

// Statika izpostavljena za teste in jwt utility
sessionSchema.statics.hashToken = sha256;

module.exports = mongoose.model('Session', sessionSchema);
