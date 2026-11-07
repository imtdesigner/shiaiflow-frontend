import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackToDashboard, Message, useTournament } from '../components/TournamentShell';
import {
  checkedInCounts, listFights, setCategoryCourts, updateCategory, updateTournament,
} from '../lib/api';
import { courtSeconds, plannedFights } from '../lib/tournament/courts.js';
import './TournamentPages.css';

const MAX_COURTS = 6;

const fmt = (seconds) => {
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
};

/**
 * Shiaijo plan: the director picks the number of courts, then the courts of
 * each category (e.g. Junior A on 1+2, Junior B on 3+4). Pools are spread over
 * a category's courts, KO halves too, the final on its first court. Times are
 * fighting time only (no breaks or changeovers).
 */
function ShiaijoPlan() {
  const {
    tournamentId, tournament, categories, reload: reloadTournament, error: loadError, loading,
  } = useTournament();
  const [counts, setCounts] = useState({});
  const [fights, setFights] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const courtCount = Math.min(tournament?.shiaijo_count ?? 2, MAX_COURTS);
  const courts = Array.from({ length: courtCount }, (_, i) => i + 1);
  const active = useMemo(() => categories.filter((c) => c.status !== 'cancelled'), [categories]);

  const reload = useCallback(async () => {
    const ids = categories.map((c) => c.id);
    try {
      const [cnt, fs] = await Promise.all([checkedInCounts(ids), listFights(ids)]);
      setCounts(cnt);
      setFights(fs);
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }, [categories]);

  useEffect(() => { reload(); }, [reload]);

  /** Fights per category with their court: saved ones once drawn, planned before. */
  const categoryFights = (c) => {
    if (c.status === 'registration') {
      return plannedFights(counts[c.id] ?? 0, { poolSize: c.pool_size, advancing: c.advancing }, c.shiaijos);
    }
    const finalNo = c.ko_template?.length ? c.ko_template[c.ko_template.length - 1].no : null;
    return fights.filter((f) => f.category_id === c.id)
      .map((f) => ({ phase: f.phase === 'ko' ? (f.ko_no === finalNo ? 'final' : 'ko') : 'pool', court: f.shiaijo }));
  };

  const perCategory = active.map((c) => {
    const fs = categoryFights(c);
    return { c, fights: fs, seconds: courtSeconds(fs, c) };
  });

  const run = async (fn, ok) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try { await fn(); await reloadTournament(); if (ok) setMsg({ type: 'success', text: ok }); }
    catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  const changeCourtCount = (n) => run(async () => {
    await updateTournament(tournamentId, { shiaijo_count: n });
    for (const c of active) {
      const kept = c.shiaijos.filter((s) => s <= n);
      if (kept.length !== c.shiaijos.length) await setCategoryCourts(c, kept.length ? kept : [1]);
    }
  });

  const toggleCourt = (c, court) => {
    const next = c.shiaijos.includes(court) ? c.shiaijos.filter((s) => s !== court) : [...c.shiaijos, court].sort((a, b) => a - b);
    if (!next.length) return;
    run(() => setCategoryCourts(c, next));
  };

  /** Swap a category with its neighbour; the order is the order on each court. */
  const move = (i, dir) => {
    const order = [...categories];
    [order[i], order[i + dir]] = [order[i + dir], order[i]];
    run(async () => {
      for (const [idx, c] of order.entries()) if (c.sort_order !== idx) await updateCategory(c.id, { sort_order: idx });
    });
  };

  if (loading) return <div className="tp-page">Loading…</div>;
  if (loadError) return <div className="tp-page"><Message type="error">{loadError}</Message></div>;

  return (
    <div className="tp-page">
      <BackToDashboard />
      <h2>Shiaijo plan</h2>
      <p className="tp-subtitle">{tournament?.name}</p>
      <Message type={msg.type || 'info'}>{msg.text}</Message>

      <div className="tp-card">
        <h3>Courts</h3>
        <label className="tp-field" style={{ maxWidth: 240 }}>
          Number of shiaijo
          <select value={courtCount} disabled={busy} onChange={(e) => changeCourtCount(Number(e.target.value))}>
            {Array.from({ length: MAX_COURTS }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <p className="tp-muted">
          Tick the courts of each category. With more than one court its pools are spread over them, KO halves too,
          and the final is on its first court. Times are fighting time only.
        </p>
      </div>

      <div className="tp-card">
        <h3>Categories</h3>
        {categories.length === 0 ? (
          <p className="tp-muted">No categories yet.</p>
        ) : (
          <table className="tp-table">
            <thead>
              <tr>
                <th>Order</th><th>Category</th><th>Checked in</th><th>Fights</th>
                {courts.map((n) => <th key={n} style={{ textAlign: 'center' }}>Shiaijo {n}</th>)}
                <th>Fight time</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c, i) => {
                const row = perCategory.find((r) => r.c.id === c.id);
                const total = row ? [...row.seconds.values()].reduce((a, b) => a + b, 0) : 0;
                return (
                  <tr key={c.id}>
                    <td>
                      <button type="button" className="tp-btn secondary small" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button type="button" className="tp-btn secondary small" disabled={busy || i === categories.length - 1} onClick={() => move(i, 1)}>↓</button>
                    </td>
                    <td>
                      {c.name}
                      {c.status === 'cancelled' && <span className="tp-muted"> (cancelled)</span>}
                      {c.status !== 'registration' && c.status !== 'cancelled' && <> <span className="tp-badge ok">drawn</span></>}
                    </td>
                    <td>{counts[c.id] ?? 0}</td>
                    <td>{row?.fights.length ?? '—'}</td>
                    {courts.map((n) => (
                      <td key={n} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={c.shiaijos.includes(n)}
                          disabled={busy || c.status === 'cancelled' || (c.shiaijos.length === 1 && c.shiaijos[0] === n)}
                          onChange={() => toggleCourt(c, n)}
                        />
                      </td>
                    ))}
                    <td>{row ? fmt(total) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="tp-pools">
        {courts.map((n) => {
          const parts = perCategory
            .map((r) => ({ c: r.c, seconds: r.seconds.get(n) ?? 0, count: r.fights.filter((f) => f.court === n).length }))
            .filter((p) => p.count > 0);
          const total = parts.reduce((a, p) => a + p.seconds, 0);
          return (
            <div className="tp-pool" key={n}>
              <h4>Shiaijo {n} <span className="tp-muted">· {fmt(total)}</span></h4>
              {parts.length === 0 ? <p className="tp-muted">Nothing yet.</p> : (
                <ol>
                  {parts.map((p) => <li key={p.c.id}>{p.c.name} <span className="tp-muted">· {p.count} fights · {fmt(p.seconds)}</span></li>)}
                </ol>
              )}
            </div>
          );
        })}
      </div>

      <div className="tp-actions">
        <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/registration`}>Registration</Link>
        <Link className="tp-btn" to={`/tournament/${tournamentId}/drawings`}>Draw →</Link>
      </div>
    </div>
  );
}

export default ShiaijoPlan;
