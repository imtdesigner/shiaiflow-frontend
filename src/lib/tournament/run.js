// Running fights (owner, 2026-11-07): rules per category and phase, what the
// scoretable may do when time is up, and the order of fights on a court.

import { boutResult } from './scoring.js';
import { isWinnerRef, matchRounds, poolCode, winnerRefNo } from './ko.js';

/**
 * Rules for a fight of this category:
 *   pools: a tie at time is hikiwake or goes to encho (category.pool_tie);
 *   KO (and ipponshobu): no draws — encho;
 *   encho length (null = until the first point) and hantei after encho.
 */
export function fightRules(category, phase) {
  const ko = phase !== 'pool';
  return {
    seconds: phase === 'pool' ? category.pool_fight_seconds : category.ko_fight_seconds,
    tie: ko ? 'encho' : category.pool_tie ?? 'hikiwake',
    enchoSeconds: (ko ? category.ko_encho_seconds : category.pool_encho_seconds) ?? null,
    hantei: !!(ko ? category.ko_hantei : category.pool_hantei),
    ipponshobu: phase === 'ipponshobu', // first point wins, no time limit
  };
}

/** Seconds of a fight: final of the KO uses the final time. */
export const fightSeconds = (category, phase, isFinal) => (
  phase === 'pool' ? category.pool_fight_seconds : isFinal ? category.final_fight_seconds : category.ko_fight_seconds
);

/**
 * Where a fight stands, for the scoretable buttons.
 * @param bout { events, decision?, fusen? }
 * @param rules fightRules(...)
 * @param state { encho: boolean, timeUp: boolean }
 * Returns { winner, over, next } where next is one of
 *   null (keep fighting), 'finish' (result is clear), 'hikiwake', 'encho',
 *   'hantei' (referees decide) or 'encho-or-hantei'.
 * A fight ends at two ippons; in encho or ipponshobu the first point wins.
 */
export function fightStatus(bout, rules, { encho = false, timeUp = false } = {}, scoringOptions) {
  const r = boutResult(bout, scoringOptions);
  if (r.by) return { ...r, over: true, next: 'finish' }; // fusen-gachi / hantei
  const lead = r.winner;
  if (Math.max(r.redIppons, r.whiteIppons) >= 2) return { ...r, over: true, next: 'finish' };
  if ((encho || rules.ipponshobu) && lead) return { ...r, over: true, next: 'finish' };
  if (!timeUp) return { ...r, over: false, next: null };
  if (lead) return { ...r, over: true, next: 'finish' };
  // tie at time
  if (!encho && rules.tie === 'hikiwake') return { ...r, over: true, next: 'hikiwake' };
  if (!encho) return { ...r, over: false, next: 'encho' };
  // encho with a time limit ran out
  return { ...r, over: false, next: rules.hantei ? 'hantei' : 'encho' };
}

/**
 * Order of fights on each court before the tournament starts: categories in
 * their order, fights in draw order; the end-of-tournament block last
 * (semifinals of all categories, then finals).
 */
export function planOrder(fights, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const rounds = new Map(categories.map((c) => [c.id, matchRounds(c.ko_template ?? [])]));
  const order = (f) => byId.get(f.category_id)?.sort_order ?? 0;
  return [...fights].sort((a, b) => {
    if (!!a.end_block !== !!b.end_block) return a.end_block ? 1 : -1;
    if (a.end_block) {
      const ra = rounds.get(a.category_id)?.get(a.ko_no) ?? 0;
      const rb = rounds.get(b.category_id)?.get(b.ko_no) ?? 0;
      if (ra !== rb) return rb - ra;
    }
    return order(a) - order(b) || (a.queue_order ?? 0) - (b.queue_order ?? 0);
  });
}

/** Fights of one court in running order: court_seq once started, plan order otherwise. */
export function courtQueue(fights, categories, court) {
  const mine = fights.filter((f) => f.shiaijo === court);
  if (mine.every((f) => f.court_seq != null)) return [...mine].sort((a, b) => a.court_seq - b.court_seq);
  const planned = planOrder(mine, categories);
  const withSeq = mine.filter((f) => f.court_seq != null).sort((a, b) => a.court_seq - b.court_seq);
  return [...withSeq, ...planned.filter((f) => f.court_seq == null)];
}

/** court_seq for every fight at tournament start: position in its court's plan order (×10, room for inserts). */
export function startSequence(fights, categories) {
  const seq = new Map();
  const courts = [...new Set(fights.map((f) => f.shiaijo))];
  for (const c of courts) planOrder(fights.filter((f) => f.shiaijo === c), categories).forEach((f, i) => seq.set(f.id, (i + 1) * 10));
  return seq;
}

/**
 * Starting a fight further down the queue: the skipped fights (still
 * scheduled, before it) move below it. Returns Map(id → new court_seq) for the
 * fights that change.
 */
export function startOutOfOrder(queue, startedId) {
  const idx = queue.findIndex((f) => f.id === startedId);
  const skipped = queue.slice(0, idx).filter((f) => f.status === 'scheduled');
  if (!skipped.length) return new Map();
  const block = [queue[idx], ...skipped];
  const out = new Map();
  // reuse the seq values of the block in the new order
  const seqs = [...block.map((f) => f.court_seq)].sort((a, b) => a - b);
  block.forEach((f, i) => { if (f.court_seq !== seqs[i]) out.set(f.id, seqs[i]); });
  return out;
}

/** The fight a court should show: the running one, else the first scheduled with both fighters. */
export function currentFight(queue) {
  return queue.find((f) => f.status === 'running')
    ?? queue.find((f) => f.status === 'scheduled' && f.red_entry_id && f.white_entry_id)
    ?? null;
}

/**
 * KO entries from what is known: pool places (Map poolCode → entry id) and
 * winners of finished KO fights. Returns [{ id, red_entry_id, white_entry_id }]
 * for the KO fights whose fighters change (not yet started ones only).
 */
export function koEntries(koFights, poolPlaces) {
  const byNo = new Map(koFights.map((f) => [f.ko_no, f]));
  const slot = (code) => {
    if (!code) return null;
    if (isWinnerRef(code)) return byNo.get(winnerRefNo(code))?.winner_entry_id ?? null;
    return poolPlaces.get(code) ?? null;
  };
  return koFights
    .filter((f) => f.status === 'scheduled')
    .map((f) => ({ id: f.id, red_entry_id: slot(f.red_code), white_entry_id: slot(f.white_code), was: f }))
    .filter((u) => u.red_entry_id !== u.was.red_entry_id || u.white_entry_id !== u.was.white_entry_id)
    .map(({ was, ...u }) => u);
}

/** Pool places as KO slot codes: ranking [first, second, …] of pool n → '0n1', '0n2'. */
export function placesToCodes(poolNumber, ranking, advancing) {
  return ranking.slice(0, advancing).map((id, i) => [poolCode(poolNumber, i + 1), id]);
}
