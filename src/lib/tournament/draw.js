// Draw for one category: shuffle → pools → pool matches → KO template.
// Pure function; the page saves the result to the database.

import { seededRandom, shuffle, splitIntoPools, poolMatches, systemCode } from './pools.js';
import { getTemplate, validateTemplate, poolCode } from './ko.js';

/**
 * @param {string[]} entryIds checked-in entries
 * @param {{ poolSize: number, advancing: number }} settings
 * @param {number} seed reproducible random seed
 * @returns {{
 *   seed, pools: string[][], poolMatches: object[], koCode: string|null,
 *   koTemplate: object[]|null, problems: string[], directKo: boolean
 * }}
 */
export function buildDraw(entryIds, { poolSize, advancing }, seed) {
  const problems = [];
  const order = shuffle(entryIds, seededRandom(seed));
  const directKo = poolSize === 1;
  const pools = splitIntoPools(order, poolSize);

  if (entryIds.length < 2) problems.push('Za ždrijeb trebaju barem 2 prijave.');
  if (!directKo && pools.some((p) => p.length < 2) && pools.length > 1) {
    problems.push('Zadnji pool ima samo jednog natjecatelja — promijeni veličinu poola.');
  }
  if (!directKo && advancing > 0 && pools.some((p) => p.length < advancing)) {
    problems.push(`Neki pool ima manje od ${advancing} natjecatelja za prolaz.`);
  }

  const matches = directKo ? [] : pools.flatMap((members, i) => poolMatches(members, i + 1));

  let koCode = null;
  let koTemplate = null;
  const adv = directKo ? 1 : advancing;
  if (adv > 0 && pools.length * adv >= 2) {
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
