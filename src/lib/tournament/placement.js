// Smart pool placement (owner's rule, 2026-11-07), as organizers did it by hand:
//   1. seeds (nositelji) go to pools whose winners cannot meet before the
//      final (2 seeds) / semifinal (3-4 seeds) / quarterfinal (5-8 seeds);
//   2. the rest is spread so that as few people as possible from the same
//      club share a pool (for a direct KO: meet in their first match);
//   3. if it does not work out, draw again — here: many attempts from the
//      same seed, keep the best. The organizer then fixes the rest by hand.

import { seededRandom, shuffle } from './pools.js';
import { isWinnerRef, leaves, matchRounds, poolCode } from './ko.js';

const ATTEMPTS = 40;

/** Normalize entries: 'id' or { id, club, seed } → { id, club, seed }. */
export function entryMeta(entries) {
  return entries.map((e) => (typeof e === 'string'
    ? { id: e, club: '', seed: null }
    : { id: e.id, club: (e.club ?? '').trim().toUpperCase(), seed: e.seed ?? null }));
}

/**
 * Earliest KO round in which pool winners can meet: round(poolA, poolB),
 * 1 = final, 2 = semifinal, … ; 0 when there is no KO (they never meet).
 */
export function poolMeetingRound(template) {
  if (!template?.length) return () => 0;
  const byNo = new Map(template.map((m) => [m.no, m]));
  const rounds = matchRounds(template);
  const meet = new Map();
  for (const m of template) {
    const left = leaves(m.red, byNo);
    const right = leaves(m.white, byNo);
    for (const a of left) for (const b of right) {
      meet.set(`${a}|${b}`, rounds.get(m.no));
      meet.set(`${b}|${a}`, rounds.get(m.no));
    }
  }
  return (pa, pb) => meet.get(`${poolCode(pa + 1, 1)}|${poolCode(pb + 1, 1)}`) ?? 0;
}

/** Latest round k seeds can all be kept apart until: 2 → final, 4 → semi, 8 → quarter. */
export const idealSeedRound = (k) => (k <= 1 ? 0 : Math.ceil(Math.log2(k)));

/** First-round KO pairs as [poolIndexA, poolIndexB] (direct KO club check). */
function firstRoundPairs(template) {
  if (!template) return [];
  const idx = (code) => Number(code.slice(0, 2)) - 1;
  return template.filter((m) => !isWinnerRef(m.red) && !isWinnerRef(m.white))
    .map((m) => [idx(m.red), idx(m.white)]);
}

/**
 * Problems a placement still has (empty = fine): seeds in one pool or meeting
 * too early, and same-club entries sharing a pool / first KO match.
 */
export function analyzePlacement(pools, meta, template, directKo) {
  const byId = new Map(meta.map((m) => [m.id, m]));
  const meetRound = poolMeetingRound(template);
  const warnings = [];

  const seeds = [];
  pools.forEach((p, i) => p.forEach((id) => { if (byId.get(id)?.seed) seeds.push({ ...byId.get(id), pool: i }); }));
  seeds.sort((a, b) => a.seed - b.seed);
  const ideal = idealSeedRound(seeds.length);
  for (let i = 0; i < seeds.length; i += 1) {
    for (let j = i + 1; j < seeds.length; j += 1) {
      const a = seeds[i];
      const b = seeds[j];
      if (a.pool === b.pool) warnings.push(`Nositelji ${a.seed} i ${b.seed} su u istom poolu.`);
      else if (meetRound(a.pool, b.pool) > ideal) {
        warnings.push(`Nositelji ${a.seed} i ${b.seed} mogu se sresti prerano (${roundLabel(meetRound(a.pool, b.pool))}).`);
      }
    }
  }

  const groups = directKo
    ? firstRoundPairs(template).map(([a, b]) => [...(pools[a] ?? []), ...(pools[b] ?? [])])
    : pools;
  groups.forEach((g, i) => {
    const byClub = new Map();
    for (const id of g) {
      const club = byId.get(id)?.club;
      if (club) byClub.set(club, [...(byClub.get(club) ?? []), id]);
    }
    for (const [club, ids] of byClub) {
      if (ids.length > 1) {
        warnings.push(directKo
          ? `Isti klub (${club}) u prvoj KO borbi.`
          : `Pool ${i + 1}: ${ids.length} iz kluba ${club}.`);
      }
    }
  });
  return warnings;
}

const roundLabel = (r) => ({ 1: 'finale', 2: 'polufinale', 3: 'četvrtfinale', 4: 'osmina finala' }[r] ?? `kolo ${r}`);

/** Cost to minimize: seeds first (much heavier), then same-club pairs. */
function cost(pools, byId, meetRound, ideal, clubGroups) {
  let c = 0;
  const seeds = [];
  pools.forEach((p, i) => p.forEach((id) => { if (byId.get(id).seed) seeds.push(i); }));
  for (let i = 0; i < seeds.length; i += 1) {
    for (let j = i + 1; j < seeds.length; j += 1) {
      if (seeds[i] === seeds[j]) c += 10000;
      else c += 1000 * Math.max(0, meetRound(seeds[i], seeds[j]) - ideal);
    }
  }
  for (const g of clubGroups(pools)) {
    const counts = new Map();
    for (const id of g) {
      const { club } = byId.get(id);
      if (club) counts.set(club, (counts.get(club) ?? 0) + 1);
    }
    for (const n of counts.values()) c += (n * (n - 1)) / 2;
  }
  return c;
}

/**
 * Place entries into pools of the given sizes following the rules above.
 * Deterministic for a given seed.
 */
export function placeEntries(meta, sizes, template, directKo, seed) {
  const byId = new Map(meta.map((m) => [m.id, m]));
  const meetRound = poolMeetingRound(template);
  const seedCount = meta.filter((m) => m.seed).length;
  const ideal = idealSeedRound(seedCount);
  const pairs = firstRoundPairs(template);
  const clubGroups = directKo
    ? (pools) => pairs.map(([a, b]) => [...(pools[a] ?? []), ...(pools[b] ?? [])])
    : (pools) => pools;

  let best = null;
  let bestCost = Infinity;
  for (let attempt = 0; attempt < ATTEMPTS && bestCost > 0; attempt += 1) {
    const rng = seededRandom((seed + attempt * 7919) >>> 0);
    const pools = sizes.map(() => []);

    // 1. seeds, best seed first: the pool meeting the placed seeds latest.
    const seeds = shuffle(meta.filter((m) => m.seed), rng).sort((a, b) => a.seed - b.seed);
    const seedPools = [];
    for (const s of seeds) {
      const open = shuffle(sizes.map((_, i) => i), rng).filter((i) => pools[i].length < sizes[i]);
      const score = (i) => seedPools.reduce((worst, q) => Math.max(worst, i === q ? 99 : meetRound(i, q)), 0);
      const target = open.reduce((a, b) => (score(b) < score(a) ? b : a));
      pools[target].push(s.id);
      seedPools.push(target);
    }

    // 2. the rest at random, then swap pairs while it reduces same-club pairs.
    const rest = shuffle(meta.filter((m) => !m.seed).map((m) => m.id), rng);
    pools.forEach((p, i) => { while (p.length < sizes[i]) p.push(rest.shift()); });

    let current = cost(pools, byId, meetRound, ideal, clubGroups);
    let improved = true;
    while (improved && current > 0) {
      improved = false;
      for (let a = 0; a < pools.length; a += 1) {
        for (let b = a + 1; b < pools.length; b += 1) {
          for (let i = 0; i < pools[a].length; i += 1) {
            for (let j = 0; j < pools[b].length; j += 1) {
              if (byId.get(pools[a][i]).seed || byId.get(pools[b][j]).seed) continue;
              [pools[a][i], pools[b][j]] = [pools[b][j], pools[a][i]];
              const next = cost(pools, byId, meetRound, ideal, clubGroups);
              if (next < current) { current = next; improved = true; }
              else [pools[a][i], pools[b][j]] = [pools[b][j], pools[a][i]];
            }
          }
        }
      }
    }

    if (current < bestCost) {
      bestCost = current;
      best = pools.map((p) => shuffle(p, rng)); // random fight positions inside a pool
    }
  }
  return best;
}
