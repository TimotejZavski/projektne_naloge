const PlaygroundScraper = require("./PlaygroundScraper");
const { getSources } = require("./sources");

module.exports = {
  PlaygroundScraper,
  scrapePlaygrounds: PlaygroundScraper.scrapePlaygrounds,
  getSources,
};
