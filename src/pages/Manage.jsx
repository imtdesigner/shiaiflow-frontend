import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BackToDashboard, Message, courtGridStyle, entryName, useTournament,
} from '../components/TournamentShell';
import { listBouts, listEntriesFor, listEventsFor } from '../lib/api';
import {
  correctFight, editResult, getPin, keepConflicts, listRunFights, myRole, replayConflicts, resetKoFighters, resetPoolOrder,
  setKoFighters, setPin, setPoolOrder, subscribeFights,
} from '../lib/runApi';
import { slotLabel } from '../lib/tournament/ko.js';
import { courtQueue, currentFight } from '../lib/tournament/run.js';
import HallSetup from '../components/HallSetup';
import TableDevice, { COURT_SCREEN, SCOREKEEPING, courtScreenUrl } from '../components/TableDevice';
import PoolStandings, { poolMembers, usePoolData } from '../components/PoolStandings';
import {
  CorrectionLog, EditResultDialog, KoConflicts, KoFights, PoolOrderDialog, koConflicts,
} from '../components/ManagerCorrections';
import { koCheck, poolPlacesMap } from '../lib/tournament/corrections.js';
import { fightMarks } from '../lib/tournament/poolView.js';
import StartTournament from '../components/StartTournament';
import './TournamentPages.css';

const randomPin = () => String(Math.floor(1000 + Math.random() * 9000));

/**
 * Manage: start the tournament and watch every shiaijo live — the fight on
 * the court, what comes next, progress. One PIN per tournament for editors
 * and tables; they join at /join/<tournament> with it.
 */
function Manage() {
  const {
    tournamentId, tournament, categories, reload: reloadTournament, error: loadError, loading,
  } = useTournament();
  const [fights, setFights] = useState([]);
  const [entries, setEntries] = useState([]);
  const [pin, setPinState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [role, setRole] = useState(null);
  const [version, setVersion] = useState(0); // bumps after a correction: pools and the log refetch
  const [ordering, setOrdering] = useState(null); // { category, pool, order }
  const [editing, setEditing] = useState(null); // { category, fight }

  useEffect(() => { myRole(tournamentId).then(setRole).catch(() => {}); }, [tournamentId]);

  const drawn = useMemo(() => categories.filter((c) => !['registration', 'cancelled'].includes(c.status)), [categories]);
  const notDrawn = categories.filter((c) => c.status === 'registration');
  const byId = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const courts = Array.from({ length: tournament?.shiaijo_count ?? 2 }, (_, i) => i + 1);
  const running = tournament?.status === 'running';
  const joinUrl = `${window.location.origin}/join/${tournamentId}`;

  const reload = useCallback(async () => {
    const ids = drawn.map((c) => c.id);
    try {
      const [fs, ens, p] = await Promise.all([listRunFights(ids), listEntriesFor(ids), getPin(tournamentId)]);
      setFights(fs);
      setEntries(ens);
      setPinState(p);
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }, [drawn, tournamentId]);

  useEffect(() => { reload(); }, [reload]);
  // a change at a table may also change pool places (written after the fight): standings / KO check refetch them too
  useEffect(() => subscribeFights(tournamentId, () => { reload(); setVersion((v) => v + 1); }, 500), [tournamentId, reload]);

  const run = async (fn, ok) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try { await fn(); await reloadTournament(); await reload(); setVersion((v) => v + 1); if (ok) setMsg({ type: 'success', text: ok }); }
    catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  // categories whose pools have started: their standings
  const poolCats = drawn.filter((c) => c.pool_size !== 1
    && fights.some((f) => f.category_id === c.id && f.phase === 'pool' && f.status !== 'scheduled'));
  const poolData = usePoolData(poolCats.map((c) => c.id), fights, version);
  const entryNameById = (id) => { const e = entries.find((x) => x.id === id); return e ? entryName(e) : '—'; };

  // manager corrections (owner, 2026-11-24): KO checked against the pool places + KO results
  const koCats = drawn.filter((c) => fights.some((f) => f.category_id === c.id && f.phase === 'ko'));
  const koPools = usePoolData(koCats.filter((c) => c.pool_size !== 1).map((c) => c.id), fights, version).pools;
  const koStates = koConflicts(koCats, fights, koPools);
  const koDoneKey = fights.filter((f) => f.phase === 'ko' && f.status === 'finished').map((f) => `${f.id}:${f.finished_at}`).join();
  const [koMarks, setKoMarks] = useState({ events: [], bouts: [] });
  useEffect(() => {
    const ids = koDoneKey ? koDoneKey.split(',').map((k) => k.split(':')[0]) : [];
    if (!ids.length) { setKoMarks({ events: [], bouts: [] }); return; }
    Promise.all([listEventsFor(ids), listBouts(ids)]).then(([events, bouts]) => setKoMarks({ events, bouts })).catch(() => {});
  }, [koDoneKey]);
  const courtFree = (f) => !busy && !fights.some((x) => x.status === 'running' && x.shiaijo === f.shiaijo);
  const orderPreview = (category, pool, order) => {
    const ko = fights.filter((f) => f.category_id === category.id && f.phase === 'ko');
    const others = koPools.filter((p) => p.category_id === category.id && p.id !== pool.id);
    const mine = { ...pool, pool_entries: order.map((entry_id, i) => ({ entry_id, final_place: i + 1 })) };
    const { auto, conflicts } = koCheck(ko, poolPlacesMap([...others, mine], category.advancing));
    const label = (id) => ko.find((f) => f.id === id)?.label;
    return {
      changes: auto.map((u) => `${label(u.id)}: ${u.red_entry_id ? entryNameById(u.red_entry_id) : '—'} – ${u.white_entry_id ? entryNameById(u.white_entry_id) : '—'}`),
      conflicts: conflicts.map((c) => c.fight.label),
    };
  };

  const name = (f, side) => {
    const id = side === 'red' ? f.red_entry_id : f.white_entry_id;
    const e = entries.find((x) => x.id === id);
    if (e) return entryName(e);
    const code = side === 'red' ? f.red_code : f.white_code;
    return code ? slotLabel(code, byId[f.category_id]?.pool_size === 1) : '—';
  };

  if (loading) return <div className="tp-page">Loading…</div>;
  if (loadError) return <div className="tp-page"><Message type="error">{loadError}</Message></div>;
  if (role === 'scorer') {
    return (
      <div className="tp-page">
        <h2>Table</h2>
        <p className="tp-subtitle">{tournament?.name}</p>
        <div className="tp-card">{tournament && <TableDevice tournament={tournament} />}</div>
      </div>
    );
  }

  return (
    <div className="tp-page">
      <BackToDashboard />
      <h2>Manage tournament</h2>
      <p className="tp-subtitle">{tournament?.name}</p>
      <Message type={msg.type || 'info'}>{msg.text}</Message>
      {!running && <StartTournament tournament={tournament} categories={categories} onStarted={async () => { await reloadTournament(); await reload(); }} />}

      <div className="tp-card">
        <h3>
          Status <span className={`tp-badge ${running ? 'ok' : ''}`}>{tournament?.status}</span>
        </h3>
        {notDrawn.length > 0 && (
          <Message type="info">
            Not drawn yet: {notDrawn.map((c) => c.name).join(', ')}. <Link to={`/tournament/${tournamentId}/drawings`}>Draw</Link>
          </Message>
        )}
        <div className="tp-actions">
          <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/fights`}>Fight plan</Link>
          <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/shiaijo`}>Shiaijo plan</Link>
          <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/results`}>Results{tournament?.fighting_spirit !== false ? ' + Fighting spirit' : ''}</Link>
          <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/paper`}>Paper backup</Link>
        </div>
        {running && <p className="tp-muted">Running: the scorekeeping managers and court screens are live. Categories drawn later are added at the end of their courts.</p>}
      </div>

      <HallSetup tournamentId={tournamentId} courts={courts.length} />

      <div id="g-pin" className="tp-card">
        <h3>PIN for editors and tables</h3>
        <p className="tp-muted" style={{ marginTop: 0 }}>
          One PIN for this tournament. Before the start it lets editors change the tournament; after the start the same
          PIN opens the tables (each picks its shiaijo: Scorekeeping manager + Court screen) and Manage. Share <strong>{joinUrl}</strong>.
        </p>
        <div className="tp-actions">
          <strong style={{ fontSize: '1.4rem', letterSpacing: '0.2em' }}>{pin ?? '—'}</strong>
          <button type="button" className="tp-btn secondary small" disabled={busy}
            onClick={() => run(() => setPin(tournamentId, randomPin()))}>
            {pin ? 'New PIN' : 'Create PIN'}
          </button>
          {courts.map((n) => (
            <Link key={n} className="tp-btn small" to={`/tournament/${tournamentId}/score?court=${n}`}>{SCOREKEEPING} {n}</Link>
          ))}
        </div>
      </div>

      <div id="g-displays" className="tp-card">
        <h3>Court screens (monitors)</h3>
        <p className="tp-muted" style={{ marginTop: 0 }}>
          For the monitor next to each shiaijo: the fight in progress, the last result and the next fights — no timer.
          Anyone with the link can open it (no login); the tournament must be published. Shiro is left, aka right;
          the ⇄ Sides button on the screen swaps them for that monitor.
        </p>
        <div className="tp-actions">
          {courts.map((n) => (
            <a key={n} className="tp-btn secondary small" href={courtScreenUrl(tournament, n)} target="_blank" rel="noreferrer">
              {COURT_SCREEN} {n} ↗
            </a>
          ))}
        </div>
      </div>

      <div className="court-grid" style={courtGridStyle(courts.length)}>
        {courts.map((n) => {
          const queue = courtQueue(fights, drawn, n);
          const now = currentFight(queue);
          const done = queue.filter((f) => f.status === 'finished').length;
          const next = queue.filter((f) => f.status !== 'finished' && f.id !== now?.id).slice(0, 3);
          return (
            <div className="tp-pool" key={n}>
              <h4>Shiaijo {n} <span className="tp-muted">· {done}/{queue.length} done</span></h4>
              {now ? (
                <p>
                  <span className={`tp-badge ${now.status === 'running' ? 'ok' : ''}`}>{now.status === 'running' ? 'fighting' : 'next'}</span>
                  {' '}<strong>{now.label}</strong> {byId[now.category_id]?.name}<br />
                  <span className="aka">{name(now, 'red')}</span> – <span className="shiro">{name(now, 'white')}</span>
                </p>
              ) : <p className="tp-muted">{queue.length && done === queue.length ? 'All fights done.' : 'Waiting.'}</p>}
              {next.length > 0 && (
                <ol>
                  {next.map((f) => <li key={f.id}><strong>{f.label}</strong> {name(f, 'red')} – {name(f, 'white')}</li>)}
                </ol>
              )}
            </div>
          );
        })}
      </div>

      <KoConflicts states={koStates} nameOf={entryNameById} busy={busy}
        onReplay={(c, list) => run(() => replayConflicts(c, list), `${list.map((x) => x.fight.label).join(', ')}: to be fought again — first on ${list.length === 1 ? 'its shiaijo' : 'their shiaijos'}.`)}
        onKeep={(c, list) => run(() => keepConflicts(c, list), `${list.map((x) => x.fight.label).join(', ')}: kept as fought.`)} />

      {poolCats.length > 0 && (
        <div className="tp-card" id="g-standings">
          <h3>Pool standings</h3>
          <p className="tp-muted" style={{ marginTop: 0 }}>
            Live, by each category's ranking criteria. To change a result, open Fights under the pool and press Correct — the fight is
            reopened on its shiaijo and the table scores it again; the standings and the KO follow. If the fights cannot give the right
            order, "Change order…" sets the places by hand.
          </p>
          {poolCats.map((c) => (
            <div key={c.id}>
              <h4>{c.name}</h4>
              <div className="pool-standings-grid">
                {poolData.pools.filter((p) => p.category_id === c.id).map((p) => (
                  <PoolStandings key={p.id} category={c} pool={p} members={poolMembers(p)}
                    fights={fights} events={poolData.events} bouts={poolData.bouts} known={poolData.known} nameOf={entryNameById}
                    canCorrect={courtFree}
                    onOrder={(pool, order) => setOrdering({ category: c, pool, order })}
                    onEdit={(f) => setEditing({ category: c, fight: f })}
                    onCorrect={(f) => run(() => correctFight(f, c), `${f.label} reopened on shiaijo ${f.shiaijo} — score it again in the Scorekeeping manager.`)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <KoFights states={koStates} entries={entries} nameOf={entryNameById} busy={busy} canCorrect={courtFree}
        marksOf={(f) => fightMarks(byId[f.category_id], f, koMarks.events, koMarks.bouts)}
        onCorrect={(f, c) => run(() => correctFight(f, c), `${f.label} reopened on shiaijo ${f.shiaijo} — score it again in the Scorekeeping manager.`)}
        onEdit={(f, c) => setEditing({ category: c, fight: f })}
        onSetFighters={(c, f, red, white, reason) => run(() => setKoFighters(c, f, red, white, reason), `${f.label}: fighters changed.`)}
        onResetFighters={(c, f) => run(() => resetKoFighters(c, f), `${f.label}: back to the bracket.`)} />

      <CorrectionLog tournamentId={tournamentId} categories={categories} nameOf={entryNameById} version={version} />

      {editing && (
        <EditResultDialog category={editing.category} fight={editing.fight} nameOf={entryNameById} busy={busy} onClose={() => setEditing(null)}
          onSave={(bout, res) => run(async () => {
            const out = await editResult(editing.category, editing.fight, bout, res);
            setEditing(null);
            if (out?.message) setMsg({ type: 'info', text: out.message });
          }, `${editing.fight.label}: result saved.`)} />
      )}

      {ordering && (
        <PoolOrderDialog category={ordering.category} pool={ordering.pool} order={ordering.order} nameOf={entryNameById} busy={busy}
          preview={(order) => orderPreview(ordering.category, ordering.pool, order)}
          onSave={(order, reason) => run(async () => { await setPoolOrder(ordering.category, ordering.pool, order, reason); setOrdering(null); }, `Pool ${ordering.pool.number}: order saved.`)}
          onReset={() => run(async () => { await resetPoolOrder(ordering.category, ordering.pool); setOrdering(null); }, `Pool ${ordering.pool.number}: back to the computed order.`)}
          onClose={() => setOrdering(null)} />
      )}
    </div>
  );
}

export default Manage;
