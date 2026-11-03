// Engine behaviour the code review asked for: wrong-baby guard, rejected-write
// notice, separate read and write limits, queue replay over reads, read budget.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, NOW, PHOEBE, OSCAR, memoryStorage } = require('./support/harness');
const { WRITE_LIMIT } = require('./support/mock-nappi');
const { createClient } = require('../src/pkjs/api');
const P = require('../src/pkjs/protocol');
const { babyKey } = require('../src/pkjs/babies');

const MIN = 60 * 1000;
const DIAPER_CMD = (id, type, extra) => Object.assign({ CMD: P.CMD.LOG_DIAPER, CMD_ID: id, ARG1: type, ARG2: 0 }, extra);

// ---------- which baby ----------
// The watch names the baby it is showing by BABY_KEY, a hash of the baby's id, and the harness
// fills it in from the last state it was sent, as comm.c does. A write whose key is wrong or
// missing is refused: there is no delete, so a write on the wrong baby cannot be undone.

test('a write for a baby the watch is no longer showing is refused, not logged to the other baby', async () => {
  const h = harness({ babies: [PHOEBE, OSCAR] });
  await h.app.start();
  h.reset();
  await h.app.onMessage(DIAPER_CMD(5, P.DIAPER.WET, { BABY_KEY: babyKey(OSCAR.id) })); // watch thinks Oscar; phone has Phoebe
  await h.app.idle();
  assert.deepEqual(h.acks(), [{ ACK_ID: 5, ACK_STATUS: P.STATUS.WRONG_BABY }]);
  assert.equal(h.writes().length, 0);
  assert.equal(h.queued(), 0);
  assert.equal(h.state().BABY_NAME, 'Phoebe', 'the watch is sent the real state so it can correct itself');
});

test('a write for the baby the watch is showing goes through', async () => {
  const h = harness({ babies: [PHOEBE, OSCAR] });
  await h.app.start();
  h.reset();
  await h.app.onMessage(DIAPER_CMD(6, P.DIAPER.WET));
  await h.app.idle();
  assert.deepEqual(h.acks(), [{ ACK_ID: 6, ACK_STATUS: P.STATUS.OK }]);
  assert.equal(h.writes().length, 1);
});

test('a write with no BABY_KEY (a watch with no data yet) is refused, not guessed at', async () => {
  const h = harness({ babies: [PHOEBE, OSCAR] });
  await h.app.start();
  h.reset();
  await h.app.onMessage(DIAPER_CMD(7, P.DIAPER.WET, { BABY_KEY: undefined }));
  await h.app.idle();
  assert.deepEqual(h.acks(), [{ ACK_ID: 7, ACK_STATUS: P.STATUS.WRONG_BABY }]);
  assert.equal(h.writes().length, 0);
  assert.equal(h.state().BABY_NAME, 'Phoebe', 'and it is sent the state it was missing');
});

test('a watch still showing another household\'s baby is refused even when that baby sat at the same list position', async () => {
  // The token changed to another household. Its only baby is now index 0, as Phoebe was.
  const h = harness({ babies: [OSCAR], stored: { babyId: PHOEBE.id } });
  await h.app.start();
  h.reset();
  await h.app.onMessage(DIAPER_CMD(8, P.DIAPER.WET, { BABY_KEY: babyKey(PHOEBE.id) }));
  await h.app.idle();
  assert.deepEqual(h.acks(), [{ ACK_ID: 8, ACK_STATUS: P.STATUS.WRONG_BABY }]);
  assert.equal(h.writes().length, 0);
});

test('reordering the baby list does not refuse a write for the baby the watch is showing', async () => {
  const h = harness({ babies: [OSCAR, PHOEBE], stored: { babyId: PHOEBE.id } });
  await h.app.start();
  h.reset();
  await h.app.onMessage(DIAPER_CMD(9, P.DIAPER.WET, { BABY_KEY: babyKey(PHOEBE.id) })); // she used to be index 0
  await h.app.idle();
  assert.deepEqual(h.acks(), [{ ACK_ID: 9, ACK_STATUS: P.STATUS.OK }]);
  assert.ok(h.writes()[0].url.includes(PHOEBE.id));
});

test('refresh, baby switch and unit commands do not need a key', async () => {
  const h = harness({ babies: [PHOEBE, OSCAR] });
  await h.app.start();
  await h.app.onMessage({ CMD: P.CMD.REFRESH, ARG1: 1, BABY_KEY: undefined });
  await h.app.onMessage({ CMD: P.CMD.SWITCH_BABY, ARG1: 1, BABY_KEY: undefined });
  await h.app.onMessage({ CMD: P.CMD.SET_UNITS, CMD_ID: 3, ARG1: P.UNITS_SCREEN.BOTTLE, ARG2: P.UNITS.ML, BABY_KEY: undefined });
  await h.app.idle();
  assert.equal(h.state().BABY_NAME, 'Oscar');
  assert.deepEqual(h.acks(), [{ ACK_ID: 3, ACK_STATUS: P.STATUS.OK }]);
});

// ---------- rejected writes ----------

test('a write the API refuses for good is reported to the watch, which had already confirmed it', async () => {
  const storage = memoryStorage();
  const first = harness({ storage });
  await first.app.start();
  first.net.offline = true;
  await first.app.onMessage(DIAPER_CMD(1, P.DIAPER.WET));
  await first.app.idle();
  const queue = JSON.parse(storage.data['nappebble.queue']);
  queue[0].babyId = 'no-such-baby'; // the API answers 404
  storage.data['nappebble.queue'] = JSON.stringify(queue);

  const second = harness({ storage });
  await second.app.start();
  await second.app.idle();
  assert.equal(second.state().PENDING, 0, 'dropped, not retried forever');
  assert.ok(
    second.acks().some((a) => a.ACK_ID === 0 && a.ACK_STATUS === P.STATUS.REJECTED),
    'the watch is told'
  );
});

// ---------- read and write limits are separate ----------

function exhaustWrites(h) {
  for (let i = 0; i < WRITE_LIMIT; i++) h.api(`/v1/babies/${PHOEBE.id}/entries`, { type: 'diaper', diaper_type: 'dry' });
}

test('a write 429 does not block reads, is not hidden by a read, and the queued write stays on the watch', async () => {
  const h = harness();
  await h.app.start();
  exhaustWrites(h);
  h.reset();
  await h.app.onMessage(DIAPER_CMD(1, P.DIAPER.POO));
  await h.app.idle();
  assert.equal(h.state().STATUS, P.STATUS.RATE_LIMITED);
  assert.equal(h.state().PENDING, 1);

  h.reset();
  await h.app.onMessage({ CMD: P.CMD.REFRESH, ARG1: 1 });
  await h.app.idle();
  assert.ok(h.reads().length > 0, 'reads still go out');
  assert.equal(h.state().STATUS, P.STATUS.RATE_LIMITED, 'a good read does not hide the stuck write');
  assert.equal(h.state().PENDING, 1);
  assert.equal(h.state().LAST[P.ACTION.DIAPER], Math.floor(NOW / 1000), 'the queued entry is laid back over the server data');
  assert.equal(h.state().INFO[P.ACTION.DIAPER], P.DIAPER.POO + 1);
});

test('after a write 429 the engine retries by itself once the wait has passed', async () => {
  const h = harness();
  await h.app.start();
  exhaustWrites(h);
  await h.app.onMessage(DIAPER_CMD(1, P.DIAPER.POO));
  await h.app.idle();
  assert.equal(h.state().PENDING, 1);

  h.clock.t += 2 * MIN;
  h.reset();
  await h.runScheduled();
  assert.equal(h.state().PENDING, 0);
  assert.equal(h.state().STATUS, P.STATUS.OK);
  assert.equal(h.writes().length, 1);
});

test('inside the refresh throttle the queue is still flushed', async () => {
  const h = harness();
  await h.app.start();
  h.net.offline = true;
  await h.app.onMessage(DIAPER_CMD(1, P.DIAPER.WET));
  await h.app.idle();
  h.net.offline = false;
  h.reset();
  h.clock.t += 20 * 1000; // inside MIN_REFRESH_MS
  await h.app.onMessage({ CMD: P.CMD.REFRESH });
  await h.app.idle();
  assert.equal(h.reads().length, 0, 'throttled: no reads');
  assert.equal(h.writes().length, 1, 'but the pending write goes out');
  assert.equal(h.state().PENDING, 0);
});

// ---------- refresh behaviour ----------

test('REFRESH with ARG1 1 bypasses the once-a-minute throttle', async () => {
  const h = harness();
  await h.app.start();
  h.reset();
  await h.app.onMessage({ CMD: P.CMD.REFRESH });
  assert.equal(h.reads().length, 0);
  await h.app.onMessage({ CMD: P.CMD.REFRESH, ARG1: 1 });
  assert.ok(h.reads().length > 0);
});

test('a forced refresh asked for while one is running runs again afterwards, so it cannot miss a write', async () => {
  const h = harness();
  const starting = h.app.start();
  const forced = h.app.onMessage({ CMD: P.CMD.REFRESH, ARG1: 1 });
  await Promise.all([starting, forced]);
  await h.app.idle();
  // babies + status, then status again.
  assert.equal(h.reads().length, 3);
});

test('a re-read after a write is skipped when the read budget is nearly spent', async () => {
  const h = harness();
  await h.app.start(); // 2 reads
  for (let i = 0; i < 9; i++) await h.app.onMessage({ CMD: P.CMD.REFRESH, ARG1: 1 }); // 9 more
  await h.app.onMessage(DIAPER_CMD(1, P.DIAPER.WET));
  await h.app.idle();
  const shown = h.state();
  h.reset();
  await h.runScheduled();
  assert.equal(h.reads().length, 0, 'no re-read with fewer than 2 reads left');
  assert.equal(shown.LAST[P.ACTION.DIAPER], Math.floor(NOW / 1000), 'the optimistic entry is what the watch was last shown');
});

test('a re-read after a write does not read the other babies\' timers', async () => {
  const h = harness({ babies: [PHOEBE, OSCAR] });
  await h.app.start();
  await h.app.onMessage(DIAPER_CMD(1, P.DIAPER.WET));
  await h.app.idle();
  h.reset();
  await h.runScheduled();
  assert.equal(h.reads().length, 1, 'status for the active baby only');
});

// ---------- Retry-After ----------

test('Retry-After as an HTTP date is understood', async () => {
  const when = new Date(Date.now() + 30 * 1000).toUTCString();
  const client = createClient({
    baseUrl: 'https://api.nappi.app',
    token: 't',
    transport: () => Promise.resolve({
      status: 429,
      headers: { 'Retry-After': when },
      body: JSON.stringify({ error: { code: 'rate_limited', message: 'slow down' } })
    })
  });
  await assert.rejects(client.listBabies(), (err) => {
    assert.ok(err.retryAfter >= 28 && err.retryAfter <= 31, 'about 30 s, got ' + err.retryAfter);
    return true;
  });
});

test('Retry-After in seconds still works, and a garbage value is ignored', async () => {
  const make = (value) => createClient({
    baseUrl: 'https://api.nappi.app',
    token: 't',
    transport: () => Promise.resolve({
      status: 429,
      headers: { 'Retry-After': value },
      body: JSON.stringify({ error: { code: 'rate_limited', message: 'slow down' } })
    })
  });
  await assert.rejects(make('17').listBabies(), (err) => err.retryAfter === 17);
  await assert.rejects(make('soon').listBabies(), (err) => err.retryAfter === null);
});
