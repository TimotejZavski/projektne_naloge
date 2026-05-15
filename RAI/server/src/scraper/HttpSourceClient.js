const fs = require('fs/promises');

class HttpSourceClient {
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs || 10000;
  }

  async fetch(source) {
    if (!source || typeof source !== 'object') {
      throw new Error('Scraper source config is required');
    }

    if (source.sourceType === 'fixture') {
      return this.readFixture(source);
    }

    if (!source.url) {
      throw new Error(`Source ${source.id} is missing url`);
    }

    return this.fetchRemote(source);
  }

  async readFixture(source) {
    const body = await fs.readFile(source.fixturePath, 'utf8');
    return {
      sourceId: source.id,
      status: 200,
      fetchedAt: new Date().toISOString(),
      contentType: 'application/json',
      body,
    };
  }

  async fetchRemote(source) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(source.url, {
        headers: source.headers || {},
        signal: controller.signal,
      });
      const body = await response.text();

      return {
        sourceId: source.id,
        status: response.status,
        fetchedAt: new Date().toISOString(),
        contentType: response.headers.get('content-type') || null,
        body,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = HttpSourceClient;
