// api.js transport backed by XMLHttpRequest, which PebbleKit JS provides.
// The constructor is injectable so tests can pass a fake.

const TIMEOUT_MS = 20000;

function parseHeaders(raw) {
  const headers = {};
  raw.split(/\r?\n/).forEach((line) => {
    const colon = line.indexOf(':');
    if (colon < 1) return;
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  });
  return headers;
}

function createXhrTransport(XHR) {
  const Xhr = XHR || XMLHttpRequest;
  return function transport(req) {
    return new Promise((resolve, reject) => {
      const xhr = new Xhr();
      xhr.open(req.method, req.url);
      Object.keys(req.headers || {}).forEach((name) => xhr.setRequestHeader(name, req.headers[name]));
      xhr.timeout = TIMEOUT_MS;
      xhr.onload = () => resolve({
        status: xhr.status,
        headers: parseHeaders(xhr.getAllResponseHeaders() || ''),
        body: xhr.responseText,
      });
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.ontimeout = () => reject(new Error('Request timed out'));
      xhr.send(req.body === undefined ? null : req.body);
    });
  };
}

module.exports = { createXhrTransport };
