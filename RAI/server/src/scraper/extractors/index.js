const { extractTrafficCounters } = require('./trafficCounterExtractor');

function extractFromRawResult(rawResult) {
  if (!rawResult || !rawResult.ok) {
    return [];
  }

  if (rawResult.category === 'traffic') {
    return extractTrafficCounters(rawResult);
  }

  return [];
}

module.exports = {
  extractFromRawResult,
  extractTrafficCounters,
};
