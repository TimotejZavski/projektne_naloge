/**
 * Playground model — javna otroška igrišča v Mariboru.
 *
 * Podatki se scrape-ajo iz https://maribor.si/mestni-servis/otroci/javna-igrisca/
 * in geokodirajo prek Nominatim (OpenStreetMap).
 *
 * Unique index: `sourceId + name` — ista stran ne sme producirat duplikatov.
 */

const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false }
);

const playgroundSchema = new mongoose.Schema(
  {
    sourceId: {
      type: String,
      required: true,
      trim: true,
      default: 'maribor-si-igrisca',
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: locationSchema,
      required: true,
    },
    sourceUrl: {
      type: String,
      trim: true,
    },
    scrapedAt: {
      type: Date,
      default: () => new Date(),
    },
    schemaVersion: {
      type: String,
      default: '1.0',
    },
  },
  {
    collection: 'playgrounds',
    versionKey: false,
  }
);

// Ista stran + isto ime = eno igrišče
playgroundSchema.index(
  { sourceId: 1, name: 1 },
  { unique: true, name: 'uniq_source_name' }
);

// Za geospacial query-je ko bomo rabli "bliznja igrisca"
playgroundSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });

playgroundSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Playground', playgroundSchema);
