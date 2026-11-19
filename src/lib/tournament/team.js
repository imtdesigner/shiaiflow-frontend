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
 * events with bout_id. Lineups count as known only when every position has
 * both competitors (they are written once both teams confirmed).
 * Returns { ready, rows: [{ position, bout, events, status, result }], current, totals }.
 */
export function teamBoard(teamSize, bouts, events, options) {
  const positions = POSITIONS[teamSize === 5 ? 5 : 3];
  const byPos = new Map(bouts.map((b) => [b.position, b]));
  const ready = positions.every((p) => byPos.get(p)?.red_competitor_id && byPos.get(p)?.white_competitor_id);
  const order = byPos.has('daihyosen') ? [...positions, 'daihyosen'] : positions;
  const rows = order.map((position) => {
    const bout = byPos.get(position) ?? null;
    const evs = bout ? events.filter((e) => e.bout_id === bout.id) : [];
    const record = { events: evs, decision: bout?.decision ?? null, fusen: bout?.fusen ?? null };
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
      position: r.position, bout: { events: r.events, decision: r.bout.decision, fusen: r.bout.fusen },
    })),
    options,
  );
  return { ready, rows, current, totals };
}
