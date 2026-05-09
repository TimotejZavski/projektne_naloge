/**
 * User model.
 *
 * Skladno z `RAI/database/mongodb-collections.json` (kolekcija `users`):
 *   obvezna polja: email, displayName, passwordHash, createdAtUtc
 *   unique index: email
 *
 * Varnostne odlocitve:
 *   - geslo NIKOLI ne pride v bazo v cisti obliki - pre-save hook ga
 *     pretvori v bcrypt hash
 *   - `passwordHash` je `select: false` -> queries ga privzeto NE vrnejo
 *   - `toJSON` override stripa hash + `__v` -> tudi ce ga query nalozi,
 *     ne uhaja v API odgovor
 *   - email se shrani v lowercase (preprecimo "Marko@..." vs "marko@...")
 *   - obstaja `comparePassword` metoda - bcrypt.compare je *constant time*,
 *     kar prepreci timing napade
 *   - obstaja staticna `findByCredentials` - generic napaka ce email NE
 *     obstaja ALI ce je geslo napacno (prepreci enumeration napad)
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email je obvezen.'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [254, 'Email je predolg.'], // RFC 5321 limit
      validate: {
        validator: (v) => EMAIL_REGEX.test(v),
        message: 'Email ni v veljavnem formatu.',
      },
    },
    displayName: {
      type: String,
      required: [true, 'Prikazno ime je obvezno.'],
      trim: true,
      minlength: [2, 'Prikazno ime mora imeti vsaj 2 znaka.'],
      maxlength: [60, 'Prikazno ime je predolgo.'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Geslo je obvezno.'],
      select: false, // privzeto se NE vraca iz query-jev
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    isActive: {
      type: Boolean,
      default: true,
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
    collection: 'users',
    versionKey: false,
    minimize: false,
  }
);

// Updated timestamp pri vsaki spremembi
userSchema.pre('save', function setUpdatedAt(next) {
  if (!this.isNew) this.updatedAtUtc = new Date();
  next();
});

// Pre-save hook: hashiraj geslo, ce je bilo spremenjeno.
// Pomembno: preverimo `isModified('passwordHash')` - sicer bi pri vsaki
// posodobitvi (ne samo gesla) ponovno hashirali (kar bi unicilo geslo).
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('passwordHash')) return next();

  // Defenzivno: ce je nekdo poskusal podati ze hashirano vrednost,
  // jo bo bcrypt vseeno ponovno hashiral - to je v redu, hash hash-a
  // je se vedno veljaven hash, samo malo daljsi.
  // Ce pa je nekdo poklical `setPassword(plain)`, je tukaj plain text.
  try {
    this.passwordHash = await bcrypt.hash(this.passwordHash, env.BCRYPT_SALT_ROUNDS);
    next();
  } catch (err) {
    next(err);
  }
});

/**
 * Nastavi novo geslo. Hashiranje se zgodi v pre-save hooku.
 */
userSchema.methods.setPassword = function setPassword(plainPassword) {
  if (typeof plainPassword !== 'string' || plainPassword.length === 0) {
    throw new Error('Geslo mora biti nepraznen niz.');
  }
  this.passwordHash = plainPassword; // hook bo hashiral pred save
};

/**
 * Primerja vneseno geslo s hashom v bazi.
 * bcrypt.compare je constant-time -> brez timing napadov.
 *
 * @param {string} plainPassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function comparePassword(plainPassword) {
  if (typeof plainPassword !== 'string') return false;
  if (!this.passwordHash) {
    // Defenzivno: ce hash ni bil naložen (npr. brez `.select('+passwordHash')`),
    // raje vrnemo false kot da vrnemo true.
    return false;
  }
  return bcrypt.compare(plainPassword, this.passwordHash);
};

/**
 * Najdi uporabnika po prijavnih podatkih.
 *
 * Vrne `null` v vseh primerih napake (ne razlikuje med "ni uporabnika"
 * in "napacno geslo") - prepreci user enumeration.
 *
 * Klicatelj naj NE razkriva razlike v API odgovoru.
 *
 * @param {string} email
 * @param {string} plainPassword
 * @returns {Promise<UserDoc | null>}
 */
userSchema.statics.findByCredentials = async function findByCredentials(email, plainPassword) {
  if (typeof email !== 'string' || typeof plainPassword !== 'string') return null;

  const user = await this.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
  if (!user) {
    // Vseeno opravimo bcrypt.compare s "fake" hashom, da je odzivni cas
    // enak v obeh primerih (timing-attack mitigacija).
    await bcrypt.compare(plainPassword, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    return null;
  }
  if (!user.isActive) return null;

  const ok = await user.comparePassword(plainPassword);
  return ok ? user : null;
};

/**
 * Stripaj obcutljiva polja iz JSON odgovorov.
 */
userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

userSchema.set('toObject', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
