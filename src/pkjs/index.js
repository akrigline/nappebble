// PebbleKit JS entry point: wires the Pebble runtime (AppMessage, Clay,
// localStorage, XHR) into the testable pieces. Logic lives in app.js.

const Clay = require('pebble-clay');
const { createApp } = require('./app');
const { createClient } = require('./api');
const { createSettings } = require('./settings');
const { createXhrTransport } = require('./xhr-transport');
const { prefillFor } = require('./config');

const settings = createSettings(localStorage);
const transport = createXhrTransport();

const app = createApp({
  settings,
  makeClient: (s) => createClient({ baseUrl: s.baseUrl, token: s.token, transport }),
  sendToWatch: (dict) => new Promise((resolve, reject) => {
    Pebble.sendAppMessage(dict, resolve, (e) => reject(new Error('AppMessage failed: ' + JSON.stringify(e))));
  }),
});

function log(err) {
  console.log('nappi: ' + (err && err.message ? err.message : err));
}

// Clay registers its widgets from the config it is constructed with, so a
// fresh instance is made per settings page rather than reusing one.
let clay = null;

Pebble.addEventListener('ready', () => {
  app.start().catch(log);
});

Pebble.addEventListener('showConfiguration', () => {
  app.prepareConfig().then((config) => {
    clay = new Clay(config, null, { autoHandleEvents: false });
    clay.setSettings(prefillFor(config));
    Pebble.openURL(clay.generateUrl());
  }).catch(log);
});

Pebble.addEventListener('webviewclosed', (e) => {
  if (!e || !e.response) return;
  const parser = clay || new Clay([], null, { autoHandleEvents: false });
  app.handleConfigClosed(parser.getSettings(e.response, false)).catch(log);
});
