// Smart pool placement (owner's rules, 2026-11-07), as organizers did it by
// hand in the Excel — every rule applies "if possible":
//   tiers: 1 last year's champion, 2 runner-up, 3 third place, 4 strong,
//          5 medium, 6 weaker, null not rated;
//   1. tiers 1–3 go to pools whose winners cannot meet before the semifinal
//      (champion and runner-up preferably only in the final);
//   2. tiers 4, 5, 6 are spread evenly over the pools, stronger tiers first;
//   3. same-club entries are kept apart (in a pool; for a direct KO in the
//      first match) by swapping only within the same tier; if that is not
//      enough, the 4/5/6 balance may be dropped (swaps across tiers 4–6 and
//      not rated), tiers 1–3 still only within their tier;
//   4. if it does not work out, draw again — here: many attempts from the
//      same seed, best kept. The organizer fixes the rest by hand.

import { seededRandom, shuffle } from './pools.js';
import { isWinnerRef, leaves, matchRounds, poolCode } from './ko.js';

const ATTEMPTS = 40;

export const TIER_LABELS = {
  1: 'prvak', 2: 'finalist', 3: 'treće mjesto', 4: 'jak', 5: 'srednji', 6: 'slabiji',
};
export const isTopTier = (tier) => tier >= 1 && tier <= 3;

/** Normalize entries: 'id' or { id, club, tier } → { id, club, tier }. */
export function entryMeta(entries) {
  return entries.map((e) => (typeof e === 'string'
    ? { id: e, club: '', tier: null }
    : { id: e.id, club: (e.club ?? '').trim().toUpperCase(), tier: e.tier ?? null }));
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
    for (const a of leaves(m.red, byNo)) {
      for (const b of leaves(m.white, byNo)) {
        meet.set(`${a}|${b}`, rounds.get(m.no));
        meet.set(`${b}|${a}`, rounds.get(m.no));
      }
    }
  }
  return (pa, pb) => meet.get(`${poolCode(pa + 1, 1)}|${poolCode(pb + 1, 1)}`) ?? 0;
}

/** Latest round k top entries can all be kept apart until: 2 → final, 3–4 → semifinal. */
export const idealSeedRound = (k) => (k <= 1 ? 0 : Math.ceil(Math.log2(k)));

/** First-round KO pairs as [poolIndexA, poolIndexB] (direct KO club check). */
function firstRoundPairs(template) {
  if (!template) return [];
  const idx = (code) => Number(code.slice(0, 2)) - 1;
  return template.filter((m) => !isWinnerRef(m.red) && !isWinnerRef(m.white))
    .map((m) => [idx(m.red), idx(m.white)]);
}

const roundLabel = (r) => ({ 1: 'finale', 2: 'polufinale', 3: 'četvrtfinale', 4: 'osmina finala' }[r] ?? `kolo ${r}`);

/** Top-tier entries with their pool, strongest first. */
function topEntries(pools, byId) {
  const out = [];
  pools.forEach((p, i) => p.forEach((id) => {
    const m = byId.get(id);
    if (m && isTopTier(m.tier)) out.push({ ...m, pool: i });
  }));
  return out.sort((a, b) => a.tier - b.tier);
}

/** Groups in which same-club entries should not meet: pools, or first KO matches. */
function clubGroupsFn(template, directKo) {
  if (!directKo) return (pools) => pools;
  const pairs = firstRoundPairs(template);
  return (pools) => pairs.map(([a, b]) => [...(pools[a] ?? []), ...(pools[b] ?? [])]);
}

/**
 * What a placement still breaks (empty = fine): top tiers meeting too early,
 * same-club entries sharing a pool / first KO match. Informative only.
 */
export function analyzePlacement(pools, meta, template, directKo) {
  const byId = new Map(meta.map((m) => [m.id, m]));
  const meetRound = poolMeetingRound(template);
  const warnings = [];

  const top = topEntries(pools, byId);
  const ideal = idealSeedRound(top.length);
  const label = (e) => `${e.tier} (${TIER_LABELS[e.tier]})`;
  for (let i = 0; i < top.length; i += 1) {
    for (let j = i + 1; j < top.length; j += 1) {
      const [a, b] = [top[i], top[j]];
      const r = meetRound(a.pool, b.pool);
      if (a.pool === b.pool) warnings.push(`Nositelji ${label(a)} i ${label(b)} su u istom poolu.`);
      else if (r > ideal) warnings.push(`Nositelji ${label(a)} i ${label(b)} mogu se sresti prerano (${roundLabel(r)}).`);
    }
  }

  clubGroupsFn(template, directKo)(pools).forEach((g, i) => {
    const byClub = new Map();
    for (const id of g) {
      const club = byId.get(id)?.club;
      if (club) byClub.set(club, (byClub.get(club) ?? 0) + 1);
    }
    for (const [club, n] of byClub) {
      if (n > 1) warnings.push(directKo ? `Isti klub (${club}) u prvoj KO borbi.` : `Pool ${i + 1}: ${n} iz kluba ${club}.`);
    }
  });
  return warnings;
}

/** Cost to minimize: top tiers first (much heavier), then same-club pairs. */
function cost(pools, byId, meetRound, clubGroups) {
  let c = 0;
  const top = topEntries(pools, byId);
  const ideal = idealSeedRound(top.length);
  for (let i = 0; i < top.length; i += 1) {
    for (let j = i + 1; j < top.length; j += 1) {
      const [a, b] = [top[i], top[j]];
      const r = meetRound(a.pool, b.pool);
      if (a.pool === b.pool) c += 10000;
      else c += 1000 * Math.max(0, r - ideal);
      if (a.tier === 1 && b.tier === 2 && a.pool !== b.pool && r > 1) c += 100; // preferably only in the final
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

const tierKey = (tier) => tier ?? 99; // not rated = after tier 6

/** Hill climbing: swap entries of different pools while the cost drops. */
function improveBySwaps(pools, allowed, start, evaluate) {
  let current = start;
  let improved = true;
  while (improved && current > 0) {
    improved = false;
    for (let a = 0; a < pools.length; a += 1) {
      for (let b = a + 1; b < pools.length; b += 1) {
        for (let i = 0; i < pools[a].length; i += 1) {
          for (let j = 0; j < pools[b].length; j += 1) {
            if (!allowed(pools[a][i], pools[b][j])) continue;
            [pools[a][i], pools[b][j]] = [pools[b][j], pools[a][i]];
            const next = evaluate();
            if (next < current) { current = next; improved = true; } else {
              [pools[a][i], pools[b][j]] = [pools[b][j], pools[a][i]];
            }
          }
        }
      }
    }
  }
  return current;
}

/**
 * Place entries into pools of the given sizes following the rules above.
 * Deterministic for a given seed.
 */
export function placeEntries(meta, sizes, template, directKo, seed) {
  const byId = new Map(meta.map((m) => [m.id, m]));
  const meetRound = poolMeetingRound(template);
  const clubGroups = clubGroupsFn(template, directKo);

  let best = null;
  let bestCost = Infinity;
  for (let attempt = 0; attempt < ATTEMPTS && bestCost > 0; attempt += 1) {
    const rng = seededRandom((seed + attempt * 7919) >>> 0);
    const pools = sizes.map(() => []);
    const open = () => shuffle(sizes.map((_, i) => i), rng).filter((i) => pools[i].length < sizes[i]);

    // 1. tiers 1–3: the pool whose winner meets the placed ones latest.
    const top = shuffle(meta.filter((m) => isTopTier(m.tier)), rng).sort((a, b) => a.tier - b.tier);
    const topPools = [];
    for (const e of top) {
      const score = (i) => topPools.reduce((worst, q) => Math.max(worst, i === q ? 99 : meetRound(i, q)), 0);
      const target = open().reduce((a, b) => (score(b) < score(a) ? b : a));
      pools[target].push(e.id);
      topPools.push(target);
    }

    // 2. the rest tier by tier: fewest equally-strong-or-stronger, then fewest
    //    from the same club, ties at random.
    const rest = meta.filter((m) => !isTopTier(m.tier));
    const tiers = [...new Set(rest.map((m) => tierKey(m.tier)))].sort((a, b) => a - b);
    for (const t of tiers) {
      for (const e of shuffle(rest.filter((m) => tierKey(m.tier) === t), rng)) {
        const strong = (i) => pools[i].filter((id) => tierKey(byId.get(id).tier) <= t).length;
        const sameClub = (i) => (e.club ? pools[i].filter((id) => byId.get(id).club === e.club).length : 0);
        const target = open().reduce((a, b) => {
          const d = strong(b) - strong(a) || sameClub(b) - sameClub(a);
          return d < 0 ? b : a;
        });
        pools[target].push(e.id);
      }
    }

    // 3. swap within the same tier while it lowers the cost; then, only if
    //    conflicts remain, also across tiers 4–6 / not rated.
    const sameTier = (x, y) => tierKey(byId.get(x).tier) === tierKey(byId.get(y).tier);
    const lowerTiers = (x, y) => !isTopTier(byId.get(x).tier) && !isTopTier(byId.get(y).tier);
    let current = cost(pools, byId, meetRound, clubGroups);
    for (const allowed of [sameTier, (x, y) => sameTier(x, y) || lowerTiers(x, y)]) {
      current = improveBySwaps(pools, allowed, current, () => cost(pools, byId, meetRound, clubGroups));
    }

    if (current < bestCost) {
      bestCost = current;
      best = pools.map((p) => shuffle(p, rng)); // random fight positions inside a pool
    }
  }
  return best;
}
