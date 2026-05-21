class ScraperOutputApiError extends Error {
  constructor({ status, code, message, details, responseBody }) {
    super(message || `Scraper output API failed with HTTP ${status}`);
    this.name = 'ScraperOutputApiError';
    this.status = status;
    this.code = code || null;
    this.details = details || null;
    this.responseBody = responseBody || null;
  }
}

function normalizeBaseUrl(apiBaseUrl) {
  if (!apiBaseUrl || typeof apiBaseUrl !== 'string') {
    throw new TypeError('apiBaseUrl je obvezen.');
  }
  return apiBaseUrl.replace(/\/+$/, '');
}

async function parseResponseBody(response) {
  const contentType =
    response && response.headers && typeof response.headers.get === 'function'
      ? response.headers.get('content-type') || ''
      : '';

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text ? { error: { message: text } } : null;
  } catch {
    return null;
  }
}

class ScraperOutputApiClient {
  constructor(options = {}) {
    this.apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl);
    this.accessToken = options.accessToken || null;
    this.fetchImpl = options.fetchImpl || global.fetch;

    if (typeof this.fetchImpl !== 'function') {
      throw new TypeError('fetch implementation is not available.');
    }
  }

  async send(records, options = {}) {
    if (!Array.isArray(records) || records.length === 0) {
      throw new TypeError('records mora biti neprazen array.');
    }

    const target = `${this.apiBaseUrl}/api/scraper/output`;
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    const accessToken = options.accessToken || this.accessToken;
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    let response;
    try {
      response = await this.fetchImpl(target, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          records,
          metadata: options.metadata,
        }),
        signal: options.signal,
      });
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      throw new ScraperOutputApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'Scraper output API ni dosegljiv.',
        details: { cause: error && error.message },
      });
    }

    const body = await parseResponseBody(response);

    if (!response.ok) {
      const errorBody = (body && body.error) || {};
      throw new ScraperOutputApiError({
        status: response.status,
        code: errorBody.code,
        message: errorBody.message,
        details: errorBody.details,
        responseBody: body,
      });
    }

    return body;
  }
}

module.exports = {
  ScraperOutputApiClient,
  ScraperOutputApiError,
};
