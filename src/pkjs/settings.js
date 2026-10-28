// Persistent phone-side settings, kept as one JSON blob in localStorage.
// The token lives here and never goes to the watch.

const KEY = 'nappebble.settings';

const DEFAULTS = Object.freeze({
  token: '',
  babyId: '',
  // Each amount screen has its own unit; the watch changes them with SET_UNITS.
  bottleUnits: 'oz',
  pumpUnits: 'oz',
  baseUrl: 'https://api.nappi.app',
  // Visible tiles in grid order (Status is always appended last by the state builder).
  layout: Object.freeze(['sleep', 'nursing', 'bottle', 'diaper', 'pump', 'potty']),
  defaultBottleType: 'formula',
  exitAfterLog: false
});

function isUnit(value) {
  return value === 'oz' || value === 'ml';
}

function copy(value) {
  return Array.isArray(value) ? value.slice() : value;
}

function createSettings(storage) {
  function read() {
    let stored = {};
    try {
      stored = JSON.parse(storage.getItem(KEY)) || {};
    } catch (e) {
      stored = {};
    }
    const result = {};
    Object.keys(DEFAULTS).forEach((name) => {
      result[name] = copy(name in stored ? stored[name] : DEFAULTS[name]);
    });
    // Older installs stored one `units` for everything.
    const legacy = isUnit(stored.units) ? stored.units : DEFAULTS.bottleUnits;
    result.bottleUnits = isUnit(stored.bottleUnits) ? stored.bottleUnits : legacy;
    result.pumpUnits = isUnit(stored.pumpUnits) ? stored.pumpUnits : legacy;
    return result;
  }

  return {
    get: read,
    update(patch) {
      storage.setItem(KEY, JSON.stringify(Object.assign(read(), patch)));
    }
  };
}

module.exports = { createSettings, DEFAULTS };
