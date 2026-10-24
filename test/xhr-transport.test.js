const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createXhrTransport } = require('../src/pkjs/xhr-transport');

// Minimal XMLHttpRequest double. `script` decides how the "network" answers.
function fakeXhr(script) {
  const instances = [];
  class FakeXhr {
    constructor() {
      this.requestHeaders = {};
      instances.push(this);
    }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.requestHeaders[name] = value; }
    send(body) {
      this.body = body;
      Promise.resolve().then(() => script(this));
    }
    getAllResponseHeaders() { return this.rawHeaders || ''; }
  }
  return { FakeXhr, instances };
}

test('sends method, url, headers and body, then resolves with status, headers and text', async () => {
  const { FakeXhr, instances } = fakeXhr((x) => {
    x.status = 201;
    x.responseText = '{"id":"abc"}';
    x.rawHeaders = 'Content-Type: application/json\r\nRetry-After: 40\r\n';
    x.onload();
  });
  const transport = createXhrTransport(FakeXhr);

  const res = await transport({
    method: 'POST',
    url: 'https://api.nappi.app/v1/x',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: '{"a":1}',
  });

  const x = instances[0];
  assert.equal(x.method, 'POST');
  assert.equal(x.url, 'https://api.nappi.app/v1/x');
  assert.deepEqual(x.requestHeaders, { Authorization: 'Bearer t', 'Content-Type': 'application/json' });
  assert.equal(x.body, '{"a":1}');
  assert.equal(res.status, 201);
  assert.equal(res.body, '{"id":"abc"}');
  assert.deepEqual(res.headers, { 'content-type': 'application/json', 'retry-after': '40' });
});

test('a GET with no body sends null', async () => {
  const { FakeXhr, instances } = fakeXhr((x) => { x.status = 200; x.responseText = '[]'; x.onload(); });
  await createXhrTransport(FakeXhr)({ method: 'GET', url: 'https://api.nappi.app/v1/babies', headers: {} });
  assert.equal(instances[0].body, null);
});

test('rejects when the connection fails', async () => {
  const { FakeXhr } = fakeXhr((x) => x.onerror());
  await assert.rejects(
    createXhrTransport(FakeXhr)({ method: 'GET', url: 'https://x/', headers: {} }),
    /network/i,
  );
});

test('rejects on timeout, and sets a timeout so a dead phone link cannot hang forever', async () => {
  const { FakeXhr, instances } = fakeXhr((x) => x.ontimeout());
  await assert.rejects(
    createXhrTransport(FakeXhr)({ method: 'GET', url: 'https://x/', headers: {} }),
    /timed out/i,
  );
  assert.ok(instances[0].timeout > 0);
});

test('header lines without a colon are ignored', async () => {
  const { FakeXhr } = fakeXhr((x) => {
    x.status = 200; x.responseText = '[]'; x.rawHeaders = 'HTTP/1.1 200 OK\r\nETag: "v1"\r\n'; x.onload();
  });
  const res = await createXhrTransport(FakeXhr)({ method: 'GET', url: 'https://x/', headers: {} });
  assert.deepEqual(res.headers, { etag: '"v1"' });
});
