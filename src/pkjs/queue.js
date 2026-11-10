// Persistent offline write queue. Each job gets an idempotency key when it
// is created, so a retry after a lost response can never log twice. Jobs go
// out strictly in order: the first one that cannot be delivered holds the
// rest back.
//
// flush(client) -> { sent, remaining, stop, dropped, superseded }
//   stop: null, or { kind: 'network' | 'rate_limited' | 'auth', retryAfter, error }
//   dropped: [{ job, error }] jobs the API rejected for good (400/404/...)
//   superseded: [{ job, reason }] stops not sent because the timer they were for is gone
//     ('none_running') or has been replaced by another device's ('different_timer')
//
// A timer stop cannot say which timer it means, and the API has no idempotency
// key for it. Jobs carry `startedAt`, the timer the user was looking at, and
// `attempts`. A stop that was tried before (the answer may have been lost) or
// has waited a while checks what is running before it goes out.

const { toIsoOffset } = require('./time');

const KEY = 'nappebble.queue';
// A job delivered later than this is stamped with when it was queued. Prompt
// sends carry no time so the server's own clock decides, which avoids "start
// time in the future" rejections when the phone clock runs a little fast.
const STALE_MS = 30 * 1000;
const STAMP_FIELD = { entry: 'time', timer_start: 'start_time', timer_stop: 'end_time' };

function sameInstant(a, b) {
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isNaN(x) || Number.isNaN(y) ? a === b : x === y;
}

function createQueue(deps) {
  const storage = deps.storage;
  const uuid = deps.uuid;
  const now = deps.now || Date.now;
  const offsetAt = deps.offsetAt || function () { return 0; };
  let jobs = load();
  let running = null;

  function load() {
    try {
      const parsed = JSON.parse(storage.getItem(KEY));
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function save() {
    storage.setItem(KEY, JSON.stringify(jobs));
  }

  // Delivered late (offline, rate limited): record when it really happened.
  function stamped(job) {
    const field = STAMP_FIELD[job.kind];
    if (!field || typeof job.queuedAt !== 'number' || now() - job.queuedAt < STALE_MS) return job;
    const body = Object.assign({}, job.body);
    if (body[field] === undefined) body[field] = toIsoOffset(job.queuedAt, offsetAt(job.queuedAt));
    return Object.assign({}, job, { body });
  }

  function execute(client, original) {
    const job = stamped(original);
    switch (job.kind) {
      case 'entry': return client.logEntry(job.babyId, job.body, job.key);
      case 'timer_start': return client.startTimer(job.babyId, job.timerType, job.body);
      case 'timer_stop': return client.stopTimer(job.babyId, job.timerType, job.body);
      case 'timer_switch': return client.switchSide(job.babyId, job.body);
      default: return Promise.reject(new Error('unknown job kind ' + job.kind));
    }
  }

  // Resolves to null when the stop may go ahead, else why it must not.
  function stopMismatch(client, job) {
    return client.timers(job.babyId).then((timers) => {
      const running = timers.find((t) => t.type === job.timerType);
      if (!running) return 'none_running';
      return sameInstant(running.started_at, job.startedAt) ? null : 'different_timer';
    });
  }

  // A stop is about to be tried: is it at risk of hitting someone else's timer?
  function needsCheck(job) {
    if (job.kind !== 'timer_stop' || !job.startedAt) return false;
    return (job.attempts || 0) > 0 || (typeof job.queuedAt === 'number' && now() - job.queuedAt >= STALE_MS);
  }

  function remove(job) {
    jobs = jobs.filter((j) => j.key !== job.key);
    save();
  }

  // 'done' | 'drop' | { kind, retryAfter }
  function classify(job, err) {
    const status = err && err.status;
    if (status === 429) return { kind: 'rate_limited', retryAfter: err.retryAfter, error: err };
    if (status === 401 || status === 403) return { kind: 'auth', retryAfter: null, error: err };
    if (status === 409 && job.kind === 'timer_stop' && err.code === 'timer_not_running') return 'done';
    if (status >= 400 && status < 500) return 'drop';
    return { kind: 'network', retryAfter: null, error: err };
  }

  function run(client) {
    const result = { sent: 0, remaining: 0, stop: null, dropped: [], superseded: [] };

    // Resolves once the job has been sent, or has been found not to need sending.
    function attempt(job) {
      const check = needsCheck(job);
      if (job.kind === 'timer_stop') {
        // Written down before the request goes out: if the answer is lost, the retry knows to check.
        job.attempts = (job.attempts || 0) + 1;
        save();
      }
      if (!check) return execute(client, job).then(() => null);
      return stopMismatch(client, job).then((reason) => (reason ? reason : execute(client, job).then(() => null)));
    }

    function next() {
      if (jobs.length === 0) return Promise.resolve();
      const job = jobs[0];
      return attempt(job).then(
        (skipped) => {
          remove(job);
          if (skipped) result.superseded.push({ job, reason: skipped });
          else result.sent += 1;
          return next();
        },
        (err) => {
          const verdict = classify(job, err);
          if (verdict === 'done') {
            remove(job);
            result.sent += 1;
            return next();
          }
          if (verdict === 'drop') {
            remove(job);
            result.dropped.push({ job, error: err });
            return next();
          }
          result.stop = verdict;
          return undefined;
        }
      );
    }

    return next().then(() => {
      result.remaining = jobs.length;
      return result;
    });
  }

  return {
    enqueue(job) {
      const queued = Object.assign({}, job, { key: uuid(), queuedAt: now() });
      jobs.push(queued);
      save();
      return queued;
    },
    length: () => jobs.length,
    all: () => jobs.slice(),
    clear() {
      jobs = [];
      save();
    },
    // One flush at a time: a second caller shares the running one.
    flush(client) {
      if (running) return running;
      const done = () => { running = null; };
      running = run(client).then(
        (res) => { done(); return res; },
        (err) => { done(); throw err; }
      );
      return running;
    }
  };
}

module.exports = { createQueue, STAMP_FIELD };
