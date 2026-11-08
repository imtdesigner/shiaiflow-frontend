// Scoring of a single bout.
// Excel stored ippons as letters and counted string length (owner, 2026-11-07):
//   M K D T = men, kote, dō, tsuki; I = ippon from the opponent's 2nd hansoku;
//   HH = hantei (referees' decision), OO = fusen-gachi (no opponent) — both
//   count as a 2–0 win.
// Here a bout is a list of events, which keeps order and allows undo.

export const IPPON_TYPES = ['M', 'K', 'D', 'T', 'I']; // I = ippon awarded for opponent's 2nd hansoku
export const IPPON_LABELS = { M: 'Men', K: 'Kote', D: 'Dō', T: 'Tsuki', I: 'Hansoku ippon' };

/**
 * @typedef {{ side: 'red'|'white', type: 'M'|'K'|'D'|'T'|'H'|'hansoku' }} ScoreEvent
 * @typedef {{ events: ScoreEvent[], hikiwake?: boolean, encho?: boolean,
 *             decision?: 'red'|'white'|null, fusen?: 'red'|'white'|null }} BoutRecord
 *   decision = hantei winner, fusen = fusen-gachi winner
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
      if (autoHansokuIppon && t[e.side].hansoku % 2 === 0) t[other].ippons.push('I');
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
 * More ippons wins (Excel: LEN(E) > LEN(G)). Fusen-gachi (OO) and hantei (HH)
 * on a tie are a 2–0 win. In KO a tie leaves winner null until encho decides.
 */
export function boutResult(bout, options) {
  const special = bout.fusen === 'red' || bout.fusen === 'white' ? { side: bout.fusen, mark: 'O' } : null;
  if (special) return twoNil(special.side, special.mark, undefined, options);
  const t = boutTotals(bout, options);
  if (t.red.ippons.length === t.white.ippons.length && (bout.decision === 'red' || bout.decision === 'white')) {
    return twoNil(bout.decision, 'H', t, options);
  }
  const r = t.red.ippons.length;
  const w = t.white.ippons.length;
  let winner = null;
  if (r > w) winner = 'red';
  else if (w > r) winner = 'white';
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

/** 2–0 win by fusen-gachi (OO) or hantei (HH); 1–0 (O / H) in ippon-shobu. */
function twoNil(side, mark, base, options) {
  const n = options?.ipponShobu ? 1 : 2;
  const marks = Array(n).fill(mark);
  const totals = {
    red: { ippons: side === 'red' ? marks : [], hansoku: base?.red.hansoku ?? 0 },
    white: { ippons: side === 'white' ? [...marks] : [], hansoku: base?.white.hansoku ?? 0 },
  };
  return {
    winner: side,
    draw: false,
    redIppons: side === 'red' ? n : 0,
    whiteIppons: side === 'white' ? n : 0,
    redHansoku: totals.red.hansoku,
    whiteHansoku: totals.white.hansoku,
    totals,
    by: mark === 'O' ? 'fusen' : 'hantei',
  };
}

/** Scoring options of a category: auto ippon on the 2nd hansoku, ippon-shobu. */
export const scoringOptions = (category) => ({
  autoHansokuIppon: category?.auto_hansoku_ippon ?? true,
  ipponShobu: category?.fight_system === 'ippon',
});

/** Short text like the Excel cells: "MK", "D", "HH", "OO" … */
export function ipponString(totals, side) {
  return totals[side].ippons.join('');
}
