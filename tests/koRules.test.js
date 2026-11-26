// KO templates against the owner's bracket rules (2026-11-26).
import test from 'node:test';
import assert from 'node:assert/strict';
import { KO_TEMPLATES } from '../src/lib/tournament/koTemplates.data.js';
import { getTemplate } from '../src/lib/tournament/ko.js';
import { checkKoRules, seedPools } from '../src/lib/tournament/koRules.js';

test('seed pools: first, the two middle, last', () => {
  assert.deepEqual(seedPools(3), [1, 2, 3]);
  assert.deepEqual(seedPools(5), [1, 3, 4, 5]);
  assert.deepEqual(seedPools(6), [1, 3, 4, 6]);
  assert.deepEqual(seedPools(9), [1, 5, 6, 9]);
});

for (const code of Object.keys(KO_TEMPLATES)) {
  test(`KO template ${code}: hard rules, and the best the number of qualifiers allows`, () => {
    const r = checkKoRules(getTemplate(code), Number(code.slice(1, 3)), Number(code.slice(3)));
    assert.deepEqual(r.problems, [], code);
    assert.equal(r.best, true, `${code} ${JSON.stringify(r.counts)} vs ${JSON.stringify(r.bounds)}`);
  });
}

test('every pool count 1–16 with 1 or 2 advancing has a template', () => {
  for (let p = 1; p <= 16; p += 1) {
    for (const a of [1, 2]) {
      if (p * a < 2) continue;
      assert.ok(KO_TEMPLATES[`K${String(p).padStart(2, '0')}${a}`], `K${String(p).padStart(2, '0')}${a}`);
    }
  }
});
