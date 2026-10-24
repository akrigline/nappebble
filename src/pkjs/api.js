// nappi API client. See docs/nappi-api.md.
//
// `transport(req) -> Promise<{ status, headers, body }>` does the actual HTTP
// (XHR on the phone, the mock in tests). `body` is the raw response text.

class ApiError extends Error {
  constructor(code, message, status, retryAfter) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter === undefined ? null : retryAfter;
  }
}

function header(headers, name) {
  const wanted = name.toLowerCase();
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase() === wanted) return headers[key];
  }
  return undefined;
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false };
  }
}

function createClient(options) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const token = options.token;
  const transport = options.transport;

  function request(method, path) {
    if (!token) {
      return Promise.reject(new ApiError('no_token', 'No API token configured', 0));
    }
    const req = {
      method,
      url: baseUrl + path,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    };
    return transport(req).then(
      (res) => parseResponse(res),
      (err) => { throw new ApiError('network', (err && err.message) || 'Network error', 0); }
    );
  }

  function parseResponse(res) {
    const parsed = parseJson(res.body);
    if (res.status >= 200 && res.status < 300) {
      if (!parsed.ok) throw new ApiError('bad_response', 'Response was not valid JSON', res.status);
      return parsed.value;
    }
    const seconds = Number(header(res.headers, 'retry-after'));
    const retryAfter = Number.isFinite(seconds) ? seconds : undefined;
    const detail = parsed.ok && parsed.value && parsed.value.error;
    if (!detail || typeof detail.code !== 'string') {
      throw new ApiError('bad_response', 'HTTP ' + res.status, res.status, retryAfter);
    }
    throw new ApiError(detail.code, detail.message, res.status, retryAfter);
  }

  return {
    listBabies() {
      return request('GET', '/v1/babies');
    },
  };
}

module.exports = { createClient, ApiError };
