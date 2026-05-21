const ScraperRunner = require('./ScraperRunner');
const HttpSourceClient = require('./HttpSourceClient');
const { getSources } = require('./sources');
const { extractFromRawResult, extractTrafficCounters } = require('./extractors');
const ScraperIngestionService = require('./ingestion/ScraperIngestionService');
const {
  ScraperOutputApiClient,
  ScraperOutputApiError,
} = require('./output/ScraperOutputApiClient');

module.exports = {
  ScraperRunner,
  HttpSourceClient,
  extractFromRawResult,
  extractTrafficCounters,
  getSources,
  ScraperIngestionService,
  ScraperOutputApiClient,
  ScraperOutputApiError,
};
