import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackToDashboard, Message, entryName, useTournament } from '../components/TournamentShell';
import KoBracket from '../components/KoBracket';
import Segmented from '../components/Segmented';
import { listEntriesFor, listPools, listTournamentFights } from '../lib/api';
import { courtQueue } from '../lib/tournament/run.js';
import { slotLabel, thirdPlaceFight } from '../lib/tournament/ko.js';
import './TournamentPages.css';

/**
 * Paper backup (owner, 2026-11-23): printed before the tournament (or again
 * later) so a shiaijo can go on by hand if the devices or the network fail —
 * per shiaijo the fight list in running order with empty result columns, a
 * round-robin sheet per pool fought there, and the KO brackets with empty
 * winner places.
 */
export default function PaperBackup() {
  const { tournamentId, tournament, categories, loading, error: loadError } = useTournament();
  const drawn = useMemo(() => categories.filter((c) => !['registration', 'cancelled'].includes(c.status)), [categories]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [court, setCourt] = useState('all');
  const ids = drawn.map((c) => c.id).join();

  useEffect(() => {
    if (!ids) { setData({ fights: [], entries: [], pools: [] }); return; }
    const catIds = ids.split(',');
    Promise.all([listTournamentFights(catIds), listEntriesFor(catIds), listPools(catIds)])
      .then(([fights, entries, pools]) => setData({ fights, entries, pools }))
      .catch((e) => setError(e.message));
  }, [ids]);

  if (loading) return <div className="tp-page">Loading…</div>;
  if (loadError) return <div className="tp-page"><Message type="error">{loadError}</Message></div>;

  const courts = Array.from({ length: tournament?.shiaijo_count ?? 2 }, (_, i) => i + 1);
  const shown = court === 'all' ? courts : [court];
  const byId = Object.fromEntries(drawn.map((c) => [c.id, c]));
  const entryById = Object.fromEntries((data?.entries ?? []).map((e) => [e.id, e]));
  const nameOf = (id) => (entryById[id] ? entryName(entryById[id]) : '');
  const clubOf = (id) => entryById[id]?.team?.club ?? entryById[id]?.competitor?.club ?? '';
  const side = (f, s) => {
    const id = s === 'red' ? f.red_entry_id : f.white_entry_id;
    if (id) return <><strong>{nameOf(id)}</strong>{clubOf(id) && <span className="pb-club"> {clubOf(id)}</span>}</>;
    const code = s === 'red' ? f.red_code : f.white_code;
    return <span className="tp-muted">{code ? slotLabel(code, byId[f.category_id]?.pool_size === 1) : ''}</span>;
  };

  return (
    <div className="tp-page tp-page-wide pb-page">
      <BackToDashboard />
      <h2 className="tp-no-print">Paper backup</h2>
      <p className="tp-subtitle tp-no-print">{tournament?.name}</p>
      <div className="tp-no-print">
        <p className="tp-muted">
          Print this before the tournament and keep it at each table: if a device or the network fails, the table goes on by hand —
          fight list with empty result columns, a sheet per pool, the KO brackets. Results are typed in afterwards. Print one shiaijo or all
          (each shiaijo starts on a new page).
        </p>
        <Segmented options={[['all', 'All shiaijos'], ...courts.map((n) => [n, `Shiaijo ${n}`])]} value={court} onChange={setCourt} />
        <div className="tp-actions">
          <button type="button" className="tp-btn" disabled={!data} onClick={() => window.print()}>Print</button>
          <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/manage`}>Manage</Link>
        </div>
      </div>
      <Message type="error">{error}</Message>
      {drawn.length === 0 && <Message type="info">No draws yet — make the draws first.</Message>}
      {!data && <p>Loading…</p>}

      {data && drawn.length > 0 && shown.map((n) => {
        const queue = courtQueue(data.fights, drawn, n).filter((f) => f.phase !== 'ipponshobu');
        const poolIds = [...new Set(queue.filter((f) => f.phase === 'pool').map((f) => f.pool_id))];
        const pools = poolIds.map((id) => data.pools.find((p) => p.id === id)).filter(Boolean);
        const koCats = drawn.filter((c) => c.ko_template?.length && queue.some((f) => f.phase === 'ko' && f.category_id === c.id));
        return (
          <section key={n} className="pb-court">
            <h2 className="pb-title">{tournament?.name} — Shiaijo {n}</h2>
            <table className="tp-table pb-fights">
              <thead>
                <tr>
                  <th>#</th><th>Fight</th><th>Category</th>
                  <th className="aka">Red (aka)</th><th className="pb-box small">▲</th><th className="pb-box">Points</th>
                  <th className="pb-box">Points</th><th className="pb-box small">▲</th><th className="shiro">White (shiro)</th>
                  <th className="pb-box">Winner</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((f, i) => (
                  <tr key={f.id}>
                    <td>{i + 1}</td>
                    <td className="pb-label"><strong>{f.label}</strong></td>
                    <td>{byId[f.category_id]?.name}</td>
                    <td>{side(f, 'red')}</td><td /><td /><td /><td />
                    <td>{side(f, 'white')}</td><td />
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pb-note">Points: M K D T, I = ippon from 2nd hansoku, H = hantei, OO = fusen-gachi; X = hikiwake, E = encho. A tie for a place in a pool: ipponshobu written below the list.</p>

            {pools.map((p) => {
              const c = byId[p.category_id];
              const members = [...p.pool_entries].sort((a, b) => a.position - b.position).map((pe) => pe.entry_id);
              return (
                <div key={p.id} className="pb-pool">
                  <h3>{c?.name} · Pool {p.number}</h3>
                  <table className="tp-table pb-grid">
                    <thead>
                      <tr>
                        <th />
                        {members.map((id, j) => <th key={id} className="pb-cell">{j + 1}</th>)}
                        <th className="pb-cell">W</th><th className="pb-cell">L</th><th className="pb-cell">D</th>
                        <th className="pb-cell">+</th><th className="pb-cell">−</th><th className="pb-cell">Place</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((id, i) => (
                        <tr key={id}>
                          <th className="pb-member">{i + 1}. {nameOf(id)}{clubOf(id) && <span className="pb-club"> {clubOf(id)}</span>}</th>
                          {members.map((o, j) => <td key={o} className={`pb-cell ${i === j ? 'pb-self' : ''}`} />)}
                          <td className="pb-cell" /><td className="pb-cell" /><td className="pb-cell" />
                          <td className="pb-cell" /><td className="pb-cell" /><td className="pb-cell" />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}

            {koCats.map((c) => {
              const resolved = {};
              for (const f of data.fights.filter((x) => x.category_id === c.id && x.phase === 'ko')) {
                if (f.red_entry_id) resolved[f.red_code] = f.red_entry_id;
                if (f.white_entry_id) resolved[f.white_code] = f.white_entry_id;
              }
              const here = queue.filter((f) => f.phase === 'ko' && f.category_id === c.id).map((f) => f.label);
              return (
                <div key={c.id} className="pb-ko">
                  <h3>{c.name} · KO <span className="tp-muted">— on this shiaijo: {here.join(', ')}</span></h3>
                  <KoBracket template={c.ko_template} nameOf={nameOf} resolved={resolved} directKo={c.pool_size === 1}
                    thirdPlace={c.third_place === 'fight' ? thirdPlaceFight(c.ko_template) : null} />
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
