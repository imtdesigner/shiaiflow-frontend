// Running fights (owner, 2026-11-07): rules per category and phase, what the
// scoretable may do when time is up, and the order of fights on a court.

import { boutResult } from './scoring.js';
import { isLoserRef, isWinnerRef, loserRefNo, matchRounds, poolCode, roundShort, winnerRefNo } from './ko.js';

/**
 * Rules for a fight of this category:
 *   pools: a tie at time is hikiwake or goes to encho (category.pool_tie);
 *   KO (and ipponshobu): no draws — encho;
 *   encho length (null = until the first point) and hantei after encho;
 *   `round` (koRound): with no_hantei_from the final, or semifinals + final,
 *   go to encho until the first point (ippon-shobu) whatever the KO setting.
 */
export function fightRules(category, phase, round = null) {
  const ko = phase !== 'pool';
  const daihyosen = phase === 'daihyosen';
  // no hantei in the final (or semifinals + final): tie → encho until the first point
  const noHantei = (phase === 'ko' || daihyosen) && round != null
    && ((category.no_hantei_from === 'final' && round === 1) || (category.no_hantei_from === 'semifinal' && round <= 2));
  return {
    seconds: phase === 'pool' ? category.pool_fight_seconds : category.ko_fight_seconds,
    tie: ko ? 'encho' : category.pool_tie ?? 'hikiwake',
    enchoSeconds: noHantei ? null
      : (daihyosen ? category.daihyosen_encho_seconds : ko ? category.ko_encho_seconds : category.pool_encho_seconds) ?? null,
    hantei: !noHantei && !!(daihyosen ? category.daihyosen_hantei : ko ? category.ko_hantei : category.pool_hantei),
    ipponshobu: phase === 'ipponshobu', // first point wins, no time limit
    ipponSystem: category.fight_system === 'ippon', // ippon-shobu category: first point wins within the time
  };
}

/**
 * Seconds of a fight. round: KO round (1 final, 2 semifinal, 3 quarterfinal,
 * from matchRounds) or true for the final; a quarter- / semifinal time left
 * empty falls back to the KO time.
 */
export function fightSeconds(category, phase, round) {
  if (phase === 'pool') return category.pool_fight_seconds;
  const r = round === true ? 1 : round;
  if (r === 1) return category.final_fight_seconds ?? category.ko_fight_seconds;
  if (r === 2) return category.sf_fight_seconds ?? category.ko_fight_seconds;
  if (r === 3) return category.qf_fight_seconds ?? category.ko_fight_seconds;
  return category.ko_fight_seconds;
}

/** Lineups, team bow-in and bow-out of a team match (estimate). */
export const TEAM_MATCH_EXTRA_SECONDS = 60;

/**
 * Seconds a whole fight takes, for time estimates: an individual fight = its
 * fight time; a team match = every bout (team size × fight time), a changeover
 * between bouts and TEAM_MATCH_EXTRA_SECONDS (owner, 2026-11-27: 3 × 3 min +
 * 2 × 15 s + 1 min ≈ 10.5 min, not 3 min).
 */
export function teamAwareSeconds(category, boutSeconds, changeover = 15) {
  if (category?.kind !== 'team') return boutSeconds;
  const n = category.team_size ?? 3;
  return n * boutSeconds + (n - 1) * changeover + TEAM_MATCH_EXTRA_SECONDS;
}

/** Estimate of a fight: fight time of its category, phase and KO round; a team match counts all its bouts. */
export const matchSeconds = (category, f, changeover = 15) => teamAwareSeconds(category,
  fightSeconds(category, f.phase === 'ko' ? 'ko' : 'pool', koRound(category, f.ko_no)), changeover);

/** Round label of a KO fight: 1/4 final, 1/2 final, Final, 3rd place. */
export function koRoundLabel(category, koNo) {
  const t = category?.ko_template ?? [];
  if (t.length && koNo === t[t.length - 1].no + 1) return '3rd place';
  return roundShort(matchRounds(t).get(koNo));
}

/** KO round of a fight number (the fight for 3rd place counts as a semifinal). */
export function koRound(category, koNo) {
  const t = category?.ko_template ?? [];
  const r = matchRounds(t).get(koNo);
  if (r) return r;
  return t.length && koNo === t[t.length - 1].no + 1 ? 2 : null;
}

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
  if ((encho || rules.ipponshobu || rules.ipponSystem) && lead) return { ...r, over: true, next: 'finish' };
  if (!timeUp) return { ...r, over: false, next: null };
  if (lead) return { ...r, over: true, next: 'finish' };
  // tie at time
  if (!encho && rules.tie === 'hikiwake') return { ...r, over: true, next: 'hikiwake' };
  if (!encho) return { ...r, over: false, next: 'encho' };
  // encho with a time limit ran out
  return { ...r, over: false, next: rules.hantei ? 'hantei' : 'encho' };
}

/**
 * Order of fights on each court before the tournament starts: by day, then
 * categories in their order, fights in draw order; the end-of-tournament block
 * last each day (semifinals of all categories, then finals).
 */
export function planOrder(fights, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const rounds = new Map(categories.map((c) => [c.id, matchRounds(c.ko_template ?? [])]));
  const order = (f) => byId.get(f.category_id)?.sort_order ?? 0;
  const day = (f) => byId.get(f.category_id)?.day ?? 1;
  return [...fights].sort((a, b) => {
    if (day(a) !== day(b)) return day(a) - day(b); // each day on its own, the end block closes each day
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

/**
 * The fight a court should show: the running one, else the next scheduled in
 * the frozen order — also when a fighter is not known yet (owner, 2026-11-23:
 * the table waits; it skips only on purpose by taking a later fight by hand).
 */
export function currentFight(queue) {
  return queue.find((f) => f.status === 'running')
    ?? queue.find((f) => f.status === 'scheduled')
    ?? null;
}

/** A scheduled fight still waiting for a fighter from an earlier fight. */
export const waitingForFighter = (f) => !!f && f.status === 'scheduled' && (!f.red_entry_id || !f.white_entry_id);

/** Phase of a fight for the screens: "Pool 2", "Pool 2 · Ipponshobu", "1/4 final", "Final", "3rd place". */
export function phaseLabel(category, f) {
  const pool = /^F-P(\d+)\./.exec(f?.label ?? '')?.[1];
  if (f?.phase === 'pool') return pool ? `Pool ${pool}` : 'Pool';
  if (f?.phase === 'ipponshobu') return pool ? `Pool ${pool} · Ipponshobu` : 'Ipponshobu';
  return koRoundLabel(category, f?.ko_no);
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
    if (isLoserRef(code)) {
      const f = byNo.get(loserRefNo(code));
      if (!f?.winner_entry_id) return null;
      return f.winner_entry_id === f.red_entry_id ? f.white_entry_id : f.red_entry_id;
    }
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

/**
 * A category has started once the manager or a table pressed Start category
 * (fights carry `category.started_at`, embedded by listRunFights) or one of its
 * fights started.
 */
export const categoryStarted = (categoryId, fights) => fights.some((f) => f.category_id === categoryId
  && (f.category?.started_at || f.status !== 'scheduled'));

/**
 * What a shiaijo shows (owner, 2026-11-27):
 *   current — the fight in progress or next, only from a started category;
 *   waiting — the category coming next on this shiaijo, not started yet
 *             (screens show "Next: <category>", tables a Start category button);
 *   next — up to `count` following fights of started categories;
 *   nextCategory — the category after them when it has not started (the last "Next" line);
 *   elsewhere — { category, fights } when the category last fought here goes on
 *               on another shiaijo only (e.g. its final): "FINALS on Shiaijo 1".
 * picked: a fight the table took on purpose (Take next).
 */
export function courtView(queue, allFights, { count = 3, picked = null } = {}) {
  const started = new Map();
  const isStarted = (id) => {
    if (!started.has(id)) started.set(id, categoryStarted(id, allFights));
    return started.get(id);
  };
  const open = queue.filter((f) => f.status !== 'finished');
  const first = picked ?? currentFight(queue);
  let current = first;
  let waiting = null;
  if (first && first.status === 'scheduled' && !isStarted(first.category_id)) {
    current = null;
    waiting = first.category_id;
  }
  const next = [];
  let nextCategory = null;
  if (!waiting) {
    for (const f of open) {
      if (f.id === current?.id) continue;
      if (!isStarted(f.category_id)) { nextCategory = f.category_id; break; }
      if (next.length >= count) break;
      next.push(f);
    }
  }
  // the category last fought here, now going on only on other shiaijos
  const court = queue[0]?.shiaijo;
  const lastHere = queue.filter((f) => f.status === 'finished')
    .sort((a, b) => new Date(a.finished_at ?? 0) - new Date(b.finished_at ?? 0)).at(-1);
  let elsewhere = null;
  if (lastHere && !open.some((f) => f.category_id === lastHere.category_id)) {
    const rest = allFights.filter((f) => f.category_id === lastHere.category_id && f.shiaijo !== court && f.status !== 'finished')
      .sort((a, b) => (a.shiaijo - b.shiaijo) || ((a.court_seq ?? 0) - (b.court_seq ?? 0)));
    if (rest.length) elsewhere = { category: lastHere.category_id, fights: rest };
  }
  return { current, waiting, next, nextCategory, elsewhere };
}

/** Heading for fights going on elsewhere: "FINALS on Shiaijo 1" (KO only) or "goes on on Shiaijo 1". */
export function elsewhereTitle(fights) {
  const courts = [...new Set(fights.map((f) => f.shiaijo))].join(' + ');
  const ko = fights.every((f) => f.phase === 'ko' || f.phase === 'daihyosen');
  return ko ? `FINALS on Shiaijo ${courts}` : `goes on on Shiaijo ${courts}`;
}
