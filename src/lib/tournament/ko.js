// KO brackets: parse templates, validate them and resolve codes to entries.

import { KO_TEMPLATES } from './koTemplates.data.js';
import { boutResult } from './scoring.js';

/** Parse "04 031 W01" lines into [{ no: 4, red: '031', white: 'W01' }]. */
export function parseTemplate(lines) {
  return lines.map((line, i) => {
    const parts = String(line).trim().split(/\s+/);
    if (parts.length !== 3) throw new Error(`Bad template line ${i + 1}: "${line}"`);
    const [no, red, white] = parts;
    return { no: Number(no), red, white };
  });
}

export function getTemplate(code) {
  const lines = KO_TEMPLATES[code];
  return lines ? parseTemplate(lines) : null;
}

export const isWinnerRef = (code) => /^W\d+$/.test(code);
export const winnerRefNo = (code) => Number(code.slice(1));
/** '052' -> { pool: 5, place: 2 } */
export const parsePoolCode = (code) => ({ pool: Number(code.slice(0, 2)), place: Number(code.slice(2)) });
export const poolCode = (pool, place) => `${String(pool).padStart(2, '0')}${place}`;

/** Leaves (pool codes) under a slot, following W references. */
function leaves(code, byNo) {
  if (!isWinnerRef(code)) return [code];
  const m = byNo.get(winnerRefNo(code));
  return m ? [...leaves(m.red, byNo), ...leaves(m.white, byNo)] : [];
}

/**
 * Structural checks (same as the script that verified the Excel tables):
 * - numbering 1..n, every W points to an earlier match and is used once
 * - every qualifier (pools × advancing) appears exactly once
 * - with 2+ advancing, entries from the same pool sit in opposite halves
 * Returns a list of problems (empty = valid).
 */
export function validateTemplate(matches, poolCount, advancing) {
  const problems = [];
  const byNo = new Map(matches.map((m) => [m.no, m]));
  const expected = new Set();
  for (let p = 1; p <= poolCount; p += 1) for (let a = 1; a <= advancing; a += 1) expected.add(poolCode(p, a));
  const seen = [];
  const usedW = [];
  matches.forEach((m, i) => {
    if (m.no !== i + 1) problems.push(`Match ${i + 1} is numbered ${m.no}`);
    for (const code of [m.red, m.white]) {
      if (isWinnerRef(code)) {
        if (winnerRefNo(code) >= m.no) problems.push(`Match ${m.no}: ${code} is not an earlier match`);
        usedW.push(winnerRefNo(code));
      } else seen.push(code);
    }
  });
  for (const c of expected) if (!seen.includes(c)) problems.push(`Missing qualifier ${c}`);
  for (const c of seen) {
    if (!expected.has(c)) problems.push(`Unexpected qualifier ${c}`);
    if (seen.filter((x) => x === c).length > 1) problems.push(`Qualifier ${c} appears more than once`);
  }
  for (let n = 1; n < matches.length; n += 1) {
    const uses = usedW.filter((x) => x === n).length;
    if (uses !== 1) problems.push(`Winner of match ${n} is used ${uses} times`);
  }
  if (matches.length !== expected.size - 1) {
    problems.push(`${matches.length} matches, expected ${expected.size - 1}`);
  }
  if (advancing >= 2 && matches.length > 0 && problems.length === 0) {
    const final = matches[matches.length - 1];
    const left = new Set(leaves(final.red, byNo));
    for (let p = 1; p <= poolCount; p += 1) {
      if (left.has(poolCode(p, 1)) === left.has(poolCode(p, 2))) {
        problems.push(`Pool ${p}: winner and runner-up are in the same half`);
      }
    }
  }
  return [...new Set(problems)];
}

/**
 * Round of each match counted back from the final:
 * 1 = final, 2 = semi-final, 3 = quarter-final … (preliminaries get the highest number).
 */
export function matchRounds(matches) {
  const byNo = new Map(matches.map((m) => [m.no, m]));
  const round = new Map();
  const visit = (no, r) => {
    round.set(no, r);
    const m = byNo.get(no);
    for (const code of [m.red, m.white]) if (isWinnerRef(code)) visit(winnerRefNo(code), r + 1);
  };
  if (matches.length) visit(matches[matches.length - 1].no, 1);
  return round;
}

export function roundName(round) {
  return { 1: 'Finale', 2: 'Polufinale', 3: 'Četvrtfinale', 4: 'Osmina finala' }[round] ?? `Kolo ${round}`;
}

/**
 * Resolve the bracket with what is known so far.
 * @param matches parsed template
 * @param poolResults Map/obj poolCode -> entryId (from rankPool rankings)
 * @param results Map/obj matchNo -> bout record (finished KO bouts)
 * Returns [{ no, round, redCode, whiteCode, red, white, winner }] with null where unknown.
 */
export function resolveBracket(matches, poolResults, results = {}, scoringOptions) {
  const pr = poolResults instanceof Map ? poolResults : new Map(Object.entries(poolResults));
  const rs = results instanceof Map ? results : new Map(Object.entries(results).map(([k, v]) => [Number(k), v]));
  const rounds = matchRounds(matches);
  const winners = new Map();
  const slot = (code) => (isWinnerRef(code) ? winners.get(winnerRefNo(code)) ?? null : pr.get(code) ?? null);
  return matches.map((m) => {
    const red = slot(m.red);
    const white = slot(m.white);
    let winner = null;
    const bout = rs.get(m.no);
    if (bout && red && white) {
      const res = boutResult(bout, scoringOptions);
      winner = res.winner === 'red' ? red : res.winner === 'white' ? white : null;
    }
    if (winner) winners.set(m.no, winner);
    return { no: m.no, round: rounds.get(m.no), redCode: m.red, whiteCode: m.white, red, white, winner };
  });
}
