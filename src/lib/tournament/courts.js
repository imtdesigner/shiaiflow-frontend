// Shiaijo plan (owner, 2026-11-07): the director picks the courts of each
// category; when a category has more than one court, its pools are spread
// over them (balanced by fight count) and each part of the KO bracket stays on
// one court, the final on the category's first court.

import { getTemplate, leaves } from './ko.js';
import { POOL_ORDER, splitEvenly, systemCode } from './pools.js';

const fightsInPool = (size) => (size >= 2 ? (POOL_ORDER[size]?.length ?? (size * (size - 1)) / 2) : 0);

/** Court per pool: the court with the fewest fights so far (ties → first). */
export function poolCourts(poolSizes, courts) {
  const load = new Map(courts.map((c) => [c, 0]));
  return poolSizes.map((size) => {
    const court = courts.reduce((a, b) => (load.get(b) < load.get(a) ? b : a));
    load.set(court, load.get(court) + fightsInPool(size));
    return court;
  });
}

/**
 * Court per KO fight: the bracket is cut into as many parts as there are
 * courts, in bracket order; a fight goes to the court of its first leaf.
 * The final is on the first court.
 */
export function koCourts(template, courts) {
  const out = new Map();
  if (!template?.length) return out;
  const byNo = new Map(template.map((m) => [m.no, m]));
  const finalNo = template[template.length - 1].no;
  const order = leaves(`W${finalNo}`, byNo); // pool codes in bracket order
  const index = new Map(order.map((code, i) => [code, i]));
  for (const m of template) {
    const first = leaves(m.red, byNo)[0];
    const part = Math.floor(((index.get(first) ?? 0) * courts.length) / Math.max(order.length, 1));
    out.set(m.no, courts[Math.min(part, courts.length - 1)]);
  }
  out.set(finalNo, courts[0]);
  return out;
}

/** Courts for a draw: { pool: court[] per pool, ko: Map(fightNo → court) }. */
export function drawCourts(draw, courts) {
  const list = courts?.length ? [...courts].sort((a, b) => a - b) : [1];
  return {
    pool: draw.directKo ? draw.pools.map(() => list[0]) : poolCourts(draw.pools.map((p) => p.length), list),
    ko: koCourts(draw.koTemplate, list),
  };
}

/**
 * Expected fights for a category before the draw (or from its saved draw):
 * [{ phase: 'pool'|'ko'|'final', court }]. Used for the time estimate.
 */
export function plannedFights(count, { poolSize, advancing }, courts) {
  if (count < 2) return [];
  const list = courts?.length ? [...courts].sort((a, b) => a - b) : [1];
  const sizes = splitEvenly(Array.from({ length: count }, (_, i) => i), poolSize).map((p) => p.length);
  const directKo = poolSize === 1;
  const fights = [];
  if (!directKo) {
    poolCourts(sizes, list).forEach((court, i) => {
      for (let f = 0; f < fightsInPool(sizes[i]); f += 1) fights.push({ phase: 'pool', court });
    });
  }
  const adv = directKo ? 1 : advancing;
  const template = adv > 0 && sizes.length * adv >= 2 ? getTemplate(systemCode(sizes.length, adv)) : null;
  if (template) {
    const courtsByNo = koCourts(template, list);
    const finalNo = template[template.length - 1].no;
    for (const m of template) fights.push({ phase: m.no === finalNo ? 'final' : 'ko', court: courtsByNo.get(m.no) });
  }
  return fights;
}

/** Seconds of fighting per court for a list of fights and the category's fight times. */
export function courtSeconds(fights, { pool_fight_seconds: pool, ko_fight_seconds: ko, final_fight_seconds: final }) {
  const out = new Map();
  for (const f of fights) {
    const s = f.phase === 'pool' ? pool : f.phase === 'final' ? final : ko;
    out.set(f.court, (out.get(f.court) ?? 0) + s);
  }
  return out;
}
