// Persistent phone-side settings, kept as one JSON blob in localStorage.
// The token lives here and never goes to the watch.

const KEY = 'nappi.settings';

const DEFAULT_PRESETS = Object.freeze({
  oz: Object.freeze([2, 3, 4, 5, 6, 7]),
  ml: Object.freeze([60, 90, 120, 150, 180, 210])
});

const DEFAULTS = Object.freeze({
  token: '',
  babyId: '',
  units: 'oz',
  baseUrl: 'https://api.nappi.app',
  // Visible tiles in grid order (Status is always appended last by the state builder).
  layout: Object.freeze(['diaper', 'bottle', 'nursing', 'sleep', 'pump', 'potty', 'activity']),
  // Empty means "use DEFAULT_PRESETS for the current units".
  bottlePresets: Object.freeze([]),
  defaultBottleType: 'formula',
  exitAfterLog: false
});

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
    return result;
  }

  return {
    get: read,
    update(patch) {
      storage.setItem(KEY, JSON.stringify(Object.assign(read(), patch)));
    }
  };
}

module.exports = { createSettings, DEFAULTS, DEFAULT_PRESETS };
