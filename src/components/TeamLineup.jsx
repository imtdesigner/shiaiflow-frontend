import { useEffect, useState } from 'react';
import { EMPTY_ALLOWED, POSITIONS, POSITION_LABELS, lineupProblems } from '../lib/tournament/team.js';

const personName = (c) => (c ? (c.display_name || `${c.last_name}${c.first_name ? ` ${c.first_name}` : ''}`) : '—');

/**
 * Before a team match the table enters both lineups from the teams' papers
 * (prefilled: previous match order, else the registration order) and
 * confirms they were handed in. Only allowed positions may stay empty
 * (3-team chuken, 5-team jiho / fukusho) — that bout is fusen for the other team.
 */
export function LineupPanel({ teamSize, teams, defaults, busy, onConfirm }) {
  const size = teamSize === 5 ? 5 : 3;
  const positions = POSITIONS[size];
  const [lineup, setLineup] = useState(defaults);
  const [handedIn, setHandedIn] = useState(false);
  useEffect(() => { setLineup(defaults); setHandedIn(false); }, [defaults]);
  if (!lineup) return <p className="tp-muted">Loading the teams…</p>;

  const problems = Object.fromEntries(['red', 'white'].map((side) => [side,
    lineupProblems(size, lineup[side], teams[side].members.map((m) => m.competitor_id))]));
  const ok = !problems.red.length && !problems.white.length;
  const set = (side, pos, id) => setLineup({ ...lineup, [side]: { ...lineup[side], [pos]: id || null } });

  return (
    <div className="tl">
      <div className="tl-warning">
        <strong>Team match — lineups first.</strong> Enter the order of both teams from the papers they handed in.
        Nothing is shown publicly until you confirm.
      </div>
      <table className="tp-table tl-table">
        <thead>
          <tr><th>Position</th><th className="tl-red">{teams.red.name}</th><th>{teams.white.name}</th></tr>
        </thead>
        <tbody>
          {positions.map((pos) => (
            <tr key={pos}>
              <td>{POSITION_LABELS[pos]}</td>
              {['red', 'white'].map((side) => (
                <td key={side}>
                  <select value={lineup[side][pos] ?? ''} onChange={(e) => set(side, pos, e.target.value)}>
                    <option value="" disabled={!EMPTY_ALLOWED[size].includes(pos)}>— empty (fusen for the other team) —</option>
                    {teams[side].members.map((m) => (
                      <option key={m.competitor_id} value={m.competitor_id}>{personName(m.competitor)}</option>
                    ))}
                  </select>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!ok && (
        <div className="tl-problems">
          {['red', 'white'].flatMap((side) => problems[side].map((p) => <div key={side + p}>{teams[side].name}: {p}</div>))}
        </div>
      )}
      <label className="tp-check tl-check">
        <input type="checkbox" checked={handedIn} onChange={(e) => setHandedIn(e.target.checked)} />
        Both teams have handed in their lineups
      </label>
      <div className="tp-actions">
        <button type="button" className="tp-btn" disabled={busy || !ok || !handedIn} onClick={() => onConfirm(lineup)}>
          Confirm lineups
        </button>
      </div>
    </div>
  );
}

/** Tied team match: each team names one fighter for the daihyosen (default: its taisho). */
export function DaihyosenPanel({ teams, defaults, busy, onStart }) {
  const [pick, setPick] = useState(defaults);
  useEffect(() => { setPick(defaults); }, [defaults]);
  return (
    <div className="tl">
      <div className="tl-warning">
        <strong>Tied — daihyosen.</strong> Each team names one fighter; the first point decides the team match.
      </div>
      <div className="tp-grid">
        {['red', 'white'].map((side) => (
          <label key={side} className="tp-field">
            {teams[side].name}
            <select value={pick[side] ?? ''} onChange={(e) => setPick({ ...pick, [side]: e.target.value || null })}>
              <option value="">— choose —</option>
              {teams[side].members.map((m) => <option key={m.competitor_id} value={m.competitor_id}>{personName(m.competitor)}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="tp-actions">
        <button type="button" className="tp-btn" disabled={busy || !pick.red || !pick.white} onClick={() => onStart(pick)}>Daihyosen ready</button>
      </div>
    </div>
  );
}

export { personName };
