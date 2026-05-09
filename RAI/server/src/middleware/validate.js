/**
 * Validacijski middleware (Joi).
 *
 * Uporaba:
 *   router.post('/x', validate(schema, 'body'), controller);
 *
 * Privzeto validira `req.body`, lahko pa tudi `query` ali `params`.
 *
 * Lastnosti Joi konfiguracije:
 *   abortEarly: false  -> vrne VSE napake naenkrat (boljse UX)
 *   stripUnknown: true -> tiho odstrani polja, ki niso v shemi
 *                         (defenzivno proti mass-assignment)
 *   convert: true      -> "true"/"false" string -> boolean ipd.
 */

const AppError = require('../utils/AppError');

function validate(schema, source = 'body') {
  return function validateMiddleware(req, res, next) {
    const data = req[source];
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      return next(new AppError('Vnos ni veljaven.', 400, 'VALIDATION_ERROR', details));
    }

    // Z validirano (in cisto) vrednostjo prepisemo originalno -
    // sicer bi shema res odstranila polja, ampak `req.body` bi se vedno
    // imel vse stare. Tukaj jih dejansko odstranimo.
    req[source] = value;
    return next();
  };
}

module.exports = validate;
