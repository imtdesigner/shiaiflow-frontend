import { isLoserRef, isWinnerRef, loserRefNo, poolCode, winnerRefNo } from './ko.js';

/**
 * Manager corrections (owner, 2026-11-24). After a pool result, a pool order
 * or a KO result changes, the KO is checked against what is known now:
 *   - a fight not started yet simply gets the right fighters (auto);
 *   - a fight already running or finished with other fighters than it should
 *     have is a conflict — and so is every later fight that took a fighter
 *     from it. The manager replays them (default) or keeps them as fought.
 * A fight kept as fought (`kept_as_fought`) or whose fighters were set by hand
 * (`manual_entries`) counts as it is.
 */

/**
 * @param koFights KO fights of one category (ko_no, red_code, white_code, red_entry_id,
 *   white_entry_id, winner_entry_id, status, kept_as_fought, manual_entries)
 * @param poolPlaces Map slot code ('021') → entry id
 * @returns {{ auto: {id, red_entry_id, white_entry_id}[], conflicts: Conflict[] }}
 *   Conflict = { fight, red, white, cause: 'fighters' | 'earlier', from: number[] }
 *   (red / white = who should fight, null = not known until an earlier fight is fought again)
 */
export function koCheck(koFights, poolPlaces) {
  const fights = [...koFights].sort((a, b) => a.ko_no - b.ko_no);
  const byNo = new Map(fights.map((f) => [f.ko_no, f]));
  const valid = new Map(); // ko_no → true when its result can be trusted
  const auto = [];
  const conflicts = [];

  const slot = (code) => {
    if (!code) return { id: null, from: null };
    if (isWinnerRef(code) || isLoserRef(code)) {
      const no = isWinnerRef(code) ? winnerRefNo(code) : loserRefNo(code);
      const f = byNo.get(no);
      if (!f || f.status !== 'finished' || !valid.get(no) || !f.winner_entry_id) return { id: null, from: valid.get(no) === false ? no : null };
      if (isWinnerRef(code)) return { id: f.winner_entry_id, from: null };
      return { id: f.winner_entry_id === f.red_entry_id ? f.white_entry_id : f.red_entry_id, from: null };
    }
    return { id: poolPlaces.get(code) ?? null, from: null };
  };

  for (const f of fights) {
    if (f.kept_as_fought || f.manual_entries) { valid.set(f.ko_no, true); continue; }
    const r = slot(f.red_code);
    const w = slot(f.white_code);
    if (f.status === 'scheduled') {
      if (r.id !== (f.red_entry_id ?? null) || w.id !== (f.white_entry_id ?? null)) {
        auto.push({ id: f.id, red_entry_id: r.id, white_entry_id: w.id });
      }
      valid.set(f.ko_no, true);
      continue;
    }
    const from = [r.from, w.from].filter((n) => n != null);
    const wrong = (s, cur) => (s.id != null ? s.id !== cur : s.from != null);
    if (wrong(r, f.red_entry_id) || wrong(w, f.white_entry_id)) {
      conflicts.push({ fight: f, red: r.id, white: w.id, cause: from.length ? 'earlier' : 'fighters', from });
      valid.set(f.ko_no, false);
    } else {
      valid.set(f.ko_no, true);
    }
  }
  return { auto, conflicts };
}

/** Pool places (Map code → entry id) from pools with final_place, as the KO slots read them. */
export function poolPlacesMap(pools, advancing, directKoFights = null) {
  const places = new Map();
  if (directKoFights) {
    // direct KO: the first round was filled at the draw
    for (const f of directKoFights) {
      if (!isWinnerRef(f.red_code) && !isLoserRef(f.red_code) && f.red_entry_id) places.set(f.red_code, f.red_entry_id);
      if (!isWinnerRef(f.white_code) && !isLoserRef(f.white_code) && f.white_entry_id) places.set(f.white_code, f.white_entry_id);
    }
    return places;
  }
  for (const p of pools) {
    const ranked = (p.pool_entries ?? []).filter((pe) => pe.final_place).sort((a, b) => a.final_place - b.final_place);
    for (const pe of ranked.slice(0, advancing)) places.set(poolCode(p.number, pe.final_place), pe.entry_id);
  }
  return places;
}

/**
 * Court order for fights to be fought again: right before the first fight not
 * finished on their shiaijo, in KO order. Returns Map id → court_seq.
 */
export function replaySeqs(replayFights, courtFights) {
  const out = new Map();
  const ids = new Set(replayFights.map((f) => f.id));
  const byCourt = new Map();
  for (const f of [...replayFights].sort((a, b) => a.ko_no - b.ko_no)) {
    if (!byCourt.has(f.shiaijo)) byCourt.set(f.shiaijo, []);
    byCourt.get(f.shiaijo).push(f);
  }
  for (const [court, list] of byCourt) {
    const open = courtFights.filter((f) => f.shiaijo === court && !ids.has(f.id) && f.status !== 'finished' && f.court_seq != null);
    const first = open.length ? Math.min(...open.map((f) => f.court_seq)) : Math.max(0, ...courtFights.filter((f) => f.shiaijo === court).map((f) => f.court_seq ?? 0)) + list.length + 1;
    list.forEach((f, i) => out.set(f.id, first - list.length + i));
  }
  return out;
}

/** Ranking order → final places after a manual reorder: [entry ids] → [{ entry_id, final_place }]. */
export const manualPlaces = (order) => order.map((entry_id, i) => ({ entry_id, final_place: i + 1 }));
