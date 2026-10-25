// Phone-side engine: keeps a cache of what nappi says, tells the watch about
// it, and turns the watch's commands into queued, idempotent API writes.
// Pebble globals are injected from index.js so all of this runs under test.
//
//   settings, storage, now(), offsetAt(ms), uuid(), schedule(fn, ms), cancel(handle)
//   makeClient(settings) -> api client
//   sendToWatch(dict)    -> Promise (logical dict; index.js applies wire.toWire)
//
// Read budget (12/min/token): launch costs latest + timers; a refresh is at
// most once a minute; other babies add one timers read each; a write adds one
// debounced re-read. Nothing polls in the background.

const { buildConfig, settingsFromClayResponse } = require('./config');
const { resolveActiveBaby } = require('./babies');
const { STATUS, describeError } = require('./protocol');
const { createQueue } = require('./queue');
const { jobsFor, BadCommand } = require('./commands');
const { applyJob } = require('./optimistic');
const { buildState } = require('./state');
const P = require('./protocol');

const CACHE_KEY = 'nappi.cache';
const MIN_REFRESH_MS = 60 * 1000;
const REREAD_DELAY_MS = 4000;
const LATEST_TYPES = ['sleep', 'nursing', 'bottle', 'diaper', 'potty', 'pumping'];

function emptyCache() {
  return { babies: [], perBaby: {}, others: {} };
}

function emptyBaby() {
  return { latest: {}, etag: null, timers: [], timersAt: 0, fetchedAt: 0 };
}

function createApp(deps) {
  const settings = deps.settings;
  const queue = createQueue({ storage: deps.storage, uuid: deps.uuid, now: deps.now, offsetAt: deps.offsetAt });
  const log = deps.log || function () {};

  let cache = loadCache();
  let status = STATUS.OK;
  let blockedUntil = 0; // reads are held back until then (a 429's Retry-After)
  let writeBlockedUntil = 0;
  let lastRefreshAt = 0;
  let refreshing = null;
  let rereadTask = null;
  let sendChain = Promise.resolve();
  let work = Promise.resolve();

  // ---- cache ----

  function loadCache() {
    try {
      const parsed = JSON.parse(deps.storage.getItem(CACHE_KEY));
      if (parsed && Array.isArray(parsed.babies) && parsed.perBaby && parsed.others) return parsed;
    } catch (e) {
      // fall through to an empty cache
    }
    return emptyCache();
  }

  function saveCache() {
    deps.storage.setItem(CACHE_KEY, JSON.stringify(cache));
  }

  function perBaby(id) {
    if (!cache.perBaby[id]) cache.perBaby[id] = emptyBaby();
    return cache.perBaby[id];
  }

  function activeBaby() {
    return resolveActiveBaby(cache.babies, settings.get().babyId).baby;
  }

  // Timers are snapshots; bring running ones up to date as of `now`.
  function rolledTimers(per, now) {
    const gap = per.timersAt ? Math.max(0, Math.floor((now - per.timersAt) / 1000)) : 0;
    return per.timers.map((t) => (t.paused ? t : Object.assign({}, t, { elapsed_seconds: t.elapsed_seconds + gap })));
  }

  // ---- talking to the watch ----

  function send(dict) {
    const go = () => deps.sendToWatch(dict).catch((e) => log('watch send failed: ' + (e && e.message)));
    sendChain = sendChain.then(go, go);
    return sendChain;
  }

  function sendState() {
    const s = settings.get();
    const now = deps.now();
    const known = status === STATUS.NO_TOKEN ? [] : cache.babies;
    const baby = known.length ? resolveActiveBaby(known, s.babyId).baby : null;
    const per = baby ? perBaby(baby.id) : emptyBaby();
    const waiting = Math.ceil((blockedUntil - now) / 1000);
    return send(buildState({
      status,
      retryAfter: status === STATUS.RATE_LIMITED && waiting > 0 ? waiting : null,
      babies: known,
      activeIndex: baby ? known.indexOf(baby) : -1,
      latest: per.latest,
      timers: rolledTimers(per, now),
      timersAt: now,
      othersRunning: baby ? known.some((b) => b.id !== baby.id && cache.others[b.id]) : false,
      settings: s,
      pending: queue.length(),
      now
    }));
  }

  function ack(dict, result) {
    return send({ ACK_ID: dict.CMD_ID, ACK_STATUS: result });
  }

  // ---- background work ----

  function background(fn) {
    work = work.then(fn).catch((e) => log('background: ' + (e && e.message)));
  }

  function idle() {
    const seen = work;
    return seen.then(() => sendChain).then(() => (work !== seen ? idle() : undefined));
  }

  // ---- queue ----

  function flushQueue(client) {
    if (queue.length() === 0 || deps.now() < writeBlockedUntil) return Promise.resolve();
    return queue.flush(client).then((res) => {
      if (res.dropped.length) {
        // The API refused a write for good; whatever we showed for it is wrong.
        res.dropped.forEach((d) => log('dropped ' + d.job.kind + ': ' + d.error.message));
        Object.keys(cache.perBaby).forEach((id) => { cache.perBaby[id].etag = null; });
        saveCache();
      }
      if (res.stop) {
        const failure = describeError(res.stop.error);
        status = failure.status;
        if (res.stop.kind === 'rate_limited') {
          writeBlockedUntil = deps.now() + (res.stop.retryAfter || 60) * 1000;
          blockedUntil = Math.max(blockedUntil, writeBlockedUntil);
        }
      } else if (status === STATUS.NETWORK) {
        status = STATUS.OK;
      }
    });
  }

  // ---- reading ----

  function failWith(err) {
    const failure = describeError(err);
    status = failure.status;
    if (failure.status === STATUS.RATE_LIMITED) blockedUntil = deps.now() + (failure.retryAfter || 60) * 1000;
    return sendState();
  }

  function readEverything(client) {
    const s = settings.get();
    return (cache.babies.length ? Promise.resolve(cache.babies) : client.listBabies()).then((babies) => {
      if (babies !== cache.babies) cache.babies = babies;
      const baby = resolveActiveBaby(cache.babies, s.babyId).baby;
      if (!baby) {
        status = STATUS.NO_BABY;
        saveCache();
        return undefined;
      }
      if (baby.id !== s.babyId) settings.update({ babyId: baby.id });
      const per = perBaby(baby.id);

      return Promise.all([
        client.latest(baby.id, { types: LATEST_TYPES, etag: per.etag }),
        client.timers(baby.id)
      ]).then((got) => {
        const at = deps.now();
        if (!got[0].notModified) per.latest = got[0].data;
        per.etag = got[0].etag || null;
        per.timers = got[1];
        per.timersAt = at;
        per.fetchedAt = at;

        // Other babies: timers only, so the header can flag a running one.
        return cache.babies.filter((b) => b.id !== baby.id).reduce(
          (chain, other) => chain.then(() => client.timers(other.id).then((timers) => {
            cache.others[other.id] = timers.length > 0;
          })),
          Promise.resolve()
        );
      }).then(() => {
        lastRefreshAt = deps.now();
        status = STATUS.OK;
        saveCache();
      });
    });
  }

  function refresh(opts) {
    if (refreshing) return refreshing;
    const force = Boolean(opts && opts.force);
    const s = settings.get();
    if (!s.token) {
      status = STATUS.NO_TOKEN;
      return sendState();
    }
    const now = deps.now();
    if (now < blockedUntil) {
      status = STATUS.RATE_LIMITED;
      return sendState();
    }
    if (!force && cache.babies.length && now - lastRefreshAt < MIN_REFRESH_MS) return sendState();

    const client = deps.makeClient(s);
    refreshing = flushQueue(client)
      .then(() => readEverything(client))
      .then(() => sendState(), failWith)
      .then(
        (v) => { refreshing = null; return v; },
        (e) => { refreshing = null; throw e; }
      );
    return refreshing;
  }

  function scheduleReread() {
    if (rereadTask) deps.cancel(rereadTask);
    rereadTask = deps.schedule(() => {
      rereadTask = null;
      return refresh({ force: true });
    }, REREAD_DELAY_MS);
  }

  // ---- watch commands ----

  function switchBaby(index) {
    const baby = cache.babies[index];
    if (!baby || baby.id === settings.get().babyId) return sendState();
    settings.update({ babyId: baby.id });
    const per = cache.perBaby[baby.id];
    const stale = !per || deps.now() - per.fetchedAt >= MIN_REFRESH_MS;
    return sendState().then(() => (stale ? refresh({ force: true }) : undefined));
  }

  function write(dict) {
    const s = settings.get();
    if (!s.token) return ack(dict, STATUS.NO_TOKEN);
    const baby = activeBaby();
    if (!baby) return ack(dict, STATUS.NO_BABY);

    const now = deps.now();
    let jobs;
    try {
      jobs = jobsFor(dict, { babyId: baby.id, units: s.units, now, offsetAt: deps.offsetAt });
    } catch (e) {
      if (e instanceof BadCommand) {
        log('bad command: ' + e.message);
        return ack(dict, STATUS.ERROR);
      }
      throw e;
    }

    jobs.forEach((job) => {
      queue.enqueue(job);
      const per = perBaby(job.babyId);
      per.timers = rolledTimers(per, now);
      per.timersAt = now;
      const view = applyJob({ latest: per.latest, timers: per.timers }, job, { now, units: s.units });
      per.latest = view.latest;
      per.timers = view.timers;
    });
    saveCache();

    // Both messages are built now (so PENDING reflects this write) and go
    // out in order: ack first for instant feedback, then the optimistic state.
    ack(dict, STATUS.OK);
    const sent = sendState();
    background(() => flushQueue(deps.makeClient(s)).then(() => {
      scheduleReread();
      return sendState();
    }));
    return sent;
  }

  function onMessage(dict) {
    switch (dict.CMD) {
      case P.CMD.REFRESH: return refresh({ force: false });
      case P.CMD.SWITCH_BABY: return switchBaby(dict.ARG1);
      default: return write(dict);
    }
  }

  // ---- lifecycle and settings ----

  function start() {
    const s = settings.get();
    if (!s.token) {
      cache = emptyCache();
      status = STATUS.NO_TOKEN;
      return sendState();
    }
    const shown = cache.babies.length ? sendState() : Promise.resolve();
    return shown.then(() => refresh({ force: true }));
  }

  // Resolves to the Clay config array, with the baby picker filled in when
  // the token works.
  function prepareConfig() {
    const s = settings.get();
    if (!s.token) return Promise.resolve(buildConfig({ settings: s, babies: [] }));

    return deps.makeClient(s).listBabies().then(
      (babies) => {
        cache.babies = babies;
        saveCache();
        return buildConfig({
          settings: s,
          babies,
          error: babies.length === 0 ? P.statusMessage(STATUS.NO_BABY) : undefined
        });
      },
      (err) => buildConfig({ settings: s, babies: [], error: describeError(err).text })
    );
  }

  function handleConfigClosed(response) {
    const before = settings.get();
    const patch = settingsFromClayResponse(response);
    settings.update(patch);
    if (patch.token !== undefined && patch.token !== before.token) {
      cache = emptyCache();
      saveCache();
      lastRefreshAt = 0;
      blockedUntil = 0;
    }
    return refresh({ force: true });
  }

  return { start, onMessage, prepareConfig, handleConfigClosed, idle };
}

module.exports = { createApp };
