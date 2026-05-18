const { ScraperRunner, extractFromRawResult, getSources } = require('../src/scraper');

async function main() {
  const runner = new ScraperRunner();
  const rawResults = await runner.collect(getSources());
  const extracted = rawResults.flatMap(extractFromRawResult);

  if (extracted.length === 0) {
    console.error('No extracted records returned from scraper data');
    process.exit(1);
  }

  console.log(`Scraper extraction OK: ${extracted.length} record(s) extracted`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
