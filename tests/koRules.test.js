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

// Uneven pools (owner, 2026-11-26): the smaller pools feed the preliminary fights, if possible.
import { buildDraw, sizesForKo } from '../src/lib/tournament/draw.js';
import { matchRounds, isWinnerRef } from '../src/lib/tournament/ko.js';

test('uneven pools: the smaller pools are the ones whose qualifiers play the preliminary fights', () => {
  for (let n = 5; n <= 48; n += 1) {
    const d = buildDraw(Array.from({ length: n }, (_, i) => `e${i}`), { poolSize: 3, advancing: 2 }, 7);
    if (!d.koTemplate || d.problems.length) continue;
    const sizes = d.pools.map((p) => p.length);
    if (new Set(sizes).size < 2) continue;
    const rounds = matchRounds(d.koTemplate);
    const deepest = Math.max(...rounds.values());
    const entering = new Set(d.koTemplate.flatMap((m) => [m.red, m.white].filter((c) => !isWinnerRef(c)).map(() => rounds.get(m.no))));
    if (entering.size < 2) continue;
    const pre = new Map();
    for (const m of d.koTemplate.filter((x) => rounds.get(x.no) === deepest)) {
      for (const c of [m.red, m.white].filter((x) => !isWinnerRef(x))) pre.set(Number(c.slice(0, 2)) - 1, (pre.get(Number(c.slice(0, 2)) - 1) ?? 0) + 1);
    }
    // a smaller pool never has fewer qualifiers in the preliminaries than a bigger one
    for (let a = 0; a < sizes.length; a += 1) {
      for (let b = 0; b < sizes.length; b += 1) {
        if (sizes[a] < sizes[b]) assert.ok((pre.get(a) ?? 0) >= (pre.get(b) ?? 0), `${n} entries ${d.koCode}: pool ${a + 1} (${sizes[a]}) vs pool ${b + 1} (${sizes[b]})`);
      }
    }
  }
});

test('uneven pools without preliminary fights keep bigger pools first', () => {
  assert.deepEqual(sizesForKo([3, 3, 3, 2], [{ no: 1, red: '011', white: '022' }, { no: 2, red: '031', white: '042' }, { no: 3, red: '012', white: '021' }, { no: 4, red: '032', white: '041' }, { no: 5, red: 'W01', white: 'W02' }, { no: 6, red: 'W03', white: 'W04' }, { no: 7, red: 'W05', white: 'W06' }]), [3, 3, 3, 2]);
});
