// Final results of a category and the Fighting spirit pick.
import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryResults, fightingSpirit, lastFightOnCourt } from '../src/lib/tournament/results.js';

// direct KO of 8: 1–4 first round, 5–6 semifinals, 7 final
const template = [
  { no: 1, red: '011', white: '021' }, { no: 2, red: '031', white: '041' },
  { no: 3, red: '051', white: '061' }, { no: 4, red: '071', white: '081' },
  { no: 5, red: 'W1', white: 'W2' }, { no: 6, red: 'W3', white: 'W4' },
  { no: 7, red: 'W5', white: 'W6' },
];
const ko = (no, red, white, winner, status = 'finished') => ({
  phase: 'ko', ko_no: no, red_entry_id: red, white_entry_id: white, winner_entry_id: winner, status,
});
const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const fights = [
  ko(1, 'a', 'b', 'a'), ko(2, 'c', 'd', 'c'), ko(3, 'e', 'f', 'e'), ko(4, 'g', 'h', 'g'),
  ko(5, 'a', 'c', 'a'), ko(6, 'e', 'g', 'g'), ko(7, 'a', 'g', 'g'),
];

test('results: KO with shared third place', () => {
  const r = categoryResults({ ko_template: template, pool_size: 1, third_place: 'shared' }, fights, [], ids);
  assert.deepEqual(r.places, [{ place: 1, entryId: 'g' }, { place: 2, entryId: 'a' }, { place: 3, entryId: 'c' }, { place: 3, entryId: 'e' }]);
  assert.equal(r.finished, true);
  assert.equal(r.stage.get('b'), '1/4 final');
  assert.equal(r.stage.get('c'), '3rd');
});

test('results: fight for 3rd gives 3rd and 4th', () => {
  const fs = [...fights, ko(8, 'c', 'e', 'e')];
  const r = categoryResults({ ko_template: template, pool_size: 1, third_place: 'fight' }, fs, [], ids);
  assert.deepEqual(r.places.slice(2), [{ place: 3, entryId: 'e' }, { place: 4, entryId: 'c' }]);
});

test('results: unfinished final and pools → still fighting / pool', () => {
  const fs = fights.slice(0, 6).concat(ko(7, 'a', 'g', null, 'scheduled'));
  const r = categoryResults({ ko_template: template, pool_size: 1 }, fs, [], ids);
  assert.equal(r.places[0].entryId, null);
  assert.equal(r.stage.get('a'), 'still fighting');
  const pools = [{ id: 'p', number: 1, pool_entries: [{ entry_id: 'x', final_place: 3 }] }];
  const r2 = categoryResults({ ko_template: template, pool_size: 3, advancing: 2 }, fs, pools, ['x']);
  assert.equal(r2.stage.get('x'), 'pool');
});

test('results: round robin only takes the pool places', () => {
  const pools = [{ id: 'p', number: 1, pool_entries: [{ entry_id: 'x', final_place: 2 }, { entry_id: 'y', final_place: 1 }, { entry_id: 'z', final_place: 3 }] }];
  const fs = [{ phase: 'pool', status: 'finished' }];
  const r = categoryResults({ ko_template: [], pool_size: 3, advancing: 0 }, fs, pools, ['x', 'y', 'z']);
  assert.deepEqual(r.places.map((p) => p.entryId), ['y', 'x', 'z']);
});

test('fighting spirit: organizer pick, single proposal, two proposals', () => {
  const c = { id: 'c1', fighting_spirit_competitor_id: null };
  assert.equal(fightingSpirit(c, [{ category_id: 'c1', competitor_id: 'p1' }, { category_id: 'c1', competitor_id: null }]).competitorId, 'p1');
  const two = fightingSpirit(c, [{ category_id: 'c1', competitor_id: 'p1' }, { category_id: 'c1', competitor_id: 'p2' }]);
  assert.equal(two.competitorId, null);
  assert.deepEqual(two.picks, ['p1', 'p2']);
  assert.equal(fightingSpirit({ ...c, fighting_spirit_competitor_id: 'p9' }, []).from, 'organizer');
});

test('last fight of a category on a court', () => {
  const fs = [{ category_id: 'c', shiaijo: 1, status: 'finished' }, { category_id: 'c', shiaijo: 2, status: 'scheduled' }];
  assert.equal(lastFightOnCourt(fs, 'c', 1), true);
  assert.equal(lastFightOnCourt(fs, 'c', 2), false);
});
