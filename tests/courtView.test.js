import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryStarted, courtView, elsewhereTitle } from '../src/lib/tournament/run.js';

const f = (id, cat, court, seq, status = 'scheduled', extra = {}) => ({ id, category_id: cat, shiaijo: court, court_seq: seq, status, phase: 'pool', ...extra });
const queueOf = (fights, court) => fights.filter((x) => x.shiaijo === court).sort((a, b) => a.court_seq - b.court_seq);

test('category not started: the court waits with "Next: category"', () => {
  const fs = [f('a1', 'A', 1, 10), f('a2', 'A', 1, 20)];
  const v = courtView(queueOf(fs, 1), fs);
  assert.equal(v.current, null);
  assert.equal(v.waiting, 'A');
  assert.deepEqual(v.next, []);
});

test('started by the button (category.started_at) or by a started fight', () => {
  const fs = [f('a1', 'A', 1, 10, 'scheduled', { category: { started_at: '2026-11-28T09:00:00Z' } }), f('b1', 'B', 1, 20), f('b2', 'B', 1, 30, 'running')];
  assert.equal(categoryStarted('A', fs), true);
  assert.equal(categoryStarted('B', fs), true);
  assert.equal(categoryStarted('C', fs), false);
});

test('Next list stops at a category that has not started: its last line is the next category', () => {
  const st = { category: { started_at: 'x' } };
  const fs = [f('a1', 'A', 1, 10, 'running', st), f('a2', 'A', 1, 20, 'scheduled', st), f('b1', 'B', 1, 30), f('b2', 'B', 1, 40)];
  const v = courtView(queueOf(fs, 1), fs);
  assert.equal(v.current.id, 'a1');
  assert.deepEqual(v.next.map((x) => x.id), ['a2']);
  assert.equal(v.nextCategory, 'B');
});

test('a category already started on another court shows its fights here at once', () => {
  const fs = [f('a1', 'A', 1, 10, 'finished'), f('b1', 'B', 1, 20), f('b2', 'B', 2, 10, 'running')];
  const v = courtView(queueOf(fs, 1), fs);
  assert.equal(v.current.id, 'b1');
  assert.equal(v.waiting, null);
});

test('finals on another court: the idle court says where', () => {
  const st = { category: { started_at: 'x' } };
  const fs = [
    f('p1', 'A', 2, 10, 'finished', { ...st, finished_at: '2026-11-28T10:00:00Z' }),
    f('k1', 'A', 1, 50, 'scheduled', { ...st, phase: 'ko' }),
    f('b1', 'B', 2, 20),
  ];
  const v = courtView(queueOf(fs, 2), fs);
  assert.equal(v.waiting, 'B');
  assert.equal(v.elsewhere.category, 'A');
  assert.deepEqual(v.elsewhere.fights.map((x) => x.id), ['k1']);
  assert.equal(elsewhereTitle(v.elsewhere.fights), 'FINALS on Shiaijo 1');
  // each category on its own court: nothing elsewhere
  const own = [f('p1', 'A', 2, 10, 'finished', { finished_at: '2026-11-28T10:00:00Z' }), f('k1', 'A', 2, 20, 'scheduled', st)];
  assert.equal(courtView(queueOf(own, 2), own).elsewhere, null);
});
