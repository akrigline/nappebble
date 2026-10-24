const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMockNappi } = require('./support/mock-nappi');
const { createApp } = require('../src/pkjs/app');
const { createSettings } = require('../src/pkjs/settings');
const { createClient } = require('../src/pkjs/api');
const { STATUS } = require('../src/pkjs/protocol');

const PHOEBE = { id: '6f1c1d52-3b8e-4c43-9a55-0d5d8f6a1a01', name: 'Phoebe', birth_date: '2026-03-02', timezone: 'America/New_York' };
const OSCAR = { id: '0a2b3c4d-1111-4222-8333-444455556666', name: 'Oscar', birth_date: '2024-01-09', timezone: 'America/New_York' };

function harness(opts) {
  const o = Object.assign({ babies: [PHOEBE], tokens: { 'good-token': {} }, stored: {} }, opts);
  const mock = createMockNappi(o.now ? { now: o.now } : undefined);
  Object.keys(o.tokens).forEach((t) => mock.addToken(t, o.tokens[t]));
  o.babies.forEach((b) => mock.addBaby(b));

  const requests = [];
  const storage = {
    data: {},
    getItem(k) { return k in this.data ? this.data[k] : null; },
    setItem(k, v) { this.data[k] = String(v); },
  };
  const settings = createSettings(storage);
  settings.update(o.stored);

  const toWatch = [];
  const app = createApp({
    settings,
    makeClient: (s) => createClient({
      baseUrl: s.baseUrl,
      token: s.token,
      transport: (req) => { requests.push(req); return Promise.resolve(mock.handle(req)); },
    }),
    sendToWatch: (dict) => { toWatch.push(dict); return Promise.resolve(); },
  });
  return { app, settings, toWatch, requests, mock };
}

test('with no token the watch is told so and no request is made', async () => {
  const h = harness({ stored: {} });
  await h.app.start();
  assert.deepEqual(h.toWatch, [{ STATUS: STATUS.NO_TOKEN }]);
  assert.equal(h.requests.length, 0);
});

test('a good token with one baby sends OK and the baby name, and remembers the baby', async () => {
  const h = harness({ stored: { token: 'good-token' } });
  await h.app.start();
  assert.deepEqual(h.toWatch, [{ STATUS: STATUS.OK, BABY_NAME: 'Phoebe' }]);
  assert.equal(h.settings.get().babyId, PHOEBE.id);
  assert.equal(h.requests.length, 1);
});

test('with two babies the saved choice is the one shown', async () => {
  const h = harness({ babies: [PHOEBE, OSCAR], stored: { token: 'good-token', babyId: OSCAR.id } });
  await h.app.start();
  assert.deepEqual(h.toWatch, [{ STATUS: STATUS.OK, BABY_NAME: 'Oscar' }]);
  assert.equal(h.settings.get().babyId, OSCAR.id);
});

test('a household with no babies reports NO_BABY', async () => {
  const h = harness({ babies: [], stored: { token: 'good-token' } });
  await h.app.start();
  assert.deepEqual(h.toWatch, [{ STATUS: STATUS.NO_BABY }]);
});

const failures = [
  ['an unknown token', { token: 'wrong' }, STATUS.UNAUTHORIZED],
  ['an expired token', { token: 'stale' }, STATUS.TOKEN_EXPIRED],
  ['a non-Premium account', { token: 'free' }, STATUS.PREMIUM_REQUIRED],
];
failures.forEach(([name, stored, expected]) => {
  test(name + ' is reported to the watch as the matching status', async () => {
    const h = harness({
      stored,
      tokens: { 'good-token': {}, stale: { expired: true }, free: { premium: false } },
    });
    await h.app.start();
    assert.deepEqual(h.toWatch, [{ STATUS: expected }]);
  });
});

test('a rate limit is reported as RATE_LIMITED with the wait in seconds', async () => {
  let t = Date.parse('2026-10-24T12:00:00Z');
  const h = harness({ stored: { token: 'good-token' }, now: () => t });
  for (let i = 0; i < 12; i++) await h.app.start();
  h.toWatch.length = 0;
  t += 20 * 1000;
  await h.app.start();
  assert.deepEqual(h.toWatch, [{ STATUS: STATUS.RATE_LIMITED, RETRY_AFTER: 40 }]);
});

test('a network failure is reported as NETWORK and keeps the saved baby', async () => {
  const h = harness({ stored: { token: 'good-token', babyId: PHOEBE.id } });
  const app = createApp({
    settings: h.settings,
    makeClient: () => createClient({ baseUrl: 'http://x', token: 'good-token', transport: () => Promise.reject(new Error('down')) }),
    sendToWatch: (d) => { h.toWatch.push(d); return Promise.resolve(); },
  });
  await app.start();
  assert.deepEqual(h.toWatch, [{ STATUS: STATUS.NETWORK }]);
  assert.equal(h.settings.get().babyId, PHOEBE.id);
});

test('closing the settings page saves them and refreshes the watch', async () => {
  const h = harness({});
  await h.app.handleConfigClosed({ token: { value: 'good-token' }, units: { value: 'ml' } });
  assert.equal(h.settings.get().token, 'good-token');
  assert.equal(h.settings.get().units, 'ml');
  assert.deepEqual(h.toWatch, [{ STATUS: STATUS.OK, BABY_NAME: 'Phoebe' }]);
});

test('the token is never put in a watch message', async () => {
  const h = harness({});
  await h.app.handleConfigClosed({ token: { value: 'good-token' } });
  assert.ok(!JSON.stringify(h.toWatch).includes('good-token'));
});

test('prepareConfig without a token makes no request and offers no baby picker', async () => {
  const h = harness({});
  const config = await h.app.prepareConfig();
  assert.equal(h.requests.length, 0);
  assert.ok(!JSON.stringify(config).includes('"babyId"'));
});

test('prepareConfig with a good token offers the babies', async () => {
  const h = harness({ babies: [PHOEBE, OSCAR], stored: { token: 'good-token' } });
  const config = await h.app.prepareConfig();
  const picker = config.find((i) => i.messageKey === 'babyId');
  assert.deepEqual(picker.options.map((o) => o.label), ['Phoebe', 'Oscar']);
});

test('prepareConfig with a rejected token explains it on the page', async () => {
  const h = harness({ stored: { token: 'wrong' } });
  const config = await h.app.prepareConfig();
  const text = config.filter((i) => i.type === 'text').map((i) => i.defaultValue).join(' ');
  assert.match(text, /not accepted/i);
});
