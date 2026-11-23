// Final results of a category (owner, 2026-11-23): 1st, 2nd, 3rd, 3rd (shared
// third place) or 3rd and 4th (fight for 3rd), and for every entry how far it
// got (1st / 2nd / 3rd / 1/4 final / 1/8 final / pool / still fighting) — shown
// in the Fighting spirit pick and on the printed results.

import { matchRounds, roundShort, thirdPlaceFight } from './ko.js';

const ORD = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };
export const placeLabel = (p) => ORD[p] ?? `${p}th`;

const loserOf = (f) => (f?.winner_entry_id
  ? (f.winner_entry_id === f.red_entry_id ? f.white_entry_id : f.red_entry_id)
  : null);
const done = (f) => f?.status === 'finished' && !!f.winner_entry_id;

/**
 * category: { ko_template, third_place, advancing, pool_size };
 * fights: every fight of the category ({ phase, ko_no, status, red_entry_id,
 * white_entry_id, winner_entry_id, pool_id }); pools: [{ id, number,
 * pool_entries: [{ entry_id, final_place }] }]; entryIds: every entry drawn.
 * Returns { places: [{ place, entryId }], finished, stage: Map(entryId → label) }.
 */
export function categoryResults(category, fights, pools = [], entryIds = []) {
  const template = category?.ko_template ?? [];
  const hasKo = template.length > 0 && (category.pool_size === 1 || (category.advancing ?? 0) > 0);
  const ko = fights.filter((f) => f.phase === 'ko');
  const byNo = new Map(ko.map((f) => [f.ko_no, f]));
  const finished = fights.length > 0 && fights.every((f) => f.status === 'finished');
  const places = [];

  if (hasKo) {
    const final = byNo.get(template[template.length - 1].no);
    places.push({ place: 1, entryId: done(final) ? final.winner_entry_id : null });
    places.push({ place: 2, entryId: done(final) ? loserOf(final) : null });
    const rounds = matchRounds(template);
    const semis = template.filter((m) => rounds.get(m.no) === 2).map((m) => byNo.get(m.no));
    const bronze = category.third_place === 'fight' ? thirdPlaceFight(template) : null;
    if (bronze) {
      const f = byNo.get(bronze.no);
      places.push({ place: 3, entryId: done(f) ? f.winner_entry_id : null });
      places.push({ place: 4, entryId: done(f) ? loserOf(f) : null });
    } else {
      for (const s of semis) places.push({ place: 3, entryId: done(s) ? loserOf(s) : null });
    }
  } else if (pools.length === 1) {
    // pools only (round robin): the pool's places
    const ranked = [...pools[0].pool_entries].filter((pe) => pe.final_place).sort((a, b) => a.final_place - b.final_place);
    for (let p = 1; p <= Math.min(3, pools[0].pool_entries.length); p += 1) {
      places.push({ place: p, entryId: ranked.find((pe) => pe.final_place === p)?.entry_id ?? null });
    }
  }

  // how far each entry got
  const rounds = matchRounds(template);
  const stage = new Map();
  for (const { place, entryId } of places) if (entryId) stage.set(entryId, placeLabel(place));
  const open = (id) => fights.some((f) => f.status !== 'finished' && (f.red_entry_id === id || f.white_entry_id === id));
  const poolOf = new Map();
  for (const p of pools) for (const pe of p.pool_entries ?? []) poolOf.set(pe.entry_id, pe);
  for (const id of entryIds) {
    if (stage.has(id)) continue;
    const lost = ko.find((f) => done(f) && loserOf(f) === id && rounds.has(f.ko_no));
    if (lost) { stage.set(id, roundShort(rounds.get(lost.ko_no))); continue; }
    const pe = poolOf.get(id);
    if (hasKo && category.pool_size !== 1 && pe?.final_place && pe.final_place > (category.advancing ?? 0)) { stage.set(id, 'pool'); continue; }
    if (!hasKo && pe?.final_place) { stage.set(id, `pool ${placeLabel(pe.final_place)}`); continue; }
    stage.set(id, open(id) || !finished ? 'still fighting' : 'pool');
  }
  return { places, finished, stage };
}

/**
 * Fighting spirit of a category: the organizer's pick, else the one proposal
 * of the tables (skips ignored), else none. Returns { competitorId, from }
 * with from 'organizer' | 'table' | null, plus the distinct proposals.
 */
export function fightingSpirit(category, proposals = []) {
  const picks = [...new Set(proposals.filter((p) => p.category_id === category.id && p.competitor_id).map((p) => p.competitor_id))];
  if (category.fighting_spirit_competitor_id) return { competitorId: category.fighting_spirit_competitor_id, from: 'organizer', picks };
  if (picks.length === 1) return { competitorId: picks[0], from: 'table', picks };
  return { competitorId: null, from: null, picks };
}

/**
 * The table's last fight of a category on its shiaijo is over: every fight of
 * that category on this court is finished (none still to come here).
 */
export function lastFightOnCourt(fights, categoryId, court) {
  const here = fights.filter((f) => f.category_id === categoryId && f.shiaijo === court);
  return here.length > 0 && here.every((f) => f.status === 'finished');
}
