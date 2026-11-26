// Rules for KO templates (owner, 2026-11-26). Every template must pass the
// hard rules; the soft ones are kept as low as the number of qualifiers allows.
//   hard 1. structure: every qualifier once, every winner goes on once (validateTemplate)
//   hard 2. two qualifiers of the same pool meet only in the final
//   hard 3. seeds — 1st places of pool 1, the last pool and the two middle pools
//           (odd: middle + the one after) — meet no earlier than the semifinal
//   soft 4. preliminary fights for 2nd places (1st places get the byes), and the
//           seeds get a bye whenever the numbers allow (pool 1's winner first)
//   soft 5. few 1st-vs-1st first meetings; 2nd vs 2nd only in preliminary fights
//   soft 6. winners of pool 1 and the last pool meet only in the final (top and
//           bottom of the bracket, the middle pools in the middle)

import { isWinnerRef, leaves, matchRounds, poolCode, validateTemplate } from './ko.js';

/** Pools whose winners are the seeds (the draw puts the strongest there). */
export const seedPools = (pools) => (pools <= 4 ? [...Array(pools)].map((_, i) => i + 1)
  : [1, ...(pools % 2 ? [(pools + 1) / 2, (pools + 1) / 2 + 1] : [pools / 2, pools / 2 + 1]), pools]);

/** Lower bounds given by the number of qualifiers (bracket of 2^k with preliminary fights). */
export function unavoidable(pools, advancing) {
  const n = pools * advancing;
  let size = 1;
  while (size < n) size *= 2;
  const prelims = n === size ? 0 : n - size / 2;
  const others = pools - seedPools(pools).length; // 1st places that are not seeds
  if (advancing < 2) return { prelims, firstsInPrelims: 0, firstVsFirst: 0, seedsInPrelims: Math.max(0, 2 * prelims - others) };
  const firstsInPrelims = Math.max(0, 2 * prelims - pools);
  const mainFights = (prelims ? size / 2 : size) / 2;
  return {
    prelims, firstsInPrelims, firstVsFirst: Math.max(0, pools - firstsInPrelims - mainFights),
    seedsInPrelims: Math.max(0, firstsInPrelims - others),
  };
}

/**
 * Check a template: { problems: [hard rule broken], counts, bounds, ok }.
 * counts: firstsInPrelims, firstVsFirst (leaf against leaf), secondVsSecondMain.
 */
export function checkKoRules(template, pools, advancing) {
  const problems = validateTemplate(template, pools, advancing);
  const counts = { firstsInPrelims: 0, firstVsFirst: 0, secondVsSecondMain: 0, seedsInPrelims: 0, firstAndLastBeforeFinal: 0 };
  const bounds = unavoidable(pools, advancing);
  if (problems.length || template.length === 0) return { problems, counts, bounds, ok: !problems.length };
  const byNo = new Map(template.map((m) => [m.no, m]));
  const rounds = matchRounds(template);
  const meet = new Map();
  for (const m of template) {
    for (const a of leaves(m.red, byNo)) for (const b of leaves(m.white, byNo)) {
      meet.set(`${a}|${b}`, rounds.get(m.no));
      meet.set(`${b}|${a}`, rounds.get(m.no));
    }
  }
  const roundName = (r) => ({ 1: 'final', 2: 'semifinal', 3: 'quarterfinal' }[r] ?? `round ${r}`);
  if (advancing >= 2) {
    for (let p = 1; p <= pools; p += 1) {
      const r = meet.get(`${poolCode(p, 1)}|${poolCode(p, 2)}`);
      if (r !== 1) problems.push(`Pool ${p}: 1st and 2nd can meet in the ${roundName(r)}`);
    }
  }
  const seeds = seedPools(pools);
  const latest = seeds.length <= 2 ? 1 : 2;
  for (let i = 0; i < seeds.length; i += 1) {
    for (let j = i + 1; j < seeds.length; j += 1) {
      const r = meet.get(`${poolCode(seeds[i], 1)}|${poolCode(seeds[j], 1)}`);
      if (r > latest) problems.push(`Seeds P${seeds[i]}.1 and P${seeds[j]}.1 can meet in the ${roundName(r)}`);
    }
  }
  if (pools >= 3 && meet.get(`${poolCode(1, 1)}|${poolCode(pools, 1)}`) !== 1) counts.firstAndLastBeforeFinal = 1;
  const maxRound = Math.max(...rounds.values());
  for (const m of template) {
    const lf = [m.red, m.white].filter((c) => !isWinnerRef(c));
    const prelim = bounds.prelims > 0 && rounds.get(m.no) === maxRound;
    if (prelim) counts.seedsInPrelims += lf.filter((c) => c.endsWith('1') && seeds.includes(Number(c.slice(0, 2)))).length;
    if (advancing < 2) continue;
    if (prelim) counts.firstsInPrelims += lf.filter((c) => c.endsWith('1')).length;
    if (lf.length === 2 && lf.every((c) => c.endsWith('1'))) counts.firstVsFirst += 1;
    if (!prelim && lf.length === 2 && lf.every((c) => c.endsWith('2'))) counts.secondVsSecondMain += 1;
  }
  const best = counts.firstsInPrelims <= bounds.firstsInPrelims
    && counts.firstVsFirst <= bounds.firstVsFirst && counts.secondVsSecondMain === 0
    && counts.seedsInPrelims <= bounds.seedsInPrelims && counts.firstAndLastBeforeFinal === 0;
  return { problems, counts, bounds, ok: problems.length === 0, best };
}
