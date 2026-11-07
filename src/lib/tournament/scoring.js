// Scoring of a single bout.
// Excel stored ippons as letters (M, K, D, T, H) and counted string length.
// Here a bout is a list of events, which keeps order and allows undo.

export const IPPON_TYPES = ['M', 'K', 'D', 'T', 'H']; // H = ippon awarded for opponent's hansoku
export const IPPON_LABELS = { M: 'Men', K: 'Kote', D: 'Dō', T: 'Tsuki', H: 'Hansoku' };

/**
 * @typedef {{ side: 'red'|'white', type: 'M'|'K'|'D'|'T'|'H'|'hansoku' }} ScoreEvent
 * @typedef {{ events: ScoreEvent[], hikiwake?: boolean, encho?: boolean,
 *             decision?: 'red'|'white'|null }} BoutRecord
 */

/**
 * Totals for a bout. With `autoHansokuIppon` every second hansoku gives the
 * opponent an ippon (H), so the scorer only presses "hansoku".
 */
export function boutTotals(bout, { autoHansokuIppon = true } = {}) {
  const t = { red: { ippons: [], hansoku: 0 }, white: { ippons: [], hansoku: 0 } };
  for (const e of bout.events ?? []) {
    const other = e.side === 'red' ? 'white' : 'red';
    if (e.type === 'hansoku') {
      t[e.side].hansoku += 1;
      if (autoHansokuIppon && t[e.side].hansoku % 2 === 0) t[other].ippons.push('H');
    } else if (IPPON_TYPES.includes(e.type)) {
      t[e.side].ippons.push(e.type);
    } else {
      throw new Error(`Unknown score event type: ${e.type}`);
    }
  }
  return t;
}

/**
 * Result of a bout: { winner: 'red'|'white'|null, draw, redIppons, whiteIppons }.
 * More ippons wins (Excel: LEN(E) > LEN(G)). A referee decision (hantei)
 * overrides a tie. In KO a tie leaves winner null until encho decides.
 */
export function boutResult(bout, options) {
  const t = boutTotals(bout, options);
  const r = t.red.ippons.length;
  const w = t.white.ippons.length;
  let winner = null;
  if (r > w) winner = 'red';
  else if (w > r) winner = 'white';
  else if (bout.decision === 'red' || bout.decision === 'white') winner = bout.decision;
  return {
    winner,
    draw: winner === null,
    redIppons: r,
    whiteIppons: w,
    redHansoku: t.red.hansoku,
    whiteHansoku: t.white.hansoku,
    totals: t,
  };
}

/** Short text like the Excel cells: "MK", "D" … */
export function ipponString(totals, side) {
  return totals[side].ippons.join('');
}
