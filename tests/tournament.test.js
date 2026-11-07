// Run: node --test tests/
// Cases use real results from DP HKS 2026 (Excel files) wherever possible.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POOL_ORDER, isRoundRobin, splitIntoPools, splitEvenly, poolMatches, systemCode, shuffle, seededRandom,
  boutResult, rankPool, KO_TEMPLATES, KO_VARIANTS, parseTemplate, getTemplate,
  validateTemplate, resolveBracket, matchRounds, teamMatchResult,
} from '../src/lib/tournament/index.js';

// Helpers: build a bout from Excel-style strings ("MK", hansoku count).
const ev = (side, s) => [...s].map((type) => ({ side, type }));
const bout = (red = '', white = '', { rh = 0, wh = 0, decision } = {}) => ({
  events: [
    ...ev('red', red), ...ev('white', white),
    ...Array(rh).fill({ side: 'red', type: 'hansoku' }),
    ...Array(wh).fill({ side: 'white', type: 'hansoku' }),
  ],
  decision,
});

test('pool fight orders are complete round-robins', () => {
  for (const [size, order] of Object.entries(POOL_ORDER)) {
    assert.ok(isRoundRobin(order, Number(size)), `size ${size}`);
  }
});

test('splitIntoPools works like SplitIntoPools macro', () => {
  assert.deepEqual(splitIntoPools(['a', 'b', 'c', 'd', 'e'], 3), [['a', 'b', 'c'], ['d', 'e']]);
  assert.equal(splitIntoPools(Array.from({ length: 15 }, (_, i) => i), 3).length, 5);
  assert.equal(systemCode(5, 2), 'K052');
  assert.equal(systemCode(11, 1), 'K111');
});

test('seeded shuffle is reproducible', () => {
  const a = shuffle([1, 2, 3, 4, 5, 6], seededRandom(42));
  const b = shuffle([1, 2, 3, 4, 5, 6], seededRandom(42));
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5, 6]);
});

test('pool matches for DAN M pool 1 match the Excel labels', () => {
  const m = poolMatches(['RENDULIĆ', 'MERLAK', 'KOŠUTIĆ'], 1);
  assert.deepEqual(m.map((x) => [x.label, x.red, x.white]), [
    ['P1.1', 'RENDULIĆ', 'MERLAK'],
    ['P1.2', 'KOŠUTIĆ', 'MERLAK'],
    ['P1.3', 'KOŠUTIĆ', 'RENDULIĆ'],
  ]);
});

test('bout scoring: ippon count, draw, hansoku and decision', () => {
  assert.equal(boutResult(bout('KK', '')).winner, 'red');
  assert.equal(boutResult(bout('', '')).draw, true);
  // second hansoku gives the opponent an ippon
  const r = boutResult(bout('M', '', { wh: 2 }));
  assert.equal(r.redIppons, 2);
  assert.equal(boutResult(bout('M', '', { wh: 2 }), { autoHansokuIppon: false }).redIppons, 1);
  assert.equal(boutResult(bout('', '', { decision: 'white' })).winner, 'white');
});

test('DAN M pool 1 (DP26): tie for 2nd → ipponshobu KOŠUTIĆ vs MERLAK, MERLAK wins', () => {
  const members = ['RENDULIĆ', 'MERLAK', 'KOŠUTIĆ'];
  const matches = [
    { red: 'RENDULIĆ', white: 'MERLAK', bout: bout('KK', '') },
    { red: 'KOŠUTIĆ', white: 'MERLAK', bout: bout('', '') },
    { red: 'KOŠUTIĆ', white: 'RENDULIĆ', bout: bout('', 'MM') },
  ];
  const first = rankPool({ members, matches, expectedMatches: 3, advancing: 2 });
  assert.equal(first.status, 'ipponshobu');
  assert.equal(first.ipponshobu.place, 2);
  assert.deepEqual([...first.ipponshobu.between].sort(), ['KOŠUTIĆ', 'MERLAK']);

  const after = rankPool({
    members,
    matches: [...matches, { kind: 'ipponshobu', label: 'P1.D', red: 'KOŠUTIĆ', white: 'MERLAK', bout: bout('', 'M') }],
    expectedMatches: 3,
    advancing: 2,
  });
  assert.equal(after.status, 'decided');
  assert.deepEqual(after.ranking.slice(0, 2), ['RENDULIĆ', 'MERLAK']);
});

test('pool with 1 advancing ignores a tie for 2nd', () => {
  const members = ['A', 'B', 'C'];
  const matches = [
    { red: 'A', white: 'B', bout: bout('M', '') },
    { red: 'C', white: 'B', bout: bout('', '') },
    { red: 'C', white: 'A', bout: bout('', 'M') },
  ];
  assert.equal(rankPool({ members, matches, expectedMatches: 3, advancing: 1 }).status, 'decided');
});

test('three-way tie → replay ("Ponovi pool")', () => {
  const members = ['A', 'B', 'C'];
  const matches = [
    { red: 'A', white: 'B', bout: bout('', '') },
    { red: 'C', white: 'B', bout: bout('', '') },
    { red: 'C', white: 'A', bout: bout('', '') },
  ];
  assert.equal(rankPool({ members, matches, expectedMatches: 3 }).status, 'replay');
});

test('incomplete pool is not ranked', () => {
  const r = rankPool({ members: ['A', 'B', 'C'], matches: [{ red: 'A', white: 'B', bout: bout('M') }], expectedMatches: 3 });
  assert.equal(r.status, 'incomplete');
});

test('all standard KO templates are structurally valid', () => {
  for (const [code, lines] of Object.entries(KO_TEMPLATES)) {
    const pools = Number(code.slice(1, 3));
    const adv = Number(code.slice(3));
    assert.deepEqual(validateTemplate(parseTemplate(lines), pools, adv), [], code);
  }
  for (const [key, lines] of Object.entries(KO_VARIANTS)) {
    const code = key.split('@')[0];
    assert.deepEqual(validateTemplate(parseTemplate(lines), Number(code.slice(1, 3)), Number(code.slice(3))), [], key);
  }
});

test('validator catches same-pool entries in one half', () => {
  const bad = parseTemplate(['01 011 012', '02 021 022', '03 W01 W02']);
  assert.ok(validateTemplate(bad, 2, 2).some((p) => p.includes('same half')));
});

test('KO rounds: K052 has 2 preliminaries, final is match 9', () => {
  const rounds = matchRounds(getTemplate('K052'));
  assert.equal(rounds.get(9), 1);
  assert.equal(rounds.get(7), 2);
  assert.equal(rounds.get(8), 2);
  assert.equal(rounds.get(1), 4);
});

test('DAN M KO (DP26 variant): bracket resolves to TORKONJAK vs BAN final', () => {
  const t = parseTemplate(KO_VARIANTS['K052@DP26-DAN-M']);
  const pools = {
    '011': 'RENDULIĆ', '012': 'MERLAK', '021': 'BAN', '022': 'CUKAR', '031': 'TORKONJAK',
    '032': 'VEJVODA', '041': 'KOSOR', '042': 'TRAVICA', '051': 'VUKELIĆ', '052': 'PERKOVIĆ',
  };
  const results = {
    1: bout('M', 'MK', { rh: 1 }), // TRAVICA – CUKAR → CUKAR
    2: bout('', 'M'), // MERLAK – PERKOVIĆ → PERKOVIĆ (from SHIAIJO2 copy)
    3: bout('M', '', { rh: 1 }), // RENDULIĆ – VUKELIĆ
    4: bout('M', ''), // TORKONJAK – CUKAR
    5: bout('', 'KT'), // PERKOVIĆ – KOSOR → KOSOR
    6: bout('', 'DD'), // VEJVODA – BAN → BAN
    7: bout('', 'M'), // RENDULIĆ – TORKONJAK → TORKONJAK
    8: bout('', 'K', { rh: 1 }), // KOSOR – BAN (encho) → BAN
  };
  const b = resolveBracket(t, pools, results);
  assert.equal(b[8].red, 'TORKONJAK');
  assert.equal(b[8].white, 'BAN');
  assert.equal(b[8].winner, null);
  assert.equal(b[3].white, 'CUKAR');
});

test('team match F1 (DP26): RIJEKA 3 beats SPALATO 3 2:1', () => {
  const r = teamMatchResult([
    { position: 'senpo', bout: bout('', 'MM') },
    { position: 'chuken', bout: bout('MM', '') },
    { position: 'taisho', bout: bout('M', '', { wh: 2 }) }, // HM vs DD in Excel
  ]);
  assert.equal(r.winner, 'red');
  assert.equal(r.redWins, 2);
  assert.equal(r.whiteWins, 1);
});

test('team tie on wins and ippons needs daihyōsen', () => {
  const bouts = [
    { position: 'senpo', bout: bout('M', '') },
    { position: 'chuken', bout: bout('', 'K') },
    { position: 'taisho', bout: bout('', '') },
  ];
  assert.equal(teamMatchResult(bouts).needsDaihyosen, true);
  assert.equal(teamMatchResult([...bouts, { position: 'daihyosen', bout: bout('', 'M') }]).winner, 'white');
});

// --- draw ------------------------------------------------------------------
import { buildDraw, directKoQualifiers, smallCategoryFormats, drawFromPools, swapEntries, moveEntry } from '../src/lib/tournament/index.js';

test('draw: 15 entries, pools of 3, 2 advancing → K052 with 15 pool matches', () => {
  const ids = Array.from({ length: 15 }, (_, i) => `e${i}`);
  const d = buildDraw(ids, { poolSize: 3, advancing: 2 }, 123);
  assert.equal(d.pools.length, 5);
  assert.equal(d.poolMatches.length, 15);
  assert.equal(d.koCode, 'K052');
  assert.equal(d.koTemplate.length, 9);
  assert.deepEqual(d.problems, []);
  assert.deepEqual(buildDraw(ids, { poolSize: 3, advancing: 2 }, 123).pools, d.pools);
});

test('draw: Dan Ž style (3 entries, pools only) has no KO', () => {
  const d = buildDraw(['a', 'b', 'c'], { poolSize: 3, advancing: 0 }, 1);
  assert.equal(d.koCode, null);
  assert.equal(d.poolMatches.length, 3);
});

test('draw: Junior B style (5 entries) → pools 3+2, K022', () => {
  const d = buildDraw(['a', 'b', 'c', 'd', 'e'], { poolSize: 3, advancing: 2 }, 7);
  assert.deepEqual(d.pools.map((p) => p.length), [3, 2]);
  assert.equal(d.koCode, 'K022');
  assert.deepEqual(d.problems, []);
});

test('draw: team direct KO with 11 teams → K111, qualifiers per pool', () => {
  const ids = Array.from({ length: 11 }, (_, i) => `t${i}`);
  const d = buildDraw(ids, { poolSize: 1, advancing: 2 }, 5);
  assert.equal(d.directKo, true);
  assert.equal(d.koCode, 'K111');
  assert.equal(d.poolMatches.length, 0);
  const q = directKoQualifiers(d.pools);
  assert.equal(Object.keys(q).length, 11);
  assert.equal(q['011'], d.pools[0][0]);
});

test('draw: missing template is reported', () => {
  const ids = Array.from({ length: 45 }, (_, i) => `e${i}`);
  const d = buildDraw(ids, { poolSize: 3, advancing: 2 }, 1); // K152
  assert.ok(d.problems.some((p) => p.includes('K152')));
});

test('draw: 3 entries cannot go to KO (direct KO or pool + advancing)', () => {
  for (const settings of [{ poolSize: 1, advancing: 1 }, { poolSize: 3, advancing: 2 }, { poolSize: 2, advancing: 1 }]) {
    const d = buildDraw(['a', 'b', 'c'], settings, 1);
    assert.ok(d.problems.some((p) => p.includes('3 sudionika')), JSON.stringify(settings));
  }
  const rr = buildDraw(['a', 'b', 'c'], { poolSize: 3, advancing: 0 }, 1);
  assert.deepEqual(rr.problems, []);
});

test('draw: small category formats (3 → round robin, 4 → round robin or direct KO)', () => {
  assert.deepEqual(smallCategoryFormats(3).map((f) => f.key), ['roundRobin']);
  assert.deepEqual(smallCategoryFormats(4).map((f) => f.key), ['roundRobin', 'directKo']);
  assert.equal(smallCategoryFormats(5), null);
  for (const n of [3, 4]) {
    for (const f of smallCategoryFormats(n)) {
      const d = buildDraw(Array.from({ length: n }, (_, i) => `e${i}`), f, 9);
      assert.deepEqual(d.problems, [], `${n} ${f.key}`);
    }
  }
  const ko4 = buildDraw(['a', 'b', 'c', 'd'], smallCategoryFormats(4)[1], 9);
  assert.equal(ko4.koCode, 'K041');
  const rr4 = buildDraw(['a', 'b', 'c', 'd'], smallCategoryFormats(4)[0], 9);
  assert.equal(rr4.poolMatches.length, 6);
  assert.equal(rr4.koCode, null);
});

test('splitEvenly: same pool count as SplitIntoPools, sizes differ by at most one', () => {
  const ids = (n) => Array.from({ length: n }, (_, i) => i);
  assert.deepEqual(splitEvenly(ids(7), 3).map((p) => p.length), [3, 2, 2]);
  assert.deepEqual(splitEvenly(ids(5), 3).map((p) => p.length), [3, 2]);
  assert.deepEqual(splitEvenly(ids(10), 4).map((p) => p.length), [4, 3, 3]);
  assert.deepEqual(splitEvenly(ids(15), 3).map((p) => p.length), [3, 3, 3, 3, 3]);
  assert.deepEqual(splitEvenly(ids(11), 1).map((p) => p.length), Array(11).fill(1));
  for (let n = 2; n <= 60; n += 1) {
    for (const size of [2, 3, 4, 5]) {
      const pools = splitEvenly(ids(n), size);
      assert.equal(pools.length, splitIntoPools(ids(n), size).length);
      assert.deepEqual(pools.flat(), ids(n));
    }
  }
});

test('draw: 7 entries, pools of 3 → 3+2+2 (no single-person pool), K032', () => {
  const d = buildDraw(['a', 'b', 'c', 'd', 'e', 'f', 'g'], { poolSize: 3, advancing: 2 }, 3);
  assert.deepEqual(d.pools.map((p) => p.length), [3, 2, 2]);
  assert.equal(d.koCode, 'K032');
  assert.deepEqual(d.problems, []);
});

test('manual edit: swap and move keep entries, drawFromPools recomputes matches', () => {
  const settings = { poolSize: 3, advancing: 2 };
  const pools = [['a', 'b', 'c'], ['d', 'e', 'f']];
  const swapped = swapEntries(pools, 'a', 'f');
  assert.deepEqual(swapped, [['f', 'b', 'c'], ['d', 'e', 'a']]);
  assert.deepEqual(pools, [['a', 'b', 'c'], ['d', 'e', 'f']]); // not mutated
  const d = drawFromPools(swapped, settings);
  assert.equal(d.seed, null);
  assert.equal(d.poolMatches[0].red, 'f');
  const moved = moveEntry(pools, 'a', 1);
  assert.deepEqual(moved, [['b', 'c'], ['d', 'e', 'f', 'a']]);
  assert.deepEqual(drawFromPools(moved, settings).problems, []);
  const emptied = moveEntry(moveEntry(pools, 'a', 1), 'b', 1);
  assert.ok(drawFromPools(moveEntry(emptied, 'c', 1), settings).problems.some((p) => p.includes('prazan')));
  assert.equal(moveEntry(pools, 'zz', 0), pools);
});

// --- placement: tiers and clubs ---------------------------------------------
import { poolMeetingRound, analyzePlacement } from '../src/lib/tournament/placement.js';
import { getTemplate as tpl } from '../src/lib/tournament/ko.js';

const people = (n, clubOf = () => '', tierOf = () => null) => Array.from({ length: n }, (_, i) => ({
  id: `p${i}`, club: clubOf(i), tier: tierOf(i),
}));
const poolOf = (d, id) => d.pools.findIndex((p) => p.includes(id));
const TOP4 = [1, 2, 3, 3];

test('meeting round: K022 pool winners meet only in the final', () => {
  assert.equal(poolMeetingRound(tpl('K022'))(0, 1), 1);
  const k041 = poolMeetingRound(tpl('K041'));
  assert.equal(k041(0, 1), 2); // 011 vs 021 = semifinal
  assert.equal(k041(0, 2), 1);
});

function checkTop(n, topCount, seeds = [1, 2, 3, 42, 99]) {
  for (const s of seeds) {
    const d = buildDraw(people(n, () => '', (i) => TOP4[i] ?? null), { poolSize: 3, advancing: 2 }, s);
    const meet = poolMeetingRound(d.koTemplate);
    const pools = Array.from({ length: topCount }, (_, i) => poolOf(d, `p${i}`));
    assert.equal(new Set(pools).size, topCount, `seed ${s}`);
    assert.equal(meet(pools[0], pools[1]), 1, `champion and runner-up only in the final (seed ${s})`);
    for (let a = 0; a < topCount; a += 1) {
      for (let b = a + 1; b < topCount; b += 1) assert.ok(meet(pools[a], pools[b]) <= 2, `seed ${s}`);
    }
    assert.deepEqual(d.warnings, []);
    assert.deepEqual(d.problems, []);
  }
}

test('tiers 1-3: champion, runner-up and two thirds in 24 (K082) never meet before the semifinal', () => {
  checkTop(24, 4);
});

test('tiers 1-3: K052 (15) separates 3; a 4th cannot be kept apart and is reported', () => {
  const d3 = buildDraw(people(15, () => '', (i) => [1, 2, 3][i] ?? null), { poolSize: 3, advancing: 2 }, 1);
  assert.deepEqual(d3.warnings, []);
  // Excel K052: winners of pools 1/2 meet in the quarterfinal, 4/5 in round one.
  const d = buildDraw(people(15, () => '', (i) => TOP4[i] ?? null), { poolSize: 3, advancing: 2 }, 1);
  assert.equal(new Set([0, 1, 2, 3].map((i) => poolOf(d, `p${i}`))).size, 4);
  assert.ok(d.warnings.some((w) => w.includes('prerano')));
});

test('tiers 1-3: direct KO with 8 (K081) puts champion and runner-up in opposite halves', () => {
  const d = buildDraw(people(8, () => '', (i) => [1, 2][i] ?? null), { poolSize: 1, advancing: 1 }, 5);
  assert.equal(poolMeetingRound(d.koTemplate)(poolOf(d, 'p0'), poolOf(d, 'p1')), 1);
});

test('tiers 4-6: spread evenly — 4 pools, 4 strong → one strong per pool', () => {
  for (const s of [1, 2, 3]) {
    const d = buildDraw(people(12, () => '', (i) => (i < 4 ? 4 : i < 8 ? 5 : 6)), { poolSize: 3, advancing: 2 }, s);
    for (const p of d.pools) {
      assert.deepEqual(p.map((id) => Math.floor(Number(id.slice(1)) / 4)).sort(), [0, 1, 2], `seed ${s}`);
    }
  }
});

test('tiers 4-6: pools with a top seed get the fewest strong players', () => {
  // 4 pools: 2 top seeds, 2 strong → strong ones go to the two pools without a top seed
  const d = buildDraw(people(12, () => '', (i) => [1, 2, 4, 4][i] ?? 6), { poolSize: 3, advancing: 2 }, 9);
  const topPools = new Set([poolOf(d, 'p0'), poolOf(d, 'p1')]);
  assert.ok(!topPools.has(poolOf(d, 'p2')) && !topPools.has(poolOf(d, 'p3')));
});

test('clubs: 9 people from 3 clubs in pools of 3 → no pool shares a club', () => {
  const club = (i) => ['RIJEKA', 'ZAGREB', 'SPLIT'][i % 3];
  for (const s of [1, 7, 123]) {
    const d = buildDraw(people(9, club), { poolSize: 3, advancing: 2 }, s);
    for (const p of d.pools) assert.equal(new Set(p.map((id) => club(Number(id.slice(1))))).size, 3);
    assert.deepEqual(d.warnings, []);
  }
});

test('clubs: fixed by swapping within the same tier, balance kept', () => {
  // two strong from RIJEKA, two strong from ZAGREB, rest medium from other clubs
  const club = (i) => ['RIJEKA', 'RIJEKA', 'ZAGREB', 'ZAGREB'][i] ?? `K${i}`;
  for (const s of [1, 2, 3, 4]) {
    const d = buildDraw(people(12, club, (i) => (i < 4 ? 4 : 5)), { poolSize: 3, advancing: 2 }, s);
    assert.deepEqual(d.warnings, [], `seed ${s}`);
    for (const p of d.pools) assert.equal(p.filter((id) => Number(id.slice(1)) < 4).length, 1, `seed ${s}`);
  }
});

test('clubs: if same-tier swaps are not enough, the 4/5/6 balance is dropped', () => {
  // 2 pools of 3; RIJEKA has both strong players → only a cross-tier swap separates them
  const club = (i) => ['RIJEKA', 'RIJEKA', 'RIJEKA', 'A', 'B', 'C'][i];
  const tier = (i) => [4, 4, 5, 5, 6, 6][i];
  // the fourth entry (A, tier 5) cannot help alone; check the result has at most one RIJEKA pair
  const d = buildDraw(people(6, club, tier), { poolSize: 3, advancing: 2 }, 3);
  const rijekaPerPool = d.pools.map((p) => p.filter((id) => club(Number(id.slice(1))) === 'RIJEKA').length);
  assert.deepEqual(rijekaPerPool.sort(), [1, 2]);
  // strong RIJEKA pair split even though that puts tiers unevenly
  const strongPools = new Set([poolOf(d, 'p0'), poolOf(d, 'p1')]);
  assert.equal(strongPools.size, 2);
});

test('clubs: tiers 1-3 never swap with lower tiers to fix clubs', () => {
  // champion and a strong player from the same club; both pools must hold one top tier
  const club = (i) => (i === 0 || i === 2 ? 'RIJEKA' : `K${i}`);
  const d = buildDraw(people(6, club, (i) => [1, 2, 4, 5, 6, 6][i]), { poolSize: 3, advancing: 2 }, 2);
  assert.notEqual(poolOf(d, 'p0'), poolOf(d, 'p1'));
  assert.deepEqual(d.warnings, []);
});

test('clubs: direct KO avoids same-club first matches', () => {
  const d = buildDraw(people(8, (i) => `K${i % 4}`), { poolSize: 1, advancing: 1 }, 11);
  assert.deepEqual(d.warnings, []);
});

test('impossible separation is reported, draw is still valid and reproducible', () => {
  const entries = people(6, (i) => (i < 5 ? 'RIJEKA' : 'ZAGREB'));
  const d = buildDraw(entries, { poolSize: 3, advancing: 2 }, 3);
  assert.deepEqual(d.problems, []);
  assert.ok(d.warnings.some((w) => w.includes('RIJEKA')));
  assert.deepEqual(buildDraw(entries, { poolSize: 3, advancing: 2 }, 3).pools, d.pools);
  assert.deepEqual(d.pools.flat().sort(), entries.map((e) => e.id).sort());
});

test('manual edit keeps warnings up to date', () => {
  const entries = people(6, (i) => ['A', 'B', 'C'][i % 3], (i) => [1, 2][i] ?? null);
  const d = buildDraw(entries, { poolSize: 3, advancing: 2 }, 1);
  assert.deepEqual(d.warnings, []);
  const mate = d.pools[poolOf(d, 'p0')].find((id) => id !== 'p0');
  const together = drawFromPools(swapEntries(d.pools, 'p1', mate), { poolSize: 3, advancing: 2 }, null, d.meta);
  assert.ok(together.warnings.some((w) => w.includes('1 (prvak) i 2 (finalist)')));
  assert.equal(analyzePlacement(d.pools, d.meta, d.koTemplate, false).length, 0);
});
