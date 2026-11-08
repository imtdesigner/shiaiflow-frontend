import { Link } from 'react-router-dom';

export const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** Status of a published tournament for the lists: signup open / closed, ongoing, finished. */
export function tournamentState(t) {
  if (t.status === 'running') return { label: 'Ongoing', cls: 'ok' };
  if (t.status === 'finished' || (t.end_date && t.end_date < new Date().toISOString().slice(0, 10))) {
    return { label: 'Finished', cls: '' };
  }
  const closed = !t.registration_open || (t.registration_deadline && new Date(t.registration_deadline) < new Date());
  if (closed) return { label: 'Signup closed', cls: 'warn' };
  return {
    label: t.registration_deadline
      ? `Signup open until ${new Date(t.registration_deadline).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
      : 'Signup open',
    cls: 'ok',
  };
}

/**
 * Published tournaments as cards. Active ones get the ways in (competitor /
 * live results, editor or table with the PIN, owner); past ones open their
 * public page with the setup and results.
 */
export default function TournamentList({ tournaments, query = '', past = false, emptyText }) {
  const q = query.trim().toLowerCase();
  const shown = (tournaments ?? []).filter((t) => !q || [t.name, t.city, t.country, t.venue].some((x) => x?.toLowerCase().includes(q)));
  return (
    <div className="home-tournaments">
      {tournaments === null && <p>Loading tournaments…</p>}
      {tournaments && shown.length === 0 && <p>{q ? 'No tournament matches the search.' : emptyText}</p>}
      {shown.map((t) => {
        const st = tournamentState(t);
        return (
          <div className="home-tournament" key={t.id}>
            <div className="home-tournament-info">
              <h3><Link to={`/t/${t.id}`}>{t.name}</Link></h3>
              <p>
                {fmtDate(t.start_date)}{t.end_date && t.end_date !== t.start_date ? ` – ${fmtDate(t.end_date)}` : ''}
                {(t.venue || t.city) && ` · ${[t.venue, t.city, t.country].filter(Boolean).join(', ')}`}
              </p>
              <span className={`tp-badge ${st.cls}`}>{st.label}</span>
            </div>
            <div className="home-tournament-actions">
              {past ? (
                <Link className="tp-btn" to={`/t/${t.id}`}>Results &amp; setup</Link>
              ) : (
                <>
                  <Link className="tp-btn" to={`/t/${t.id}`}>{t.status === 'running' ? 'Live results' : 'Competitor'}</Link>
                  <Link className="tp-btn secondary" to={`/join/${t.id}?as=editor`}>Editor (PIN)</Link>
                  {t.status === 'running' && <Link className="tp-btn secondary" to={`/join/${t.id}?as=table`}>Table (PIN)</Link>}
                  <Link className="tp-btn secondary" to="/login">Owner</Link>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
