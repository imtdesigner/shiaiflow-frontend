// Draw for one category: shuffle → pools → pool matches → KO template.
// Pure function; the page saves the result to the database.

import { seededRandom, shuffle, splitPools, poolMatches, systemCode } from './pools.js';
import { getTemplate, validateTemplate, poolCode } from './ko.js';
import { analyzePlacement, entryMeta, placeEntries } from './placement.js';

/**
 * Draw: even pools; with clubs/tiers known, tiers 1–3 are kept apart along the KO
 * bracket and same-club entries are spread (placement.js), otherwise random.
 * @param {Array<string | { id, club?, tier? }>} entries checked-in entries
 * @param {{ poolSize: number, advancing: number }} settings
 * @param {number} seed reproducible random seed
 * @returns {{
 *   seed, pools: string[][], poolMatches: object[], koCode: string|null,
 *   koTemplate: object[]|null, problems: string[], directKo: boolean
 * }}
 */
export function buildDraw(entries, settings, seed) {
  const meta = entryMeta(entries);
  const ids = meta.map((m) => m.id);
  const sizes = splitPools(ids, settings.poolSize, settings.split).map((p) => p.length);
  const directKo = settings.poolSize === 1;
  const adv = directKo ? 1 : settings.advancing;
  const code = adv > 0 && sizes.length * adv >= 2 ? systemCode(sizes.length, adv) : null;
  const template = code ? (settings.custom?.code === code ? settings.custom.template : getTemplate(code)) : null;
  const pools = meta.some((m) => m.club || m.tier)
    ? placeEntries(meta, sizes, template, directKo, seed)
    : splitPools(shuffle(ids, seededRandom(seed)), settings.poolSize, settings.split);
  return drawFromPools(pools, settings, seed, meta);
}

/**
 * Pool matches, KO template, problems (block saving) and placement warnings
 * (seeds/clubs, informative) for given pools — used for the random
 * draw and again after the organizer edits the pools by hand (seed = null).
 */
export function drawFromPools(pools, { poolSize, advancing, custom = null }, seed = null, meta = null) {
  const problems = [];
  const directKo = poolSize === 1;
  const count = pools.reduce((n, p) => n + p.length, 0);

  if (count < 2) problems.push('A draw needs at least 2 entries.');
  pools.forEach((p, i) => {
    if (p.length === 0) problems.push(`Pool ${i + 1} is empty.`);
    else if (!directKo && p.length === 1 && pools.length > 1) {
      problems.push(`Pool ${i + 1} has only one competitor — change the pool size.`);
    } else if (!directKo && p.length > MAX_POOL) {
      problems.push(`Pool ${i + 1} has more than ${MAX_POOL} competitors.`);
    }
  });
  if (!directKo && advancing > 0 && pools.some((p) => p.length > 0 && p.length < advancing)) {
    problems.push(`A pool has fewer than ${advancing} competitors to advance.`);
  }

  const koNotPossible = count === SMALL_NO_KO && !(pools.length === 1 && advancing === 0);
  if (koNotPossible) {
    problems.push('No KO with 3 entries: round robin, move them to a stronger category, or cancel the category.');
  }

  const matches = directKo ? [] : pools.flatMap((members, i) => (
    members.length <= MAX_POOL ? poolMatches(members, i + 1) : []
  ));

  let koCode = null;
  let koTemplate = null;
  const adv = directKo ? 1 : advancing;
  if (!koNotPossible && adv > 0 && pools.length * adv >= 2) {
    koCode = systemCode(pools.length, adv);
    // a template edited in the bracket editor wins when it fits this draw
    koTemplate = custom?.code === koCode ? custom.template : getTemplate(koCode);
    if (!koTemplate) {
      problems.push(`KO system ${koCode} is not in the library — add it or change the pool size.`);
    } else {
      problems.push(...validateTemplate(koTemplate, pools.length, adv).map((p) => `${koCode}: ${p}`));
    }
  }

  const warnings = meta ? analyzePlacement(pools, meta, koTemplate, directKo) : [];
  return {
    seed, pools, poolMatches: matches, koCode, koTemplate, problems, warnings, directKo, meta,
  };
}

/** Swap two entries between (or within) pools; returns new pools. */
export function swapEntries(pools, a, b) {
  const next = pools.map((p) => [...p]);
  const find = (id) => {
    const pi = next.findIndex((p) => p.includes(id));
    return [pi, pi < 0 ? -1 : next[pi].indexOf(id)];
  };
  const [pa, ia] = find(a);
  const [pb, ib] = find(b);
  if (pa < 0 || pb < 0) return pools;
  [next[pa][ia], next[pb][ib]] = [next[pb][ib], next[pa][ia]];
  return next;
}

/** Move an entry to the end of another pool; returns new pools. */
export function moveEntry(pools, id, toPool) {
  if (!pools[toPool] || !pools.some((p) => p.includes(id))) return pools;
  const next = pools.map((p) => p.filter((x) => x !== id));
  next[toPool].push(id);
  return next;
}

const MAX_POOL = 8;

// Small categories (owner's rule, 2026-11-07):
//   3 entries → no KO possible: round robin, move everyone to a stronger
//               category, or cancel the category;
//   4 entries → round robin or direct KO.
const SMALL_NO_KO = 3;

/**
 * Draw formats allowed for a small category, as category settings,
 * or null when the normal pool/KO settings apply.
 * @returns {null | Array<{ key: 'roundRobin'|'directKo', poolSize: number, advancing: number }>}
 */
export function smallCategoryFormats(count) {
  const roundRobin = { key: 'roundRobin', poolSize: count, advancing: 0 };
  if (count === 3) return [roundRobin];
  if (count === 4) return [roundRobin, { key: 'directKo', poolSize: 1, advancing: 1 }];
  return null;
}

/**
 * Pool code → entry for a direct KO (pool size 1): pool N's only member is "0N1".
 */
export function directKoQualifiers(pools) {
  return Object.fromEntries(pools.map((p, i) => [poolCode(i + 1, 1), p[0]]));
}

/** New random seed (32-bit). */
export function newSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}
