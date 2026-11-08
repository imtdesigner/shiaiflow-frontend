import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackToDashboard, Message, useTournament } from '../components/TournamentShell';
import {
  checkedInCounts, listFights, setCategoryCourts, setTournamentCourts, updateCategory, updateTournament,
} from '../lib/api';
import { courtPlan, courtSeconds, plannedFights } from '../lib/tournament/courts.js';
import './TournamentPages.css';

const MAX_COURTS = 6;

const END_BLOCK_LABELS = {
  none: 'No — finals stay with their category',
  finals: 'Finals at the end (first central court)',
  semis_finals: 'Semifinals and finals at the end (central courts)',
};

const toggle = (list, n) => (list.includes(n) ? list.filter((x) => x !== n) : [...list, n].sort((a, b) => a - b));

const fmt = (seconds) => {
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
};

/**
 * Shiaijo plan: the director picks the number of courts, then the courts of
 * each category (e.g. Junior A on 1+2, Junior B on 3+4). Pools are spread over
 * a category's courts, KO halves too, the final on its first court. Options:
 * KO on other courts, central courts, finals (or semifinals and finals) of
 * all categories at the end on the central courts. Times are fighting time
 * only (no breaks or changeovers).
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
      return plannedFights(counts[c.id] ?? 0, { poolSize: c.pool_size, advancing: c.advancing, split: c.pool_split, thirdPlace: c.third_place === 'fight' }, courtPlan(c, tournament));
    }
    const finalNo = c.ko_template?.length ? c.ko_template[c.ko_template.length - 1].no : null;
    return fights.filter((f) => f.category_id === c.id).map((f) => ({
      phase: f.phase === 'ko' ? (f.ko_no === finalNo ? 'final' : 'ko') : 'pool', court: f.shiaijo, end: f.end_block,
    }));
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

  const central = tournament?.central_shiaijos ?? [];
  const endBlock = tournament?.end_block ?? 'none';

  const changeTournament = (fields) => run(() => setTournamentCourts(tournament, fields, active));

  const changeCourtCount = (n) => run(async () => {
    const t = await setTournamentCourts(tournament, {
      shiaijo_count: n, central_shiaijos: central.filter((s) => s <= n),
    }, []);
    for (const c of active) {
      const keep = (list) => (list ? list.filter((s) => s <= n) : null);
      const shiaijos = keep(c.shiaijos);
      const ko = keep(c.ko_shiaijos);
      await setCategoryCourts(c, {
        shiaijos: shiaijos.length ? shiaijos : [1],
        ko_shiaijos: ko && ko.length ? ko : null,
      }, t);
    }
  });

  const toggleCourt = (c, field, court) => {
    const next = toggle(c[field] ?? c.shiaijos, court);
    if (!next.length) return;
    run(() => setCategoryCourts(c, { [field]: next }, tournament));
  };

  const setKoSeparate = (c, on) => run(() => setCategoryCourts(c, { ko_shiaijos: on ? [...c.shiaijos] : null }, tournament));

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
        <div className="tp-grid">
          <label className="tp-field">
            Start time
            <input type="time" value={tournament?.start_time?.slice(0, 5) ?? ''} disabled={busy}
              onChange={(e) => run(() => updateTournament(tournamentId, { start_time: e.target.value || null }))} />
          </label>
          <label className="tp-field tp-check">
            <input type="checkbox" checked={tournament?.use_timer ?? true} disabled={busy}
              onChange={(e) => run(() => updateTournament(tournamentId, { use_timer: e.target.checked }))} />
            Scoretable runs the timer (off = separate timekeeper)
          </label>
        </div>
        <div className="tp-field">
          Central shiaijo
          <div className="tp-actions" style={{ marginTop: 0 }}>
            {courts.map((n) => (
              <label key={n} className="tp-check">
                <input type="checkbox" checked={central.includes(n)} disabled={busy}
                  onChange={() => changeTournament({ central_shiaijos: toggle(central, n) })} />
                {' '}{n}
              </label>
            ))}
          </div>
        </div>
        <label className="tp-field" style={{ maxWidth: 420 }}>
          End of the tournament
          <select value={endBlock} disabled={busy} onChange={(e) => changeTournament({ end_block: e.target.value })}>
            {Object.entries(END_BLOCK_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        {endBlock !== 'none' && central.length === 0 && (
          <Message type="info">Mark the central shiaijo — until then these fights stay on their category courts.</Message>
        )}
        <p className="tp-muted">
          Tick the courts of each category. With more than one court its pools are spread over them (a pool never
          splits), KO halves too, and the final is on the first KO court. Times are fighting time only.
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
                <th>Fight time</th><th />
              </tr>
            </thead>
            <tbody>
              {categories.map((c, i) => {
                const row = perCategory.find((r) => r.c.id === c.id);
                const total = row ? [...row.seconds.values()].reduce((a, b) => a + b, 0) : 0;
                const disabledRow = busy || c.status === 'cancelled';
                const courtBoxes = (field) => courts.map((n) => {
                  const list = c[field] ?? c.shiaijos;
                  return (
                    <td key={n} style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={list.includes(n)}
                        disabled={disabledRow || (list.length === 1 && list[0] === n)}
                        onChange={() => toggleCourt(c, field, n)}
                      />
                    </td>
                  );
                });
                return (
                  <Fragment key={c.id}>
                  <tr>
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
                    {courtBoxes('shiaijos')}
                    <td>{row ? fmt(total) : '—'}</td>
                    <td>
                      {!c.ko_shiaijos && c.status !== 'cancelled' && (
                        <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => setKoSeparate(c, true)}>
                          KO on other courts
                        </button>
                      )}
                    </td>
                  </tr>
                  {c.ko_shiaijos && (
                    <tr>
                      <td />
                      <td colSpan={3} className="tp-muted">↳ KO courts</td>
                      {courtBoxes('ko_shiaijos')}
                      <td />
                      <td>
                        <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => setKoSeparate(c, false)}>
                          Same as pools
                        </button>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="tp-pools">
        {courts.map((n) => {
          const partsOf = (end) => perCategory.map((r) => {
            const fs = r.fights.filter((f) => f.court === n && !!f.end === end);
            const semis = fs.filter((f) => f.phase !== 'final').length;
            const finals = fs.length - semis;
            const label = [semis && `${semis} ${end ? 'semifinal' : 'fight'}${semis > 1 ? 's' : ''}`, finals && `${finals} final`]
              .filter(Boolean).join(' + ');
            return { c: r.c, count: fs.length, label, seconds: [...courtSeconds(fs, r.c).values()].reduce((a, b) => a + b, 0) };
          }).filter((p) => p.count > 0);
          const parts = partsOf(false);
          const endParts = partsOf(true);
          const total = [...parts, ...endParts].reduce((a, p) => a + p.seconds, 0);
          return (
            <div className="tp-pool" key={n}>
              <h4>
                Shiaijo {n}{central.includes(n) && <span className="tp-badge ok">central</span>}
                {' '}<span className="tp-muted">· {fmt(total)}</span>
              </h4>
              {parts.length === 0 && endParts.length === 0 ? <p className="tp-muted">Nothing yet.</p> : (
                <ol>
                  {parts.map((p) => <li key={p.c.id}>{p.c.name} <span className="tp-muted">· {p.count} fights · {fmt(p.seconds)}</span></li>)}
                </ol>
              )}
              {endParts.length > 0 && (
                <>
                  <p className="tp-muted" style={{ margin: '0.5rem 0 0.25rem' }}>End of the tournament</p>
                  <ol>
                    {endParts.map((p) => <li key={p.c.id}>{p.c.name} <span className="tp-muted">· {p.label} · {fmt(p.seconds)}</span></li>)}
                  </ol>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="tp-actions">
        <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/registration`}>Registration</Link>
        <Link className="tp-btn" to={`/tournament/${tournamentId}/drawings`}>Draw →</Link>
        <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/fights`}>Fight plan</Link>
      </div>
    </div>
  );
}

export default ShiaijoPlan;
