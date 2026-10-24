// In-memory stand-in for api.nappi.app, built from docs/nappi-api.md
// (itself from https://api.nappi.app/v1/openapi.json).
//
// handle({ method, url, headers, body }) -> { status, headers, body }
// `body` on the way out is a JSON string, as on the wire.
//
// Codes the docs name: unauthorized, token_expired, premium_required,
// timer_not_running. Codes the docs do NOT name (invented here, so clients
// must never branch on them): rate_limited, not_found.

const READ_LIMIT = 12;
const WRITE_LIMIT = 30;
const WINDOW_MS = 60 * 1000;

function createMockNappi(options) {
  const now = (options && options.now) || Date.now;
  const tokens = new Map();
  const babies = [];
  const hits = new Map(); // `${token}:${kind}` -> request timestamps in the window

  function respond(status, payload, headers) {
    return {
      status,
      headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, headers),
      body: payload === undefined ? '' : JSON.stringify(payload),
    };
  }

  function fail(status, code, message, headers) {
    return respond(status, { error: { code, message } }, headers);
  }

  function bearer(headers) {
    for (const name of Object.keys(headers || {})) {
      if (name.toLowerCase() === 'authorization') {
        const m = /^Bearer (.+)$/.exec(headers[name]);
        return m ? m[1] : null;
      }
    }
    return null;
  }

  // Returns null when the request may proceed, else the 429 response.
  function rateLimit(token, kind) {
    const key = token + ':' + kind;
    const limit = kind === 'read' ? READ_LIMIT : WRITE_LIMIT;
    const t = now();
    const recent = (hits.get(key) || []).filter((at) => t - at < WINDOW_MS);
    if (recent.length >= limit) {
      hits.set(key, recent);
      const retryAfter = Math.ceil((recent[0] + WINDOW_MS - t) / 1000);
      return fail(429, 'rate_limited', 'Too many requests', { 'retry-after': String(retryAfter) });
    }
    recent.push(t);
    hits.set(key, recent);
    return null;
  }

  const routes = [
    { method: 'GET', pattern: /^\/v1\/babies$/, kind: 'read', run: () => respond(200, babies) },
  ];

  function handle(req) {
    const url = new URL(req.url);
    const token = bearer(req.headers);
    const account = token && tokens.get(token);
    if (!account || account.revoked) {
      return fail(401, 'unauthorized', 'Missing, invalid or revoked token');
    }
    if (account.expired) {
      return fail(401, 'token_expired', 'This token has expired');
    }
    if (!account.premium) {
      return fail(403, 'premium_required', 'The nappi API requires nappi Premium');
    }

    const route = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
    if (!route) return fail(404, 'not_found', 'No such route');

    const limited = rateLimit(token, route.kind);
    if (limited) return limited;
    return route.run(req, url);
  }

  return {
    handle,
    addToken(token, flags) {
      tokens.set(token, Object.assign({ premium: true, revoked: false, expired: false }, flags));
    },
    addBaby(baby) {
      babies.push({
        id: baby.id,
        name: baby.name,
        birth_date: baby.birth_date === undefined ? null : baby.birth_date,
        timezone: baby.timezone === undefined ? null : baby.timezone,
      });
    },
  };
}

module.exports = { createMockNappi, READ_LIMIT, WRITE_LIMIT, WINDOW_MS };
