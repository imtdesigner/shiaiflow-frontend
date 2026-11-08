import { useState } from 'react';
import {
  isWinnerRef, matchRounds, roundShort, slotLabel, winnerRefNo,
} from '../lib/tournament/ko.js';
import './KoBracket.css';

const BOX_W = 152;
const BOX_H = 58;
const GAP_X = 30;
const UNIT = BOX_H + 18;
const HEADER = 26;


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
 * One slot. In edit mode: press and drag onto another slot to swap them
 * (pointer events, so mouse and touch both work), or click to type a code.
 */
function Slot({
  side, code, no, directKo, name, editable, editing, over, dragging, onPress, onTyped,
}) {
  const field = side === 'aka' ? 'red' : 'white';
  const [text, setText] = useState(slotLabel(code, directKo));
  if (!editable) {
    return (
      <div className={`ko-slot ${side}`}>
        <span className="ko-code">{slotLabel(code, directKo)}</span>
        <span className="ko-name">{name}</span>
      </div>
    );
  }
  return (
    <div
      className={`ko-slot ${side} editable ${over ? 'over' : ''} ${dragging ? 'dragging' : ''}`}
      data-slot={`${no}|${field}`}
      title="Drag onto another slot to swap, or click to type (P2.1, W03, #5)"
      onPointerDown={(e) => { if (!editing) { setText(slotLabel(code, directKo)); onPress(e, { no, side: field }); } }}
    >
      {editing ? (
        <input
          className="ko-input"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onTyped({ no, side: field }, text);
            if (e.key === 'Escape') onTyped(null);
          }}
          onBlur={() => onTyped({ no, side: field }, text)}
        />
      ) : (
        <>
          <span className="ko-code">{slotLabel(code, directKo)}</span>
          <span className="ko-name">{name}</span>
        </>
      )}
    </div>
  );
}

const slotAt = (x, y) => {
  const el = document.elementFromPoint(x, y)?.closest('[data-slot]');
  if (!el) return null;
  const [no, side] = el.dataset.slot.split('|');
  return { no: Number(no), side };
};
const sameSlot = (a, b) => a && b && a.no === b.no && a.side === b.side;

/**
 * Graphical KO bracket. `resolved` maps slot codes to entry ids once known
 * (e.g. direct KO first round); names are shown next to the slot code.
 * With `onSwap` / `onSet` the slots can be edited (bracket editor).
 */
export default function KoBracket({
  template, nameOf, resolved = {}, directKo = false, onSwap, onSet, thirdPlace = null,
}) {
  const [editing, setEditing] = useState(null);
  const [drag, setDrag] = useState(null); // { from, over, moved }
  if (!template?.length) return null;
  const editable = !!onSwap;

  const press = (e, from) => {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    let state = { from, over: null, moved: false };
    setDrag(state);
    const move = (ev) => {
      const moved = state.moved || Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6;
      state = { ...state, moved, over: moved ? slotAt(ev.clientX, ev.clientY) : null };
      setDrag(state);
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (!state.moved) { setEditing(from); return; }
      const target = slotAt(ev.clientX, ev.clientY);
      if (target && !sameSlot(target, from)) onSwap(from, target);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
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
                <strong>F-{m.no}</strong>
                <span>{roundShort(p.round)}</span>
              </div>
              {[['aka', m.red], ['shiro', m.white]].map(([side, code]) => (
                <Slot
                  key={side}
                  side={side}
                  code={code}
                  no={m.no}
                  directKo={directKo}
                  name={resolved[code] ? nameOf(resolved[code]) : ''}
                  editable={editable}
                  editing={sameSlot(editing, { no: m.no, side: side === 'aka' ? 'red' : 'white' })}
                  over={drag?.moved && sameSlot(drag.over, { no: m.no, side: side === 'aka' ? 'red' : 'white' })}
                  dragging={drag?.moved && sameSlot(drag.from, { no: m.no, side: side === 'aka' ? 'red' : 'white' })}
                  onPress={press}
                  onTyped={(slot, text) => { setEditing(null); if (slot) onSet(slot, text); }}
                />
              ))}
            </div>
          );
        })}
      </div>
      {thirdPlace && (
        <div className="ko-bracket" style={{ width: BOX_W, height: BOX_H + 8, marginTop: '0.75rem' }}>
          <div className="ko-match" style={{ left: 0, top: 0, width: BOX_W, height: BOX_H }}>
            <div className="ko-match-head"><strong>F-{thirdPlace.no}</strong><span>3rd place</span></div>
            {[['aka', thirdPlace.red], ['shiro', thirdPlace.white]].map(([side, code]) => (
              <Slot key={side} side={side} code={code} no={thirdPlace.no} directKo={directKo}
                name={resolved[code] ? nameOf(resolved[code]) : ''} editable={false} onPress={() => {}} onTyped={() => {}} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
