// Pool standings and tie handling (port of the `poolwinner` macro).
//
// Excel order of criteria (two-pass sort):
//   wins ↓, losses ↑, draws ↓, ippons scored ↓, ippons conceded ↑.
// Head-to-head was NOT used in Excel; it is available as an optional criterion.
// Tie on every criterion for a place that matters → ippon-shobu (one deciding
// bout, first ippon wins). Two separate ties at once → the pool is replayed.

import { boutResult } from './scoring.js';

export const DEFAULT_CRITERIA = ['wins', 'losses', 'draws', 'scored', 'conceded'];
const DIRECTION = { wins: -1, losses: 1, draws: -1, scored: -1, conceded: 1 };

/**
 * @param {string[]} members entry ids in the pool
 * @param {{ red: string, white: string, bout: object, kind?: 'pool'|'ipponshobu' }[]} matches
 *        finished matches of this pool (unfinished ones must be left out)
 */
export function poolTable(members, matches, scoringOptions) {
  const rows = new Map(members.map((id) => [id, {
    id, wins: 0, losses: 0, draws: 0, scored: 0, conceded: 0, fought: 0,
  }]));
  for (const m of matches) {
    if (m.kind === 'ipponshobu') continue; // decides a place, not the table
    const res = boutResult(m.bout, scoringOptions);
    const red = rows.get(m.red);
    const white = rows.get(m.white);
    if (!red || !white) continue;
    red.fought += 1; white.fought += 1;
    red.scored += res.redIppons; red.conceded += res.whiteIppons;
    white.scored += res.whiteIppons; white.conceded += res.redIppons;
    if (res.winner === 'red') { red.wins += 1; white.losses += 1; }
    else if (res.winner === 'white') { white.wins += 1; red.losses += 1; }
    else { red.draws += 1; white.draws += 1; }
  }
  return [...rows.values()];
}

function headToHead(a, b, matches, scoringOptions) {
  let score = 0;
  for (const m of matches) {
    if (m.kind === 'ipponshobu') continue;
    const pair = (m.red === a.id && m.white === b.id) || (m.red === b.id && m.white === a.id);
    if (!pair) continue;
    const res = boutResult(m.bout, scoringOptions);
    const winnerId = res.winner === 'red' ? m.red : res.winner === 'white' ? m.white : null;
    if (winnerId === a.id) score -= 1;
    if (winnerId === b.id) score += 1;
  }
  return score;
}

export function compareRows(a, b, criteria = DEFAULT_CRITERIA, matches = [], scoringOptions) {
  for (const c of criteria) {
    if (c === 'headToHead') {
      const h = headToHead(a, b, matches, scoringOptions);
      if (h !== 0) return h;
      continue;
    }
    const d = (a[c] - b[c]) * DIRECTION[c];
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Final ranking of a pool.
 * Returns { table, status, ranking?, ipponshobu?, message? }
 *   status 'incomplete'  – not all pool matches are finished
 *   status 'decided'     – ranking: [first, second, …]
 *   status 'ipponshobu'  – ipponshobu: { place, between: [idA, idB] }
 *   status 'replay'      – two ties at once (Excel: "Ponovi pool")
 * `advancing` limits which places must be clear (1 → only 1st place matters).
 */
export function rankPool({
  members, matches, expectedMatches, advancing = 2,
  criteria = DEFAULT_CRITERIA, scoringOptions,
}) {
  const poolOnly = matches.filter((m) => m.kind !== 'ipponshobu');
  const table = poolTable(members, poolOnly, scoringOptions);
  if (expectedMatches != null && poolOnly.length < expectedMatches) {
    return { table, status: 'incomplete' };
  }
  const sorted = [...table].sort((a, b) => compareRows(a, b, criteria, poolOnly, scoringOptions));

  // Apply finished ippon-shobu bouts: the winner goes above the loser.
  for (const m of matches.filter((x) => x.kind === 'ipponshobu')) {
    const res = boutResult(m.bout, scoringOptions);
    if (!res.winner) continue;
    const win = res.winner === 'red' ? m.red : m.white;
    const lose = res.winner === 'red' ? m.white : m.red;
    const wi = sorted.findIndex((r) => r.id === win);
    const li = sorted.findIndex((r) => r.id === lose);
    if (wi > li) [sorted[wi], sorted[li]] = [sorted[li], sorted[wi]];
    sorted[Math.min(wi, li)].resolvedBy = m.label ?? 'ipponshobu';
  }

  const same = (i) => sorted[i + 1]
    && !sorted[i].resolvedBy && !sorted[i + 1].resolvedBy
    && compareRows(sorted[i], sorted[i + 1], criteria, poolOnly, scoringOptions) === 0;

  // Places that decide qualification: boundaries between place p and p+1 for p ≤ advancing.
  const ties = [];
  for (let p = 0; p < Math.min(advancing, sorted.length - 1); p += 1) if (same(p)) ties.push(p);

  if (ties.length > 1) return { table: sorted, status: 'replay', message: 'Ponovi pool' };
  if (ties.length === 1) {
    const p = ties[0];
    return {
      table: sorted,
      status: 'ipponshobu',
      ipponshobu: { place: p + 1, between: [sorted[p].id, sorted[p + 1].id] },
    };
  }
  return { table: sorted, status: 'decided', ranking: sorted.map((r) => r.id) };
}
