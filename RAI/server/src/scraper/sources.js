/**
 * Viri za scraper — trenutno samo maribor.si javna igrišča.
 */

const sources = [
  {
    id: "maribor-si-igrisca",
    name: "Javna igrišča — Mestna občina Maribor",
    url: "https://maribor.si/mestni-servis/otroci/javna-igrisca/",
    type: "html",
    category: "playground",
  },
];

function getSources() {
  return sources.map((source) => ({ ...source }));
}

module.exports = { getSources };
