/**
 * Joi sheme za auth endpoint-e.
 *
 * Politika gesel (varnost):
 *   - min 8 znakov, max 128 znakov (preprecimo bcrypt 72-byte ceiling
 *     in DoS z velikanskim geslom)
 *   - vsaj eno malo, eno veliko, ena stevilka
 *   - posebne znake priporocamo a ne zahtevamo (UX kompromis)
 *
 * Email: standard RFC, max 254 znakov.
 * displayName: 2-60 znakov, brez vodilnih/zaledjnih presledkov.
 */

const Joi = require('joi');

const passwordSchema = Joi.string()
  .min(8)
  .max(128)
  .pattern(/[a-z]/, { name: 'lowercase' })
  .pattern(/[A-Z]/, { name: 'uppercase' })
  .pattern(/[0-9]/, { name: 'digit' })
  .required()
  .messages({
    'string.min': 'Geslo mora imeti vsaj 8 znakov.',
    'string.max': 'Geslo je predolgo (max 128 znakov).',
    'string.pattern.name': 'Geslo mora vsebovati malo crko, veliko crko in stevilko.',
    'any.required': 'Geslo je obvezno.',
  });

const emailSchema = Joi.string()
  .email({ minDomainSegments: 2, tlds: false })
  .lowercase()
  .trim()
  .max(254)
  .required()
  .messages({
    'string.email': 'Email ni v veljavnem formatu.',
    'string.max': 'Email je predolg.',
    'any.required': 'Email je obvezen.',
  });

const registerSchema = Joi.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: Joi.string().trim().min(2).max(60).required().messages({
    'string.min': 'Prikazno ime mora imeti vsaj 2 znaka.',
    'string.max': 'Prikazno ime je predolgo (max 60 znakov).',
    'any.required': 'Prikazno ime je obvezno.',
  }),
});

const loginSchema = Joi.object({
  email: emailSchema,
  // Pri loginu ne forsiramo password policy (moc ze imamo iz registracije).
  // Pomembno: vseeno required + max length za zascito.
  password: Joi.string().min(1).max(128).required().messages({
    'string.max': 'Geslo je predolgo.',
    'any.required': 'Geslo je obvezno.',
  }),
});

module.exports = { registerSchema, loginSchema };
