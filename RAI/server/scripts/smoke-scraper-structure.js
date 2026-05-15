const { ScraperRunner, getSources } = require('../src/scraper');

async function main() {
  const runner = new ScraperRunner();
  const results = await runner.collect(getSources());

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.error('Scraper smoke failed:', failed);
    process.exit(1);
  }

  console.log(`Scraper smoke OK: ${results.length} source(s) collected`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
