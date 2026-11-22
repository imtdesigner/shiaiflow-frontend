import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox } from '../src/lib/outbox.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const tick = () => new Promise((r) => setTimeout(r, 0));

test('outbox: sends in order; a network error keeps the click until it is back', async () => {
  const storage = memory();
  const sent = [];
  let online = false;
  const send = async (op) => { if (!online) throw new Error('Failed to fetch'); sent.push(op.id); };
  const box = createOutbox({ key: 'k', storage, send });
  box.push({ id: 1, kind: 'event' });
  box.push({ id: 2, kind: 'timer' });
  await tick();
  assert.equal(box.size(), 2);
  assert.equal(JSON.parse(storage.getItem('k')).length, 2); // kept on the device
  // a reload: a new outbox on the same storage still has them
  online = true;
  const again = createOutbox({ key: 'k', storage, send });
  await again.flush();
  assert.deepEqual(sent, [1, 2]);
  assert.equal(again.size(), 0);
  box.stop(); again.stop();
});

test('outbox: a server refusal drops the click and reports it', async () => {
  let last;
  const box = createOutbox({ key: 'k', storage: memory(), send: async () => { throw new Error('permission denied'); }, onChange: (s) => { last = s; } });
  box.push({ id: 1, kind: 'event' });
  await tick(); await tick();
  assert.equal(box.size(), 0);
  assert.match(last.error, /permission denied/);
  box.stop();
});

test('outbox: waiting clicks show on the board (timer, points, undo)', async () => {
  const { fightsWithOps, eventsWithOps } = await import('../src/lib/outbox.js');
  const ops = [
    { kind: 'timer', matchId: 'f1', startedAt: null, elapsedMs: 61000 },
    { kind: 'event', matchId: 'f1', clientId: 'c1', side: 'red', type: 'M', boutId: null },
    { kind: 'event', matchId: 'f1', clientId: 'c2', side: 'white', type: 'K', boutId: null },
    { kind: 'delete', matchId: 'f1', clientId: 'c2' },
    { kind: 'delete', matchId: 'f1', eventId: 7 },
  ];
  const [f] = fightsWithOps([{ id: 'f1', timer_started_at: 'x', timer_elapsed_ms: 0 }], ops);
  assert.deepEqual([f.timer_started_at, f.timer_elapsed_ms], [null, 61000]);
  const evs = eventsWithOps([{ id: 7, side: 'red', type: 'hansoku' }], ops, 'f1');
  assert.deepEqual(evs.map((e) => e.type), ['M']);
});
