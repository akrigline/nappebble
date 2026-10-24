// Phone-side controller. Pebble globals (AppMessage, openUrl, localStorage)
// are injected from index.js so this stays testable.
//
//   makeClient(settings) -> api client
//   sendToWatch(dict)    -> Promise

const { buildConfig, settingsFromClayResponse } = require('./config');
const { resolveActiveBaby } = require('./babies');
const { STATUS, statusMessage, describeError } = require('./protocol');

function createApp(deps) {
  const settings = deps.settings;

  function start() {
    const s = settings.get();
    if (!s.token) return deps.sendToWatch({ STATUS: STATUS.NO_TOKEN });

    return deps.makeClient(s).listBabies().then(
      (babies) => {
        const baby = resolveActiveBaby(babies, s.babyId).baby;
        if (!baby) return deps.sendToWatch({ STATUS: STATUS.NO_BABY });
        if (baby.id !== s.babyId) settings.update({ babyId: baby.id });
        return deps.sendToWatch({ STATUS: STATUS.OK, BABY_NAME: baby.name });
      },
      (err) => {
        const failure = describeError(err);
        const dict = { STATUS: failure.status };
        if (failure.retryAfter !== null) dict.RETRY_AFTER = failure.retryAfter;
        return deps.sendToWatch(dict);
      }
    );
  }

  // Resolves to the Clay config array, with the baby picker filled in when
  // the token works.
  function prepareConfig() {
    const s = settings.get();
    if (!s.token) return Promise.resolve(buildConfig({ settings: s, babies: [] }));

    return deps.makeClient(s).listBabies().then(
      (babies) => buildConfig({
        settings: s,
        babies,
        error: babies.length === 0 ? statusMessage(STATUS.NO_BABY) : undefined,
      }),
      (err) => buildConfig({ settings: s, babies: [], error: describeError(err).text })
    );
  }

  function handleConfigClosed(response) {
    settings.update(settingsFromClayResponse(response));
    return start();
  }

  return { start, prepareConfig, handleConfigClosed };
}

module.exports = { createApp };
