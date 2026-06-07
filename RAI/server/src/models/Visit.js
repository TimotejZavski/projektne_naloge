/**
 * Visit model — en obisk uporabnika na igriscu.
 *
 * Vir je vedno *izpeljan* iz GPS toka (NPO app -> sensor_measurements ->
 * VisitDeriver). Tudi mock podatki sledijo isti shemi, samo z `source: 'mock'`
 * (oz. v prihodnosti 'mobile' za realne in 'derived' za retroaktivne).
 *
 * Cas: ['startUtc', 'endUtc'] je polodprt interval; durationMin = (end - start) / 60s.
 *
 * Indexi pokrijejo oba kljucna pogleda dashboarda:
 *   - { userId, startUtc desc }    -> "zadnji obiski uporabnika"
 *   - { playgroundId, startUtc }   -> "obiskovalci igrisca, hot times"
 */

const mongoose = require('mongoose');

const SOURCES = ['mock', 'mobile', 'derived'];

const visitSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    playgroundId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Playground',
      required: true,
    },
    startUtc: { type: Date, required: true },
    endUtc: { type: Date, required: true },
    durationMin: { type: Number, required: true, min: 0 },

    // Povprecna SCRUM-49 metrika med obiskom (std. odklon magnitude pospeska).
    // 0 = mirovanje; visje = aktivneje. Opcijska — ce gps obstaja brez accela.
    activityLevel: { type: Number, default: null },

    source: { type: String, enum: SOURCES, default: 'derived' },

    createdAtUtc: { type: Date, default: () => new Date(), immutable: true },
  },
  {
    collection: 'visits',
    versionKey: false,
    minimize: false,
  }
);

visitSchema.index({ userId: 1, startUtc: -1 });
visitSchema.index({ playgroundId: 1, startUtc: -1 });
visitSchema.index({ startUtc: 1 });

visitSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

visitSchema.statics.SOURCES = SOURCES;

module.exports = mongoose.model('Visit', visitSchema);
