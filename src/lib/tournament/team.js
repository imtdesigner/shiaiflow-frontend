// Team matches (port of team_ADULT / team_juniors logic).
// A team match has one bout per position plus an optional daihyōsen.
// Winner: more bout wins → more ippons → otherwise daihyōsen decides.

import { boutResult } from './scoring.js';

export const POSITIONS = {
  3: ['senpo', 'chuken', 'taisho'],
  5: ['senpo', 'jiho', 'chuken', 'fukusho', 'taisho'],
};
export const POSITION_LABELS = {
  senpo: 'Senpō', jiho: 'Jihō', chuken: 'Chūken', fukusho: 'Fukushō', taisho: 'Taishō', daihyosen: 'Daihyōsen',
};

/**
 * @param bouts [{ position, bout }] — position bouts, optionally one with position 'daihyosen'
 * Returns { redWins, whiteWins, redIppons, whiteIppons, winner, needsDaihyosen }
 */
export function teamMatchResult(bouts, scoringOptions) {
  let redWins = 0; let whiteWins = 0; let redIppons = 0; let whiteIppons = 0;
  let daihyosen = null;
  for (const b of bouts) {
    if (b.position === 'daihyosen') { daihyosen = b; continue; }
    const r = boutResult(b.bout, scoringOptions);
    redIppons += r.redIppons; whiteIppons += r.whiteIppons;
    if (r.winner === 'red') redWins += 1;
    if (r.winner === 'white') whiteWins += 1;
  }
  let winner = null;
  if (redWins !== whiteWins) winner = redWins > whiteWins ? 'red' : 'white';
  else if (redIppons !== whiteIppons) winner = redIppons > whiteIppons ? 'red' : 'white';
  else if (daihyosen) winner = boutResult(daihyosen.bout, scoringOptions).winner;
  return {
    redWins, whiteWins, redIppons, whiteIppons,
    winner,
    needsDaihyosen: winner === null,
  };
}

/**
 * Team match for a display: one row per position (3 or 5, + daihyosen when
 * it exists), in order. `bouts` = rows of the bouts table, `events` = score
 * events with bout_id. Lineups count as known once every position has a bout
 * row — the table writes them all when it confirms both lineups (an empty
 * position is a row with one side missing, already won by fusen).
 * Returns { ready, rows: [{ position, bout, events, status, result }], current, totals }.
 */
export function teamBoard(teamSize, bouts, events, options) {
  const positions = POSITIONS[teamSize === 5 ? 5 : 3];
  const byPos = new Map(bouts.map((b) => [b.position, b]));
  const ready = positions.every((p) => byPos.has(p));
  const order = byPos.has('daihyosen') ? [...positions, 'daihyosen'] : positions;
  const rows = order.map((position) => {
    const bout = byPos.get(position) ?? null;
    const evs = bout ? events.filter((e) => e.bout_id === bout.id) : [];
    const record = { events: evs, decision: bout?.decision ?? null, fusen: bout?.fusen ?? null, encho: !!bout?.is_encho };
    return {
      position,
      bout,
      events: evs,
      status: bout?.status ?? 'scheduled',
      result: boutResult(record, options),
    };
  });
  const current = rows.find((r) => r.status === 'running')?.position ?? null;
  const totals = teamMatchResult(
    rows.filter((r) => r.bout && r.status === 'finished').map((r) => ({
      position: r.position, bout: { events: r.events, decision: r.bout.decision, fusen: r.bout.fusen, encho: !!r.bout.is_encho },
    })),
    options,
  );
  return { ready, rows, current, totals };
}

/** Positions that may stay empty (owner, 2026-11-19): 3-team the chuken, 5-team the jiho or fukusho. */
export const EMPTY_ALLOWED = { 3: ['chuken'], 5: ['jiho', 'fukusho'] };
const sizeOf = (teamSize) => (teamSize === 5 ? 5 : 3);

/**
 * Lineup proposed to the table: the order of the team's previous match in
 * this category if there is one, else the registration order (sort_order =
 * position); a short team leaves the allowed positions empty. members = [{ competitor_id, sort_order }]; previous =
 * { position: competitor_id } or null. Returns { position: competitor_id | null }.
 */
export function defaultLineup(teamSize, members, previous = null) {
  const positions = POSITIONS[sizeOf(teamSize)];
  const ids = new Set(members.map((m) => m.competitor_id));
  if (previous && positions.every((p) => previous[p] === null || ids.has(previous[p]))) {
    return Object.fromEntries(positions.map((p) => [p, previous[p] ?? null]));
  }
  const sorted = [...members].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  // fewer members than positions: leave the allowed spots empty (fukusho before jiho), fill the rest in order
  const missing = Math.max(0, positions.length - sorted.length);
  const empty = new Set([...EMPTY_ALLOWED[sizeOf(teamSize)]].reverse().slice(0, missing));
  const filled = positions.filter((p) => !empty.has(p));
  return Object.fromEntries(positions.map((p) => [p, empty.has(p) ? null : sorted[filled.indexOf(p)]?.competitor_id ?? null]));
}

/** What is wrong with a lineup (empty list = it can be confirmed). */
export function lineupProblems(teamSize, lineup, memberIds) {
  const positions = POSITIONS[sizeOf(teamSize)];
  const allowed = EMPTY_ALLOWED[sizeOf(teamSize)];
  const problems = [];
  const seen = new Set();
  for (const p of positions) {
    const id = lineup?.[p] ?? null;
    if (!id) {
      if (!allowed.includes(p)) problems.push(`${POSITION_LABELS[p]} cannot stay empty (only ${allowed.map((x) => POSITION_LABELS[x]).join(' or ')}).`);
      continue;
    }
    if (memberIds && !memberIds.includes(id)) problems.push(`${POSITION_LABELS[p]}: not a member of this team.`);
    if (seen.has(id)) problems.push(`${POSITION_LABELS[p]}: the same fighter is already in the lineup.`);
    seen.add(id);
  }
  return problems;
}

/**
 * Bout rows for two confirmed lineups. An empty position is won by the
 * other side as fusen and is finished at once (both empty: finished, a draw).
 */
export function boutRows(teamSize, red, white) {
  return POSITIONS[sizeOf(teamSize)].map((position) => {
    const r = red[position] ?? null;
    const w = white[position] ?? null;
    const empty = !r || !w;
    return {
      position,
      red_competitor_id: r,
      white_competitor_id: w,
      status: empty ? 'finished' : 'scheduled',
      fusen: r && !w ? 'red' : w && !r ? 'white' : null,
    };
  });
}

/** Lineup a team used in a match: { position: competitor_id } for that side. */
export function lineupOf(bouts, side) {
  return Object.fromEntries(bouts.filter((b) => b.position !== 'daihyosen')
    .map((b) => [b.position, side === 'red' ? b.red_competitor_id : b.white_competitor_id]));
}

/**
 * What the table does next in a team match (phase 'pool' | 'ko' | 'ipponshobu'):
 *   { step: 'lineup' }               lineups not confirmed yet
 *   { step: 'bout', bout }           the next position bout (or the daihyosen)
 *   { step: 'daihyosen' }            tied: the table picks one fighter per team
 *   { step: 'finish', winner }       winner 'red' | 'white' | null (draw)
 * A tie goes to a daihyosen in the KO, in a pool ipponshobu, and in pools when
 * the category's pool_tie is 'encho'; otherwise the team match is a draw.
 */
export function teamMatchStep(category, phase, bouts, events, options) {
  const order = [...POSITIONS[sizeOf(category?.team_size)], 'daihyosen'];
  const byPos = new Map(bouts.map((b) => [b.position, b]));
  const positionsIn = order.slice(0, -1).filter((p) => byPos.has(p));
  if (phase !== 'ipponshobu' && positionsIn.length === 0) return { step: 'lineup' };
  const open = order.map((p) => byPos.get(p)).find((b) => b && b.status !== 'finished');
  if (open) return { step: 'bout', bout: open };
  const finished = bouts.map((b) => ({
    position: b.position,
    bout: { events: events.filter((e) => e.bout_id === b.id), decision: b.decision, fusen: b.fusen, encho: !!b.is_encho },
  }));
  const r = teamMatchResult(finished, options);
  if (r.winner) return { step: 'finish', winner: r.winner, result: r };
  const daihyosen = phase === 'ko' || phase === 'ipponshobu' || category?.pool_tie === 'encho';
  if (daihyosen && !byPos.has('daihyosen')) return { step: 'daihyosen', result: r };
  return { step: 'finish', winner: null, result: r };
}

/**
 * Result of a finished team match for the pool table: team wins / draws and
 * the ippons of all its bouts. A whole-match fusen counts every position 2–0.
 */
export function teamMatchSummary(match, teamSize, bouts, events, options) {
  if (match.fusen === 'red' || match.fusen === 'white') {
    const n = 2 * sizeOf(teamSize);
    return { winner: match.fusen, redIppons: match.fusen === 'red' ? n : 0, whiteIppons: match.fusen === 'white' ? n : 0 };
  }
  const r = teamMatchResult(bouts.map((b) => ({
    position: b.position,
    bout: { events: events.filter((e) => e.bout_id === b.id), decision: b.decision, fusen: b.fusen, encho: !!b.is_encho },
  })), options);
  return { winner: r.winner, redIppons: r.redIppons, whiteIppons: r.whiteIppons };
}
