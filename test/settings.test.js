const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSettings, DEFAULTS } = require('../src/pkjs/settings');
const { resolveActiveBaby } = require('../src/pkjs/babies');

function memoryStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

const A = { id: 'a', name: 'Phoebe', birth_date: null, timezone: null };
const B = { id: 'b', name: 'Oscar', birth_date: null, timezone: null };

test('fresh settings use the agreed defaults: oz, no token, production API', () => {
  const s = createSettings(memoryStorage()).get();
  assert.equal(s.token, '');
  assert.equal(s.babyId, '');
  assert.equal(s.bottleUnits, 'oz');
  assert.equal(s.pumpUnits, 'oz');
  assert.equal(s.baseUrl, 'https://api.nappi.app');
  assert.deepEqual(s, DEFAULTS);
});

test('update persists and a new store over the same storage reads it back', () => {
  const storage = memoryStorage();
  createSettings(storage).update({ token: 'abc', babyId: 'a' });
  const s = createSettings(storage).get();
  assert.equal(s.token, 'abc');
  assert.equal(s.babyId, 'a');
  assert.equal(s.bottleUnits, 'oz');
});

test('update merges rather than replaces', () => {
  const store = createSettings(memoryStorage());
  store.update({ token: 'abc' });
  store.update({ bottleUnits: 'ml' });
  assert.deepEqual(
    [store.get().token, store.get().bottleUnits],
    ['abc', 'ml'],
  );
});

test('a stored legacy units value fills both per-screen units', () => {
  const storage = memoryStorage({ 'nappebble.settings': JSON.stringify({ units: 'ml' }) });
  const s = createSettings(storage).get();
  assert.equal(s.bottleUnits, 'ml');
  assert.equal(s.pumpUnits, 'ml');
});

test('a stored per-screen value wins over the legacy units value', () => {
  const storage = memoryStorage({ 'nappebble.settings': JSON.stringify({ units: 'ml', bottleUnits: 'oz' }) });
  const s = createSettings(storage).get();
  assert.equal(s.bottleUnits, 'oz');
  assert.equal(s.pumpUnits, 'ml');
});

test('empty storage gives oz for both, and no units or bottlePresets key exists', () => {
  const s = createSettings(memoryStorage()).get();
  assert.equal(s.bottleUnits, 'oz');
  assert.equal(s.pumpUnits, 'oz');
  assert.equal('units' in s, false);
  assert.equal('bottlePresets' in s, false);
});

test('corrupt stored JSON falls back to defaults instead of throwing', () => {
  const storage = memoryStorage({ 'nappebble.settings': '{not json' });
  assert.deepEqual(createSettings(storage).get(), DEFAULTS);
});

test('get returns a copy so callers cannot mutate the store', () => {
  const store = createSettings(memoryStorage());
  store.get().token = 'sneaky';
  assert.equal(store.get().token, '');
});

test('unknown stored keys are dropped', () => {
  const storage = memoryStorage({ 'nappebble.settings': JSON.stringify({ token: 't', junk: 1 }) });
  const s = createSettings(storage).get();
  assert.equal(s.token, 't');
  assert.equal('junk' in s, false);
});

test('no babies means no active baby', () => {
  assert.deepEqual(resolveActiveBaby([], ''), { baby: null, hasChoice: false });
});

test('a single baby is active and the switcher stays hidden', () => {
  assert.deepEqual(resolveActiveBaby([A], ''), { baby: A, hasChoice: false });
});

test('the saved baby stays active when there are several', () => {
  assert.deepEqual(resolveActiveBaby([A, B], 'b'), { baby: B, hasChoice: true });
});

test('with several babies and no saved choice the first is active', () => {
  assert.deepEqual(resolveActiveBaby([A, B], ''), { baby: A, hasChoice: true });
});

test('a saved baby that no longer exists falls back to the first', () => {
  assert.deepEqual(resolveActiveBaby([A, B], 'gone'), { baby: A, hasChoice: true });
});
