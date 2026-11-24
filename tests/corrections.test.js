import { test } from 'node:test';
import assert from 'node:assert/strict';
import { koCheck, poolPlacesMap, replaySeqs, manualPlaces } from '../src/lib/tournament/corrections.js';

// K042-like: F1 011-022, F2 031-042, F3 021-012, F4 041-032, F5 W1-W2, F6 W3-W4, F7 W5-W6
const ko = () => [
  { id: 'f1', ko_no: 1, red_code: '011', white_code: '022' },
  { id: 'f2', ko_no: 2, red_code: '031', white_code: '042' },
  { id: 'f3', ko_no: 3, red_code: '021', white_code: '012' },
  { id: 'f4', ko_no: 4, red_code: '041', white_code: '032' },
  { id: 'f5', ko_no: 5, red_code: 'W1', white_code: 'W2' },
  { id: 'f6', ko_no: 6, red_code: 'W3', white_code: 'W4' },
  { id: 'f7', ko_no: 7, red_code: 'W5', white_code: 'W6' },
].map((f) => ({ status: 'scheduled', red_entry_id: null, white_entry_id: null, winner_entry_id: null, ...f }));
const places = (o = {}) => new Map(Object.entries({ '011': 'a1', '012': 'a2', '021': 'b1', '022': 'b2', '031': 'c1', '032': 'c2', '041': 'd1', '042': 'd2', ...o }));
const fill = (fs, pl) => { const { auto } = koCheck(fs, pl); for (const u of auto) Object.assign(fs.find((f) => f.id === u.id), u); return fs; };
const fight = (fs, id, winSide) => { const f = fs.find((x) => x.id === id); f.status = 'finished'; f.winner_entry_id = winSide === 'red' ? f.red_entry_id : f.white_entry_id; };

test('koCheck fills scheduled fights from pool places', () => {
  const fs = fill(ko(), places());
  assert.deepEqual([fs[0].red_entry_id, fs[0].white_entry_id], ['a1', 'b2']);
  assert.equal(fs[4].red_entry_id, null);
  assert.deepEqual(koCheck(fs, places()), { auto: [], conflicts: [] });
});

test('level 2: changed pool place, KO fight not started → auto replace, no conflict', () => {
  const fs = fill(ko(), places());
  const { auto, conflicts } = koCheck(fs, places({ '011': 'a2', '012': 'a1' }));
  assert.equal(conflicts.length, 0);
  assert.deepEqual(auto.map((u) => u.id).sort(), ['f1', 'f3']);
});

test('level 3: changed pool place after the KO fight was fought → conflict chain', () => {
  const fs = fill(ko(), places());
  fight(fs, 'f1', 'red'); fight(fs, 'f2', 'white');
  fill(fs, places());
  fight(fs, 'f5', 'red');
  fill(fs, places());
  const { auto, conflicts } = koCheck(fs, places({ '022': 'x9' }));
  assert.deepEqual(conflicts.map((c) => c.fight.id), ['f1', 'f5']);
  assert.equal(conflicts[0].cause, 'fighters');
  assert.deepEqual([conflicts[0].red, conflicts[0].white], ['a1', 'x9']);
  assert.equal(conflicts[1].cause, 'earlier');
  assert.deepEqual(conflicts[1].from, [1]);
  assert.equal(conflicts[1].white, 'd2'); // winner of F2 is still fine
  // the final waits for a fighter: auto clears its red side (winner of F5 is not trusted)
  assert.ok(fs[6].red_entry_id);
  assert.deepEqual(auto, [{ id: 'f7', red_entry_id: null, white_entry_id: null }]);
});

test('kept as fought: the fight and what follows count as they are', () => {
  const fs = fill(ko(), places());
  fight(fs, 'f1', 'red');
  fill(fs, places());
  fs[0].kept_as_fought = true;
  assert.deepEqual(koCheck(fs, places({ '022': 'x9' })).conflicts, []);
});

test('manual entries are not overwritten', () => {
  const fs = fill(ko(), places());
  Object.assign(fs[1], { red_entry_id: 'zz', manual_entries: true });
  assert.ok(!koCheck(fs, places()).auto.some((u) => u.id === 'f2'));
});

test('a running fight with wrong fighters is a conflict too', () => {
  const fs = fill(ko(), places());
  fs[2].status = 'running';
  assert.deepEqual(koCheck(fs, places({ '021': 'q' })).conflicts.map((c) => c.fight.id), ['f3']);
});

test('poolPlacesMap reads final places of the advancing places only', () => {
  const m = poolPlacesMap([{ number: 2, pool_entries: [{ entry_id: 'b', final_place: 2 }, { entry_id: 'a', final_place: 1 }, { entry_id: 'c', final_place: 3 }] }], 2);
  assert.deepEqual([...m], [['021', 'a'], ['022', 'b']]);
});

test('replaySeqs puts the fights right before the first open fight of their shiaijo', () => {
  const court = [
    { id: 'p', shiaijo: 1, status: 'finished', court_seq: 1 },
    { id: 'f1', shiaijo: 1, status: 'finished', court_seq: 2, ko_no: 1 },
    { id: 'f5', shiaijo: 1, status: 'finished', court_seq: 4, ko_no: 5 },
    { id: 'f7', shiaijo: 1, status: 'scheduled', court_seq: 6, ko_no: 7 },
  ];
  const s = replaySeqs([court[2], court[1]], court);
  assert.deepEqual([s.get('f1'), s.get('f5')], [4, 5]);
});

test('manualPlaces numbers the order', () => {
  assert.deepEqual(manualPlaces(['x', 'y']), [{ entry_id: 'x', final_place: 1 }, { entry_id: 'y', final_place: 2 }]);
});
