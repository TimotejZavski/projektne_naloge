const HttpSourceClient = require('./HttpSourceClient');

class ScraperRunner {
  constructor(options = {}) {
    this.client = options.client || new HttpSourceClient(options.clientOptions);
  }

  async collect(sources) {
    if (!Array.isArray(sources) || sources.length === 0) {
      return [];
    }

    const results = [];

    for (const source of sources) {
      try {
        const raw = await this.client.fetch(source);
        results.push({
          sourceId: source.id,
          name: source.name,
          category: source.category,
          ok: raw.status >= 200 && raw.status < 300,
          fetchedAt: raw.fetchedAt,
          status: raw.status,
          contentType: raw.contentType,
          body: raw.body,
        });
      } catch (error) {
        results.push({
          sourceId: source.id,
          name: source.name,
          category: source.category,
          ok: false,
          fetchedAt: new Date().toISOString(),
          status: null,
          contentType: null,
          body: null,
          error: error.message,
        });
      }
    }

    return results;
  }
}

module.exports = ScraperRunner;
