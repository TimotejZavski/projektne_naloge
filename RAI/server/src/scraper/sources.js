const path = require('path');

const sources = [
  {
    id: 'dars-traffic-counters-sample',
    name: 'DARS traffic counters sample',
    type: 'json',
    sourceType: 'fixture',
    category: 'traffic',
    fixturePath: path.join(__dirname, 'fixtures', 'traffic-counters.sample.json'),
  },
];

function getSources() {
  return sources.map((source) => ({ ...source }));
}

module.exports = {
  getSources,
};
