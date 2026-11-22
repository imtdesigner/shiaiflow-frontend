import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBulk } from '../src/lib/tournament/bulk.js';

test('bulk entry: name, club, gender, birth year or date, grade', () => {
  const [a, b, c] = parseBulk('RENDULIĆ; Ivan; KK Rijeka; M; 2009; 1 kyu\nMERLAK\tLovro\tKK Rijeka\tž\t14.3.2010\tmudan\nHORVAT, Ana, KK Split');
  assert.deepEqual([a.last_name, a.gender, a.birth_year, a.grade_rank, a.grade], ['RENDULIĆ', 'M', '2009', -1, '1 kyu']);
  assert.deepEqual([b.gender, b.birth_date, b.birth_year, b.grade_rank], ['F', '2010-03-14', '2010', -7]);
  assert.deepEqual([c.club, c.gender, c.birth_year, c.grade_rank], ['KK Split', '', '', '']);
});
