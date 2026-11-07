import {
  isWinnerRef, matchRounds, roundShort, slotLabel, winnerRefNo,
} from '../lib/tournament/ko.js';
import './KoBracket.css';

const BOX_W = 152;
const BOX_H = 58;
const GAP_X = 30;
const UNIT = BOX_H + 18;
const HEADER = 26;

const pad = (n) => String(n).padStart(2, '0');

/** Positions: column by round (first round left), rows from the tree order. */
function layout(template) {
  const byNo = new Map(template.map((m) => [m.no, m]));
  const rounds = matchRounds(template);
  const maxRound = Math.max(...rounds.values());
  const pos = new Map();
  let leaf = 0;
  const place = (no) => {
    const m = byNo.get(no);
    const children = [m.red, m.white].filter(isWinnerRef).map(winnerRefNo).filter((c) => byNo.has(c));
    const ys = children.map(place);
    const y = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : (leaf += 1) - 1;
    pos.set(no, { x: (maxRound - rounds.get(no)) * (BOX_W + GAP_X), y: HEADER + y * UNIT, round: rounds.get(no) });
    return y;
  };
  place(template[template.length - 1].no);
  // Matches outside the final's tree (should not happen in valid templates) go below.
  for (const m of template) if (!pos.has(m.no)) pos.set(m.no, { x: 0, y: HEADER + (leaf++) * UNIT, round: rounds.get(m.no) ?? maxRound });
  return { pos, maxRound, height: HEADER + leaf * UNIT, width: maxRound * (BOX_W + GAP_X) - GAP_X };
}

/**
 * Graphical KO bracket. `resolved` maps slot codes to entry ids once known
 * (e.g. direct KO first round); names are shown next to the slot code.
 */
export default function KoBracket({ template, nameOf, resolved = {}, directKo = false }) {
  if (!template?.length) return null;
  const { pos, maxRound, height, width } = layout(template);

  const lines = [];
  for (const m of template) {
    const to = pos.get(m.no);
    [m.red, m.white].forEach((code, side) => {
      if (!isWinnerRef(code)) return;
      const from = pos.get(winnerRefNo(code));
      if (!from) return;
      const x1 = from.x + BOX_W;
      const y1 = from.y + 35; // divider between the two slots
      const x2 = to.x;
      const y2 = to.y + 16 + (side === 0 ? 9.5 : 28.5); // centre of the aka / shiro slot
      const mid = x1 + GAP_X / 2;
      lines.push(<path key={`${m.no}-${side}`} d={`M${x1},${y1} H${mid} V${y2} H${x2}`} />);
    });
  }

  const columns = Array.from({ length: maxRound }, (_, i) => maxRound - i);

  return (
    <div className="ko-bracket-scroll">
      <div className="ko-bracket" style={{ width, height }}>
        {columns.map((r, i) => (
          <div key={r} className="ko-round-title" style={{ left: i * (BOX_W + GAP_X), width: BOX_W }}>{roundShort(r)}</div>
        ))}
        <svg className="ko-lines" width={width} height={height}>{lines}</svg>
        {template.map((m) => {
          const p = pos.get(m.no);
          return (
            <div key={m.no} className="ko-match" style={{ left: p.x, top: p.y, width: BOX_W, height: BOX_H }}>
              <div className="ko-match-head">
                <strong>{pad(m.no)}</strong>
                <span>{roundShort(p.round)}</span>
              </div>
              {[['aka', m.red], ['shiro', m.white]].map(([side, code]) => (
                <div key={side} className={`ko-slot ${side}`}>
                  <span className="ko-code">{slotLabel(code, directKo)}</span>
                  <span className="ko-name">{resolved[code] ? nameOf(resolved[code]) : ''}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
