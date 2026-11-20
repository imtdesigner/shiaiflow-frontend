// Pool standings and result marks for the screens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fightMarks, poolStandings } from '../src/lib/tournament/poolView.js';

const cat = { kind: 'individual', advancing: 2 };
const fight = (id, red, white, status = 'finished', extra = {}) => ({
  id, pool_id: 'p', phase: 'pool', status, red_entry_id: red, white_entry_id: white, ...extra,
});
const ev = (match_id, side, type) => ({ match_id, side, type });

test('pool standings: incomplete pool sorted by the Excel criteria, played / total counted', () => {
  const fs = [fight('1', 'a', 'b'), fight('2', 'b', 'c'), fight('3', 'a', 'c', 'scheduled')];
  const s = poolStandings(cat, ['a', 'b', 'c'], fs, [ev('1', 'white', 'M'), ev('2', 'red', 'K'), ev('2', 'red', 'D')]);
  assert.equal(s.status, 'incomplete');
  assert.deepEqual([s.played, s.total], [2, 3]);
  assert.deepEqual(s.table.map((r) => r.id), ['b', 'a', 'c']);
  assert.equal(s.table[0].wins, 2);
});

test('pool standings: finished pool is decided', () => {
  const fs = [fight('1', 'a', 'b'), fight('2', 'b', 'c'), fight('3', 'a', 'c')];
  const s = poolStandings(cat, ['a', 'b', 'c'], fs, [ev('1', 'red', 'M'), ev('2', 'red', 'K'), ev('3', 'red', 'D')]);
  assert.equal(s.status, 'decided');
  assert.deepEqual(s.ranking, ['a', 'b', 'c']);
});

test('fight marks: ippons, hansoku, fusen and hantei', () => {
  const evs = [ev('1', 'red', 'M'), ev('1', 'red', 'hansoku'), ev('1', 'white', 'K')];
  assert.deepEqual(fightMarks(cat, { id: '1' }, evs), { red: 'M ▲', white: 'K' });
  assert.deepEqual(fightMarks(cat, { id: '2', fusen: 'white' }, []), { red: '', white: 'OO' });
  assert.deepEqual(fightMarks(cat, { id: '3', decision: 'red' }, []), { red: 'H H', white: '' });
});
