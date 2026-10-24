// Persistent phone-side settings, kept as one JSON blob in localStorage.
// The token lives here and never goes to the watch.

const KEY = 'nappi.settings';

const DEFAULTS = Object.freeze({
  token: '',
  babyId: '',
  units: 'oz',
  baseUrl: 'https://api.nappi.app',
});

function createSettings(storage) {
  function read() {
    let stored = {};
    try {
      stored = JSON.parse(storage.getItem(KEY)) || {};
    } catch (e) {
      stored = {};
    }
    const result = Object.assign({}, DEFAULTS);
    Object.keys(DEFAULTS).forEach((name) => {
      if (name in stored) result[name] = stored[name];
    });
    return result;
  }

  return {
    get: read,
    update(patch) {
      storage.setItem(KEY, JSON.stringify(Object.assign(read(), patch)));
    },
  };
}

module.exports = { createSettings, DEFAULTS };
