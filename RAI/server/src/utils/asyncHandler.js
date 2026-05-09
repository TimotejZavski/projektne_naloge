/**
 * Wrap async controller, da se zavrnjene promise pravilno propagirajo
 * v Express error middleware (sicer Express 4 jih tiho zmotijo).
 *
 * Uporaba:
 *   router.post('/x', asyncHandler(async (req, res) => { ... }));
 */

module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
