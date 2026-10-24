const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toWire } = require('../src/pkjs/wire');
const P = require('../src/pkjs/protocol');

// Stand-in for require('message_keys'): the SDK numbers keys in declaration order.
function fakeIds() {
  const ids = {};
  let next = 10000;
  P.MESSAGE_KEYS.forEach((decl) => {
    const m = /^([A-Z0-9_]+)(?:\[(\d+)\])?$/.exec(decl);
    ids[m[1]] = next;
    next += m[2] ? Number(m[2]) : 1;
  });
  return ids;
}

test('scalar values pass through by name', () => {
  assert.deepEqual(toWire({ STATUS: 0, BABY_NAME: 'Phoebe' }, fakeIds()), { STATUS: 0, BABY_NAME: 'Phoebe' });
});

test('array-declared keys expand to consecutive numeric keys', () => {
  const ids = fakeIds();
  const wire = toWire({ PRESET: [20, 30, 40, 50, 60, 70] }, ids);
  assert.deepEqual(Object.keys(wire).map(Number), [0, 1, 2, 3, 4, 5].map((i) => ids.PRESET + i));
  assert.equal(wire[ids.PRESET + 2], 40);
});

test('every array key in the protocol expands with the declared length', () => {
  const ids = fakeIds();
  const dict = {
    PRESET: new Array(6).fill(1), LAST: new Array(8).fill(2), INFO: new Array(8).fill(3),
    TIMER_STATE: [0, 0, 0], TIMER_ELAPSED: [0, 0, 0], TIMER_SIDE: [0, 0, 0],
  };
  const wire = toWire(dict, ids);
  assert.equal(Object.keys(wire).length, 6 + 8 + 8 + 3 + 3 + 3);
});

test('LAYOUT is a single byte-array value, not expanded', () => {
  assert.deepEqual(toWire({ LAYOUT: [0, 1, 2, 7] }, fakeIds()), { LAYOUT: [0, 1, 2, 7] });
});

test('an array longer than its declaration is an error, not silent corruption', () => {
  assert.throws(() => toWire({ PRESET: new Array(7).fill(1) }, fakeIds()), /PRESET/);
});

test('a shorter array fills only the leading slots', () => {
  const ids = fakeIds();
  const wire = toWire({ LAST: [5, 6] }, ids);
  assert.deepEqual(wire, { [ids.LAST]: 5, [ids.LAST + 1]: 6 });
});

test('undefined and null values are dropped', () => {
  assert.deepEqual(toWire({ STATUS: 0, BABY_NAME: undefined, RETRY_AFTER: null }, fakeIds()), { STATUS: 0 });
});

test('unknown keys are an error so typos never vanish silently', () => {
  assert.throws(() => toWire({ STAUTS: 0 }, fakeIds()), /STAUTS/);
});
