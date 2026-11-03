const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveActiveBaby, babyKey } = require('../src/pkjs/babies');
const { PHOEBE, OSCAR } = require('./support/harness');

test('a baby key is stable, positive and fits a signed 32-bit AppMessage integer', () => {
  const k = babyKey(PHOEBE.id);
  assert.equal(babyKey(PHOEBE.id), k);
  assert.ok(Number.isInteger(k) && k > 0 && k <= 0x7fffffff);
});

test('different babies get different keys', () => {
  assert.notEqual(babyKey(PHOEBE.id), babyKey(OSCAR.id));
});

test('ids that begin alike (time-ordered UUIDs) still get different keys', () => {
  const a = babyKey('0198a1b2-c3d4-7000-8000-000000000001');
  const b = babyKey('0198a1b2-c3d4-7000-8000-000000000002');
  assert.notEqual(a, b);
});

test('a key is never 0, which the watch uses for "no baby"', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed.toString(16).padStart(8, '0'); };
  for (let i = 0; i < 5000; i++) {
    const k = babyKey(rnd() + '-' + rnd().slice(0, 4) + '-4' + rnd().slice(0, 3) + '-8' + rnd().slice(0, 3) + '-' + rnd() + rnd().slice(0, 4));
    assert.ok(k >= 1 && k <= 0x7fffffff);
  }
});

test('resolveActiveBaby is unchanged: the saved baby, else the first', () => {
  assert.equal(resolveActiveBaby([PHOEBE, OSCAR], OSCAR.id).baby, OSCAR);
  assert.equal(resolveActiveBaby([PHOEBE, OSCAR], 'gone').baby, PHOEBE);
});
