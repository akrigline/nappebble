// Clay settings page: the config array handed to Clay, and the parser for
// what comes back. Everything stays on the phone; nothing here is sent to
// the watch.

const { DEFAULTS } = require('./settings');
const { resolveActiveBaby } = require('./babies');

const NO_BABIES_HINT = 'Enter your API token and save, then reopen these settings to choose a baby. ' +
  'Create a token at nappi.app/app/connections.';

function buildConfig(options) {
  const settings = options.settings;
  const babies = options.babies;

  const items = [
    { type: 'heading', defaultValue: 'nappi' },
    {
      type: 'input',
      messageKey: 'token',
      label: 'API token',
      description: 'From nappi.app/app/connections. Use a dedicated token for this watch.',
      defaultValue: settings.token,
      attributes: { type: 'password', autocomplete: 'off' },
    },
  ];

  if (babies.length > 0) {
    items.push({
      type: 'select',
      messageKey: 'babyId',
      label: 'Baby',
      defaultValue: resolveActiveBaby(babies, settings.babyId).baby.id,
      options: babies.map((b) => ({ label: b.name, value: b.id })),
    });
  } else {
    items.push({ type: 'text', defaultValue: options.error || NO_BABIES_HINT });
  }

  items.push({
    type: 'select',
    messageKey: 'units',
    label: 'Units',
    defaultValue: settings.units,
    options: [
      { label: 'Ounces (oz)', value: 'oz' },
      { label: 'Millilitres (ml)', value: 'ml' },
    ],
  });

  items.push({
    type: 'section',
    items: [
      { type: 'heading', defaultValue: 'Developer' },
      {
        type: 'input',
        messageKey: 'baseUrl',
        label: 'API address',
        description: 'Leave as is unless testing against a mock server.',
        defaultValue: settings.baseUrl,
        attributes: { type: 'url', autocomplete: 'off' },
      },
    ],
  });

  items.push({ type: 'submit', defaultValue: 'Save' });
  return items;
}

// Clay's page prefers the values it stored last time over defaultValue, so
// the glue overwrites them with these before opening the page.
function prefillFor(config) {
  const values = {};
  (function walk(list) {
    list.forEach((item) => {
      if (item.messageKey) values[item.messageKey] = item.defaultValue;
      if (item.items) walk(item.items);
    });
  })(config);
  return values;
}

function plain(raw) {
  return raw && typeof raw === 'object' ? raw.value : raw;
}

function settingsFromClayResponse(response) {
  const patch = {};
  const token = plain(response.token);
  if (typeof token === 'string') patch.token = token.trim();

  const babyId = plain(response.babyId);
  if (typeof babyId === 'string' && babyId) patch.babyId = babyId;

  const units = plain(response.units);
  if (units === 'oz' || units === 'ml') patch.units = units;

  const baseUrl = plain(response.baseUrl);
  if (typeof baseUrl === 'string') {
    patch.baseUrl = baseUrl.trim().replace(/\/+$/, '') || DEFAULTS.baseUrl;
  }
  return patch;
}

module.exports = { buildConfig, settingsFromClayResponse, prefillFor };
