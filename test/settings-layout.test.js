const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSettings, DEFAULTS } = require('../src/pkjs/settings');
const { buildConfig, settingsFromClayResponse, prefillFor, ACTION_ORDER } = require('../src/pkjs/config');

function memoryStorage() {
  const data = {};
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

const byKey = (config, key) => {
  let found;
  (function walk(list) { list.forEach((i) => { if (i.messageKey === key) found = i; if (i.items) walk(i.items); }); })(config);
  return found;
};

test('new settings default to spec layout, no custom presets, formula, stay-open', () => {
  assert.deepEqual(DEFAULTS.layout, ['diaper', 'bottle', 'nursing', 'sleep', 'pump', 'potty', 'activity']);
  assert.deepEqual(DEFAULTS.bottlePresets, []);
  assert.equal(DEFAULTS.defaultBottleType, 'formula');
  assert.equal(DEFAULTS.exitAfterLog, false);
});

test('arrays in settings are copied on read so callers cannot corrupt the store', () => {
  const store = createSettings(memoryStorage());
  store.get().layout.push('hacked');
  assert.deepEqual(store.get().layout, DEFAULTS.layout);
});

test('layout and presets persist', () => {
  const storage = memoryStorage();
  createSettings(storage).update({ layout: ['sleep', 'diaper'], bottlePresets: [3, 4] });
  const s = createSettings(storage).get();
  assert.deepEqual(s.layout, ['sleep', 'diaper']);
  assert.deepEqual(s.bottlePresets, [3, 4]);
});

test('the config page has a position picker per action, prefilled from the saved layout', () => {
  const config = buildConfig({ settings: Object.assign({}, DEFAULTS, { layout: ['sleep', 'diaper'] }), babies: [] });
  assert.deepEqual(ACTION_ORDER, ['diaper', 'bottle', 'nursing', 'sleep', 'pump', 'potty', 'activity']);
  ACTION_ORDER.forEach((a) => assert.equal(byKey(config, 'pos_' + a).type, 'select', a));
  assert.equal(byKey(config, 'pos_sleep').defaultValue, '1');
  assert.equal(byKey(config, 'pos_diaper').defaultValue, '2');
  assert.equal(byKey(config, 'pos_bottle').defaultValue, '0', 'hidden');
  const labels = byKey(config, 'pos_sleep').options.map((o) => o.label);
  assert.equal(labels[0], 'Hidden');
  assert.equal(labels.length, 8);
});

test('the config page has presets, default bottle type and exit-after-log', () => {
  const config = buildConfig({
    settings: Object.assign({}, DEFAULTS, { bottlePresets: [2.5, 5], defaultBottleType: 'breast_milk', exitAfterLog: true }), babies: [],
  });
  assert.equal(byKey(config, 'bottlePresets').defaultValue, '2.5, 5');
  assert.equal(byKey(config, 'defaultBottleType').defaultValue, 'breast_milk');
  assert.deepEqual(byKey(config, 'defaultBottleType').options.map((o) => o.value), ['formula', 'breast_milk']);
  assert.equal(byKey(config, 'exitAfterLog').type, 'toggle');
  assert.equal(byKey(config, 'exitAfterLog').defaultValue, true);
});

test('blank custom presets show the unit defaults as a hint, not as saved values', () => {
  const config = buildConfig({ settings: DEFAULTS, babies: [] });
  assert.equal(byKey(config, 'bottlePresets').defaultValue, '');
  assert.match(byKey(config, 'bottlePresets').description, /2, 3, 4, 5, 6, 7/);
  const ml = buildConfig({ settings: Object.assign({}, DEFAULTS, { units: 'ml' }), babies: [] });
  assert.match(byKey(ml, 'bottlePresets').description, /60, 90, 120/);
});

test('positions in the response become the ordered layout, hidden ones dropped', () => {
  const patch = settingsFromClayResponse({
    pos_diaper: { value: '3' }, pos_bottle: { value: '0' }, pos_nursing: { value: '1' }, pos_sleep: { value: '2' },
    pos_pump: { value: '0' }, pos_potty: { value: '0' }, pos_activity: { value: '4' },
  });
  assert.deepEqual(patch.layout, ['nursing', 'sleep', 'diaper', 'activity']);
});

test('equal positions fall back to the default order', () => {
  const patch = settingsFromClayResponse({ pos_diaper: { value: '1' }, pos_bottle: { value: '1' } });
  assert.deepEqual(patch.layout, ['diaper', 'bottle']);
});

test('hiding every action is ignored so the grid is never empty', () => {
  const patch = settingsFromClayResponse({ pos_diaper: { value: '0' }, pos_bottle: { value: '0' } });
  assert.equal('layout' in patch, false);
});

test('a response with no position fields leaves the layout alone', () => {
  assert.equal('layout' in settingsFromClayResponse({ token: { value: 't' } }), false);
});

test('presets parse from comma or space separated text, capped at six', () => {
  assert.deepEqual(settingsFromClayResponse({ bottlePresets: { value: '2, 3.5 ,4  5,6,7,8' } }).bottlePresets, [2, 3.5, 4, 5, 6, 7]);
});

test('bad or empty presets fall back to the defaults (empty list)', () => {
  assert.deepEqual(settingsFromClayResponse({ bottlePresets: { value: '' } }).bottlePresets, []);
  assert.deepEqual(settingsFromClayResponse({ bottlePresets: { value: 'lots' } }).bottlePresets, []);
  assert.deepEqual(settingsFromClayResponse({ bottlePresets: { value: '-3, 0, 2' } }).bottlePresets, [2]);
  assert.deepEqual(settingsFromClayResponse({ bottlePresets: { value: '5000, 4' } }).bottlePresets, [4]);
});

test('default bottle type and exit-after-log are validated and coerced', () => {
  assert.equal(settingsFromClayResponse({ defaultBottleType: { value: 'breast_milk' } }).defaultBottleType, 'breast_milk');
  assert.equal('defaultBottleType' in settingsFromClayResponse({ defaultBottleType: { value: 'lava' } }), false);
  assert.equal(settingsFromClayResponse({ exitAfterLog: { value: true } }).exitAfterLog, true);
  assert.equal(settingsFromClayResponse({ exitAfterLog: false }).exitAfterLog, false);
});

test('prefill covers the new fields', () => {
  const p = prefillFor(buildConfig({ settings: Object.assign({}, DEFAULTS, { layout: ['sleep'] }), babies: [] }));
  assert.equal(p.pos_sleep, '1');
  assert.equal(p.pos_diaper, '0');
  assert.equal(p.exitAfterLog, false);
  assert.equal(p.bottlePresets, '');
});
