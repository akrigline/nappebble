// Builds the compact state dict the watch renders (see protocol.js for the
// keys). Epoch seconds and small enums only; the watch formats the text.
//
// view: { status, retryAfter, babies, activeIndex, latest, timers,
//         othersRunning, settings, pending, now }

const P = require('./protocol');
const { DEFAULT_PRESETS } = require('./settings');

const ACCENTS = 6;
const OZ_ML = 29.5735;

function layoutIds(names) {
  const ids = [];
  names.forEach((name) => {
    const id = P.ACTION[String(name).toUpperCase()];
    if (id === undefined || id === P.ACTION.STATUS || ids.indexOf(id) >= 0) return;
    ids.push(id);
  });
  ids.push(P.ACTION.STATUS);
  return ids;
}

function presetsFor(settings) {
  const chosen = settings.bottlePresets.length ? settings.bottlePresets : DEFAULT_PRESETS[settings.units];
  const slots = chosen.slice(0, P.PRESET_COUNT).map((n) => Math.round(n * 10));
  while (slots.length < P.PRESET_COUNT) slots.push(0);
  return slots;
}

const seconds = (iso) => Math.floor(Date.parse(iso) / 1000);

function amountX10(ml, units) {
  if (ml === null || ml === undefined) return 0;
  return Math.round(units === 'oz' ? (ml / OZ_ML) * 10 : ml * 10);
}

function sideId(side) {
  if (side === 'left') return P.SIDE.LEFT;
  if (side === 'right') return P.SIDE.RIGHT;
  return P.SIDE.NONE;
}

// [last, info] for one action, from the API's latest-entry shapes.
function summarise(action, latest, units) {
  switch (action) {
    case P.ACTION.DIAPER: {
      const e = latest.diaper;
      return e ? [seconds(e.time), P.DIAPER_TYPES.indexOf(e.diaper_type) + 1] : [0, 0];
    }
    case P.ACTION.BOTTLE: {
      const e = latest.bottle;
      return e ? [seconds(e.time), amountX10(e.amount_ml, units)] : [0, 0];
    }
    case P.ACTION.NURSING: {
      const e = latest.nursing;
      return e ? [seconds(e.time), sideId(e.side)] : [0, 0];
    }
    case P.ACTION.SLEEP: {
      const e = latest.sleep;
      return e ? [seconds(e.end_time), e.duration_minutes] : [0, 0];
    }
    case P.ACTION.PUMP: {
      const e = latest.pumping;
      return e ? [seconds(e.time), amountX10(e.total_amount_ml, units)] : [0, 0];
    }
    case P.ACTION.POTTY: {
      const e = latest.potty;
      return e ? [seconds(e.time), P.POTTY_OUTCOMES.indexOf(e.outcome) + 1] : [0, 0];
    }
    case P.ACTION.ACTIVITY: {
      const e = latest.activity;
      return e ? [seconds(e.time), P.ACTIVITY_TYPES.indexOf(e.activity_type) + 1] : [0, 0];
    }
    default:
      return [0, 0];
  }
}

function buildState(view) {
  const s = view.settings;
  const state = {
    STATUS: view.status,
    UNITS: s.units === 'ml' ? P.UNITS.ML : P.UNITS.OZ,
    EXIT_AFTER_LOG: s.exitAfterLog ? 1 : 0,
    DEFAULT_BOTTLE: Math.max(0, P.BOTTLE_TYPES.indexOf(s.defaultBottleType))
  };
  if (view.retryAfter !== null && view.retryAfter !== undefined) state.RETRY_AFTER = view.retryAfter;

  const baby = view.babies[view.activeIndex];
  if (!baby) return state;

  state.BABY_NAME = baby.name;
  state.BABY_COUNT = view.babies.length;
  state.BABY_INDEX = view.activeIndex;
  state.BABY_NAMES = view.babies.map((b) => b.name).join('\n');
  state.BABY_ACCENT = view.activeIndex % ACCENTS;
  state.OTHER_TIMERS = view.othersRunning ? 1 : 0;
  state.LAYOUT = layoutIds(s.layout);
  state.PRESET = presetsFor(s);
  state.PENDING = view.pending;

  state.LAST = [];
  state.INFO = [];
  Object.keys(P.ACTION).forEach((name) => {
    const pair = summarise(P.ACTION[name], view.latest, s.units);
    state.LAST[P.ACTION[name]] = pair[0];
    state.INFO[P.ACTION[name]] = pair[1];
  });

  state.TIMER_STATE = [];
  state.TIMER_ELAPSED = [];
  state.TIMER_SIDE = [];
  P.TIMER_TYPES.forEach((type, i) => {
    const timer = view.timers.find((t) => t.type === type);
    state.TIMER_STATE[i] = !timer ? P.TIMER_STATE.NONE : (timer.paused ? P.TIMER_STATE.PAUSED : P.TIMER_STATE.RUNNING);
    state.TIMER_ELAPSED[i] = timer ? timer.elapsed_seconds : 0;
    state.TIMER_SIDE[i] = timer ? sideId(timer.side) : P.SIDE.NONE;
  });
  state.TIMER_AT = Math.floor(view.now / 1000);
  return state;
}

module.exports = { buildState, layoutIds, presetsFor };
