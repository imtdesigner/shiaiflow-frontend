// Draw for one category: shuffle → pools → pool matches → KO template.
// Pure function; the page saves the result to the database.

import { seededRandom, shuffle, splitEvenly, poolMatches, systemCode } from './pools.js';
import { getTemplate, validateTemplate, poolCode } from './ko.js';

/**
 * Random draw: shuffle the entries and split them into even pools.
 * @param {string[]} entryIds checked-in entries
 * @param {{ poolSize: number, advancing: number }} settings
 * @param {number} seed reproducible random seed
 * @returns {{
 *   seed, pools: string[][], poolMatches: object[], koCode: string|null,
 *   koTemplate: object[]|null, problems: string[], directKo: boolean
 * }}
 */
export function buildDraw(entryIds, settings, seed) {
  const order = shuffle(entryIds, seededRandom(seed));
  return drawFromPools(splitEvenly(order, settings.poolSize), settings, seed);
}

/**
 * Pool matches, KO template and problems for given pools — used for the random
 * draw and again after the organizer edits the pools by hand (seed = null).
 */
export function drawFromPools(pools, { poolSize, advancing }, seed = null) {
  const problems = [];
  const directKo = poolSize === 1;
  const count = pools.reduce((n, p) => n + p.length, 0);

  if (count < 2) problems.push('Za ždrijeb trebaju barem 2 prijave.');
  pools.forEach((p, i) => {
    if (p.length === 0) problems.push(`Pool ${i + 1} je prazan.`);
    else if (!directKo && p.length === 1 && pools.length > 1) {
      problems.push(`Pool ${i + 1} ima samo jednog natjecatelja — promijeni veličinu poola.`);
    } else if (!directKo && p.length > MAX_POOL) {
      problems.push(`Pool ${i + 1} ima više od ${MAX_POOL} natjecatelja.`);
    }
  });
  if (!directKo && advancing > 0 && pools.some((p) => p.length > 0 && p.length < advancing)) {
    problems.push(`Neki pool ima manje od ${advancing} natjecatelja za prolaz.`);
  }

  const koNotPossible = count === SMALL_NO_KO && !(pools.length === 1 && advancing === 0);
  if (koNotPossible) {
    problems.push('S 3 sudionika nema KO-a: svatko sa svakim, prebaci ih u jaču kategoriju ili poništi kategoriju.');
  }

  const matches = directKo ? [] : pools.flatMap((members, i) => (
    members.length <= MAX_POOL ? poolMatches(members, i + 1) : []
  ));

  let koCode = null;
  let koTemplate = null;
  const adv = directKo ? 1 : advancing;
  if (!koNotPossible && adv > 0 && pools.length * adv >= 2) {
    koCode = systemCode(pools.length, adv);
    koTemplate = getTemplate(koCode);
    if (!koTemplate) {
      problems.push(`KO sustav ${koCode} ne postoji u biblioteci — treba ga dodati ili promijeniti veličinu poola.`);
    } else {
      problems.push(...validateTemplate(koTemplate, pools.length, adv).map((p) => `${koCode}: ${p}`));
    }
  }

  return { seed, pools, poolMatches: matches, koCode, koTemplate, problems, directKo };
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
