import { Link } from 'react-router-dom';
import { publicPath } from '../lib/tournament/days.js';

export const SCOREKEEPING = 'Scorekeeping manager';
export const COURT_SCREEN = 'Court screen (monitor)';

/** Address of the court screen (monitor) of one shiaijo — public, no login. */
export const courtScreenUrl = (tournament, n) => `${publicPath(tournament)}/court/${n}`;

/**
 * Table device (owner, 2026-11-24): one login, two windows per shiaijo —
 * the Scorekeeping manager on the laptop and the Court screen (monitor) in a
 * second window dragged to the TV next to the shiaijo (full screen).
 */
export default function TableDevice({ tournament, onPick }) {
  const courts = Array.from({ length: tournament?.shiaijo_count ?? 2 }, (_, i) => i + 1);
  return (
    <div className="td-wrap">
      <p className="tp-muted" style={{ marginTop: 0 }}>
        Pick your shiaijo. Open the <strong>{SCOREKEEPING}</strong> on this laptop and the <strong>{COURT_SCREEN}</strong> in a
        second window: drag that window to the TV next to the shiaijo and make it full screen (F11, on a Mac ⌃⌘F).
      </p>
      <div className="td-courts">
        {courts.map((n) => (
          <div key={n} className="td-court">
            <h4>Shiaijo {n}</h4>
            <Link className="tp-btn" to={`/tournament/${tournament.id}/score?court=${n}`} onClick={onPick}>{SCOREKEEPING}</Link>
            <a className="tp-btn secondary" href={courtScreenUrl(tournament, n)} target={`sf-court-${n}`} rel="noreferrer"
              onClick={onPick}>{COURT_SCREEN} ↗</a>
          </div>
        ))}
      </div>
    </div>
  );
}
