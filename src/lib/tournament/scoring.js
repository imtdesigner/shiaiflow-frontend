// Scoring of a single bout (FIK Regulations of Kendo Shiai and Shinpan; owner,
// 2026-11-26 — the Excel's HH = 2–0 hantei was replaced by the FIK rules):
//   M K D T = men, kote, dō, tsuki; H = point from the opponent's 2nd hansoku
//   (FIK mark; events of the old stored type 'I' count the same);
//   Ht = hantei: one point for the winner, the points of the fight stay (Art. 7.4);
//   O = fusen-gachi / kiken / injury: the winner gets two points, the loser's
//   points stay valid; in encho the winner gets one point (Art. 32);
//   sosai: at 1–1 a 2nd hansoku committed by both at once is cancelled, the
//   ▲ marks stay (Art. 20.1).
// A bout is a list of events, which keeps order and allows undo.

export const IPPON_TYPES = ['M', 'K', 'D', 'T', 'I']; // I = stored point from the opponent's 2nd hansoku (shown H)
export const IPPON_LABELS = { M: 'Men', K: 'Kote', D: 'Dō', T: 'Tsuki', I: 'Hansoku point' };
export const HANSOKU_POINT = 'H';
export const HANTEI_MARK = 'Ht';
export const FUSEN_MARK = 'O';

/**
 * @typedef {{ side: 'red'|'white', type: 'M'|'K'|'D'|'T'|'I'|'hansoku'|'sosai' }} ScoreEvent
 * @typedef {{ events: ScoreEvent[], encho?: boolean,
 *             decision?: 'red'|'white'|null, fusen?: 'red'|'white'|null }} BoutRecord
 *   decision = hantei winner, fusen = fusen-gachi winner, encho = the bout went to encho
 */

/**
 * Totals for a bout. With `autoHansokuIppon` every second hansoku gives the
 * opponent a point (H), so the scorer only presses "hansoku". `shown` = the ▲
 * marks still on the board: they go when two hansoku turn into a point, they
 * stay after a sosai (FIK recording guide).
 */
export function boutTotals(bout, { autoHansokuIppon = true } = {}) {
  const t = { red: { ippons: [], hansoku: 0, shown: 0 }, white: { ippons: [], hansoku: 0, shown: 0 } };
  for (const e of bout.events ?? []) {
    const other = e.side === 'red' ? 'white' : 'red';
    if (e.type === 'hansoku') {
      t[e.side].hansoku += 1;
      t[e.side].shown += 1;
      if (autoHansokuIppon && t[e.side].hansoku % 2 === 0) {
        t[other].ippons.push(HANSOKU_POINT);
        t[e.side].shown = 0;
      }
    } else if (e.type === 'sosai') {
      for (const s of ['red', 'white']) { t[s].hansoku += 1; t[s].shown += 1; }
    } else if (e.type === 'I') {
      t[e.side].ippons.push(HANSOKU_POINT);
    } else if (IPPON_TYPES.includes(e.type)) {
      t[e.side].ippons.push(e.type);
    } else {
      throw new Error(`Unknown score event type: ${e.type}`);
    }
  }
  return t;
}

/**
 * Side that scored the first point of the bout (shown circled on score
 * sheets and displays), or null. A 2nd hansoku counts as the opponent's point.
 */
export function firstPointSide(bout, { autoHansokuIppon = true } = {}) {
  const hansoku = { red: 0, white: 0 };
  for (const e of bout.events ?? []) {
    if (IPPON_TYPES.includes(e.type)) return e.side;
    if (e.type === 'sosai') { hansoku.red += 1; hansoku.white += 1; }
    if (e.type === 'hansoku') {
      hansoku[e.side] += 1;
      if (autoHansokuIppon && hansoku[e.side] % 2 === 0) return e.side === 'red' ? 'white' : 'red';
    }
  }
  return null;
}

/**
 * Sosai is possible (FIK Art. 20.1): 1–1 and both on an odd number of hansoku,
 * so a hansoku of both at once would give each a point — it is cancelled.
 */
export function canSosai(bout, options = {}) {
  if (options.autoHansokuIppon === false) return false;
  const t = boutTotals(bout, options);
  return t.red.ippons.length === 1 && t.white.ippons.length === 1
    && t.red.hansoku % 2 === 1 && t.white.hansoku % 2 === 1;
}

/**
 * Result of a bout: { winner: 'red'|'white'|null, draw, redIppons, whiteIppons,
 * totals, by? }. More points wins. Hantei on a tie adds one point (Ht) for the
 * winner. Fusen-gachi: the winner gets two points (one in ippon-shobu), the
 * loser keeps the points scored; in encho the winner gets one point.
 * In KO a tie leaves winner null until encho decides.
 */
export function boutResult(bout, options) {
  const t = boutTotals(bout, options);
  let by;
  if (bout.fusen === 'red' || bout.fusen === 'white') {
    const w = t[bout.fusen].ippons;
    const target = bout.encho ? w.length + 1 : Math.max(w.length + 1, options?.ipponShobu ? 1 : 2);
    while (w.length < target) w.push(FUSEN_MARK);
    by = 'fusen';
  } else if (t.red.ippons.length === t.white.ippons.length && (bout.decision === 'red' || bout.decision === 'white')) {
    t[bout.decision].ippons.push(HANTEI_MARK);
    by = 'hantei';
  }
  const r = t.red.ippons.length;
  const w = t.white.ippons.length;
  let winner = null;
  if (by) winner = bout.fusen || bout.decision;
  else if (r > w) winner = 'red';
  else if (w > r) winner = 'white';
  return {
    winner,
    draw: winner === null,
    redIppons: r,
    whiteIppons: w,
    redHansoku: t.red.hansoku,
    whiteHansoku: t.white.hansoku,
    totals: t,
    ...(by ? { by } : {}),
  };
}

/** Marks of one side as shown on the board: ["M", "H", "Ht"], ["O", "O"] … */
export const boutMarks = (bout, side, options) => boutResult(bout, options).totals[side].ippons;

/** Scoring options of a category: auto ippon on the 2nd hansoku, ippon-shobu. */
export const scoringOptions = (category) => ({
  autoHansokuIppon: category?.auto_hansoku_ippon ?? true,
  ipponShobu: category?.fight_system === 'ippon',
});

/** Short text like the score sheet: "MK", "DHt", "OO" … */
export function ipponString(totals, side) {
  return totals[side].ippons.join('');
}
