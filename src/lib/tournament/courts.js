// Shiaijo plan (owner, 2026-11-07): the director picks the courts of each
// category; when a category has more than one court, its pools are spread
// over them (balanced by fight count; a pool never splits) and each part of
// the KO bracket stays on one court, the final on the first KO court.
// Options: KO on other courts than the pools (categories.ko_shiaijos), and
// finals — or semifinals and finals — of all categories at the end of the
// tournament on the central courts (tournaments.end_block / central_shiaijos).

import { getTemplate, leaves, matchRounds, thirdPlaceFight } from './ko.js';
import { POOL_ORDER, splitPools, systemCode } from './pools.js';

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

const sorted = (list, fallback) => (list?.length ? [...list].sort((a, b) => a - b) : fallback);

/** Court plan of a category: its courts, KO courts and the tournament's end-block options. */
export function courtPlan(category, tournament) {
  const courts = sorted(category?.shiaijos, [1]);
  return {
    courts,
    koCourts: sorted(category?.ko_shiaijos, courts),
    central: sorted(tournament?.central_shiaijos, []),
    endBlock: tournament?.end_block ?? 'none',
  };
}

/**
 * KO fights moved to the end of the tournament: { court: Map, end: Set }.
 * 'finals' → the final on the first central court; 'semis_finals' → also the
 * semifinals, spread over the central courts in bracket order. Without central
 * courts the fights keep their court but are still flagged for the end.
 */
function endBlockCourts(template, base, { central, endBlock }) {
  const court = new Map(base);
  const end = new Set();
  if (!template?.length || endBlock === 'none') return { court, end };
  const rounds = matchRounds(template);
  const byNo = new Map(template.map((m) => [m.no, m]));
  const finalNo = template[template.length - 1].no;
  const order = leaves(`W${finalNo}`, byNo);
  const firstLeaf = (m) => order.indexOf(leaves(m.red, byNo)[0]);
  end.add(finalNo);
  if (central.length) court.set(finalNo, central[0]);
  if (endBlock === 'semis_finals') {
    template.filter((m) => rounds.get(m.no) === 2)
      .sort((a, b) => firstLeaf(a) - firstLeaf(b))
      .forEach((m, i) => {
        end.add(m.no);
        if (central.length) court.set(m.no, central[i % central.length]);
      });
  }
  return { court, end };
}

/**
 * Courts for a draw: { pool: court[] per pool, ko: Map(fightNo → court),
 * end: Set(fightNo) of KO fights played at the end of the tournament }.
 * `plan` is courtPlan(...) or, for short, an array of courts.
 */
export function drawCourts(draw, plan) {
  const p = Array.isArray(plan) || !plan ? courtPlan({ shiaijos: plan }) : plan;
  const { court, end } = endBlockCourts(draw.koTemplate, koCourts(draw.koTemplate, p.koCourts), p);
  // fight for 3rd place: on the final's court, right before it (also in the end block)
  if (draw.thirdPlace && draw.koTemplate?.length) {
    const finalNo = draw.koTemplate[draw.koTemplate.length - 1].no;
    court.set(draw.thirdPlace.no, court.get(finalNo));
    if (end.has(finalNo)) end.add(draw.thirdPlace.no);
  }
  return {
    pool: draw.directKo ? draw.pools.map(() => p.courts[0]) : poolCourts(draw.pools.map((x) => x.length), p.courts),
    ko: court,
    end,
  };
}

/**
 * Expected fights for a category before the draw:
 * [{ phase: 'pool'|'ko'|'final', court, end }]. Used for the time estimate.
 * `plan` is courtPlan(...) or an array of courts.
 */
export function plannedFights(count, { poolSize, advancing, split = 'even', thirdPlace = false }, plan) {
  if (count < 2) return [];
  const p = Array.isArray(plan) || !plan ? courtPlan({ shiaijos: plan }) : plan;
  const sizes = splitPools(Array.from({ length: count }, (_, i) => i), poolSize, split).map((x) => x.length);
  const directKo = poolSize === 1;
  const adv = directKo ? 1 : advancing;
  const template = adv > 0 && sizes.length * adv >= 2 ? getTemplate(systemCode(sizes.length, adv)) : null;
  const bronze = thirdPlace ? thirdPlaceFight(template) : null;
  const courts = drawCourts({ directKo, pools: sizes.map((n) => Array(n)), koTemplate: template, thirdPlace: bronze }, p);
  const fights = [];
  if (!directKo) {
    courts.pool.forEach((court, i) => {
      for (let f = 0; f < fightsInPool(sizes[i]); f += 1) fights.push({ phase: 'pool', court, end: false });
    });
  }
  if (template) {
    const finalNo = template[template.length - 1].no;
    for (const m of template) {
      fights.push({ phase: m.no === finalNo ? 'final' : 'ko', court: courts.ko.get(m.no), end: courts.end.has(m.no) });
    }
    if (bronze) fights.push({ phase: 'ko', court: courts.ko.get(bronze.no), end: courts.end.has(bronze.no) });
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
