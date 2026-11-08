import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BackToDashboard, Message, entryName, useTournament,
} from '../components/TournamentShell';
import { listEntriesFor } from '../lib/api';
import {
  addEvent, boutOf, deleteEvent, finishFight, listEvents, listRunFights, myRole, reopenFight,
  setFightFields, startEncho, startFight, subscribeFights, timerStart, timerStop,
} from '../lib/runApi';
import { matchRounds, roundShort, slotLabel } from '../lib/tournament/ko.js';
import {
  courtQueue, currentFight, fightRules, fightSeconds, fightStatus,
} from '../lib/tournament/run.js';
import { boutTotals } from '../lib/tournament/scoring.js';
import './TournamentPages.css';
import './Scoreinput.css';

const POINTS = ['M', 'K', 'D', 'T'];
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Scoretable for one shiaijo: the current fight, score buttons, the shared
 * timer (hajime / yame; stops on every point), and what to do at time up —
 * finish, hikiwake, encho or hantei by the category's rules. Several screens
 * can follow the same court (realtime). Managers can reopen finished fights.
 */
function ScoreInput() {
  const { tournamentId, tournament, categories, error: loadError, loading } = useTournament();
  const [params, setParams] = useSearchParams();
  const [role, setRole] = useState(null);
  const [fights, setFights] = useState([]);
  const [entries, setEntries] = useState([]);
  const [events, setEvents] = useState([]);
  const [pickedId, setPickedId] = useState(null);
  const [manualTimeUp, setManualTimeUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [now, setNow] = useState(Date.now());
  const stopping = useRef(null);
  // Score and timer actions show at once and are sent in order in the background,
  // so fast clicks are never lost; screens refresh once the queue is empty.
  const queueRef = useRef(Promise.resolve());
  const pendingRef = useRef(0);

  const manager = role === 'owner' || role === 'organizer';
  const court = Number(params.get('court') ?? 1);
  const drawn = useMemo(() => categories.filter((c) => !['registration', 'cancelled'].includes(c.status)), [categories]);
  const byId = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);

  useEffect(() => {
    myRole(tournamentId).then(setRole).catch(() => setRole(null));
  }, [tournamentId]);

  const reload = useCallback(async () => {
    const ids = drawn.map((c) => c.id);
    try {
      const [fs, ens] = await Promise.all([listRunFights(ids), listEntriesFor(ids)]);
      setFights(fs);
      setEntries(ens);
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }, [drawn]);

  useEffect(() => { reload(); }, [reload]);

  const queue = useMemo(() => courtQueue(fights, drawn, court), [fights, drawn, court]);
  const fight = useMemo(() => {
    const picked = pickedId && queue.find((f) => f.id === pickedId);
    if (picked && picked.status !== 'finished') return picked;
    return currentFight(queue);
  }, [queue, pickedId]);

  const reloadEvents = useCallback(async () => {
    if (!fight) { setEvents([]); return; }
    if (pendingRef.current > 0) return; // local clicks not saved yet — refresh after the queue
    try { setEvents(await listEvents(fight.id)); } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }, [fight?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reloadEvents(); setManualTimeUp(false); }, [reloadEvents]);

  // realtime: other screens on this court (and the manager) see the same
  useEffect(() => subscribeFights(`${tournamentId}-${court}`, () => {
    if (pendingRef.current > 0) return; // our own clicks are still being saved
    reload(); reloadEvents();
  }), [tournamentId, court, reload, reloadEvents]);

  // clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const category = fight ? byId[fight.category_id] : null;
  const rules = category ? fightRules(category, fight.phase) : null;
  const template = category?.ko_template ?? [];
  const finalNo = template.length ? template[template.length - 1].no : null;
  const useTimer = tournament?.use_timer ?? true;
  const limitSec = !fight || !rules ? null
    : fight.is_encho ? rules.enchoSeconds
      : rules.ipponshobu ? null
        : fightSeconds(category, fight.phase, fight.ko_no === finalNo);
  const elapsed = fight ? fight.timer_elapsed_ms + (fight.timer_started_at ? now - new Date(fight.timer_started_at).getTime() : 0) : 0;
  const remaining = limitSec == null ? null : limitSec * 1000 - elapsed;
  const timeUp = useTimer ? remaining != null && remaining <= 0 : manualTimeUp;
  const bout = fight ? boutOf(fight, events) : { events: [] };
  const opts = { autoHansokuIppon: category?.auto_hansoku_ippon ?? true };
  const status = fight && rules ? fightStatus(bout, rules, { encho: fight.is_encho, timeUp }, opts) : null;
  const totals = fight ? boutTotals({ events }, opts) : null;

  const run = async (fn) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try { await queueRef.current; const out = await fn(); await reload(); await reloadEvents(); return out; }
    catch (e) { setMsg({ type: 'error', text: e.message }); return null; }
    finally { setBusy(false); }
  };

  // time up while running → stop the clock once
  useEffect(() => {
    if (!fight?.timer_started_at || remaining == null || remaining > 0 || stopping.current === fight.id) return;
    stopping.current = fight.id;
    timerStop(fight).then(() => { stopping.current = null; reload(); });
  }, [fight, remaining, reload]);

  const patchFight = (id, fields) => setFights((fs) => fs.map((f) => (f.id === id ? { ...f, ...fields } : f)));

  /** Queue a server call; the screen was already updated by the caller. */
  const enqueue = (fn) => {
    pendingRef.current += 1;
    queueRef.current = queueRef.current
      .then(fn)
      .catch((e) => setMsg({ type: 'error', text: e.message }))
      .finally(() => {
        pendingRef.current -= 1;
        if (pendingRef.current === 0) { reload(); reloadEvents(); }
      });
  };

  const stopClock = (f) => {
    if (!f.timer_started_at) return;
    const ms = Math.round(f.timer_elapsed_ms + (Date.now() - new Date(f.timer_started_at).getTime()));
    patchFight(f.id, { timer_elapsed_ms: ms, timer_started_at: null });
  };

  const point = (side, type) => {
    const f = fight;
    stopClock(f); // yame on every point
    setEvents((ev) => [...ev, { id: `local-${Date.now()}-${ev.length}`, side, type }]);
    enqueue(async () => {
      if (f.timer_started_at) await timerStop(f);
      await addEvent(f.id, side, type);
    });
  };

  const hajime = () => {
    const f = fight;
    const startedAt = new Date().toISOString();
    patchFight(f.id, { timer_started_at: startedAt });
    enqueue(() => timerStart(f));
  };

  const yame = () => {
    const f = fight;
    stopClock(f);
    enqueue(() => timerStop(f));
  };

  const undo = () => {
    const id = fight.id;
    setEvents((ev) => ev.slice(0, -1));
    enqueue(async () => {
      const saved = await listEvents(id);
      const last = saved[saved.length - 1];
      if (last) await deleteEvent(last.id);
    });
  };

  const finish = (extra = {}) => run(async () => {
    if (Object.keys(extra).length) await setFightFields(fight, extra);
    const res = fightStatus({ ...bout, ...extra }, rules, { encho: fight.is_encho, timeUp: true }, opts);
    const out = await finishFight(fight, res, category);
    setPickedId(null);
    if (out?.message) setMsg({ type: 'info', text: out.message });
  });

  const name = (f, side) => {
    const id = side === 'red' ? f.red_entry_id : f.white_entry_id;
    const e = entries.find((x) => x.id === id);
    if (e) return entryName(e);
    const code = side === 'red' ? f.red_code : f.white_code;
    return code ? slotLabel(code, byId[f.category_id]?.pool_size === 1) : '—';
  };
  const club = (f, side) => {
    const e = entries.find((x) => x.id === (side === 'red' ? f.red_entry_id : f.white_entry_id));
    return e?.team?.club ?? e?.competitor?.club ?? '';
  };
  const roundOf = (f) => {
    if (f.phase === 'pool') return 'Pool';
    if (f.phase === 'ipponshobu') return 'Ipponshobu';
    return roundShort(matchRounds(byId[f.category_id]?.ko_template ?? []).get(f.ko_no));
  };

  const upcoming = queue.filter((f) => f.status !== 'finished' && f.id !== fight?.id);
  const finished = queue.filter((f) => f.status === 'finished').slice(-6).reverse();
  const courts = Array.from({ length: tournament?.shiaijo_count ?? 2 }, (_, i) => i + 1);

  if (loading) return <div className="tp-page">Loading…</div>;
  if (loadError) return <div className="tp-page"><Message type="error">{loadError}</Message></div>;

  const sideBlock = (side) => (
    <div className={`st-side ${side}`}>
      <div className="st-name">{name(fight, side)}</div>
      <div className="st-club">{club(fight, side)}</div>
      <div className="st-marks">
        {fight.fusen === side ? 'OO' : status?.by === 'hantei' && status.winner === side ? 'HH' : totals[side].ippons.join(' ') || '·'}
        {totals[side].hansoku > 0 && <span className="st-hansoku">{'▲'.repeat(totals[side].hansoku)}</span>}
      </div>
      {fight.status === 'running' && !status?.over && (
        <div className="st-buttons">
          {POINTS.map((p) => <button key={p} type="button" className={`st-btn ippon ${side}`} onClick={() => point(side, p)}>{p}</button>)}
          <button type="button" className={`st-btn hansoku ippon ${side}`} onClick={() => point(side, 'hansoku')}>▲ Hansoku</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="tp-page st-page">
      <BackToDashboard />
      <div className="st-head">
        <h2>Shiaijo {court}</h2>
        <select value={court} onChange={(e) => { setParams({ court: e.target.value }); setPickedId(null); }}>
          {courts.map((n) => <option key={n} value={n}>Shiaijo {n}</option>)}
        </select>
        <span className="tp-muted">{tournament?.name}</span>
      </div>
      <Message type={msg.type || 'info'}>{msg.text}</Message>

      {tournament?.status !== 'running' && (
        <Message type="info">
          The tournament has not been started yet. {manager && <Link to={`/tournament/${tournamentId}/manage`}>Start it in Manage</Link>}
        </Message>
      )}

      {!fight ? (
        <div className="tp-card"><p className="tp-muted">No fight ready on this shiaijo{upcoming.length ? ' — waiting for fighters from earlier fights.' : '.'}</p></div>
      ) : (
        <div className="tp-card st-fight">
          <div className="st-fight-head">
            <strong>{fight.label}</strong> · {category?.name} · {roundOf(fight)}
            {fight.is_encho && <span className="tp-badge warn">encho</span>}
            {fight.status === 'scheduled' && <span className="tp-muted"> · not started</span>}
          </div>

          <div className="st-board">
            {sideBlock('red')}
            <div className="st-center">
              {useTimer ? (
                <>
                  <div className={`st-clock ${timeUp ? 'up' : ''}`}>{remaining == null ? mmss(elapsed) : mmss(remaining)}</div>
                  {fight.status === 'running' && !status?.over && !timeUp && (
                    fight.timer_started_at
                      ? <button type="button" className="st-btn big" onClick={yame}>Yame</button>
                      : <button type="button" className="st-btn big go" onClick={hajime}>Hajime</button>
                  )}
                </>
              ) : (
                fight.status === 'running' && !status?.over && (
                  <button type="button" className={`st-btn big ${manualTimeUp ? 'go' : ''}`} onClick={() => setManualTimeUp(!manualTimeUp)}>
                    {manualTimeUp ? 'Time up ✓' : 'Time up'}
                  </button>
                )
              )}
              {fight.status === 'running' && (
                <button type="button" className="st-btn small" disabled={events.length === 0} onClick={undo}>Undo last</button>
              )}
            </div>
            {sideBlock('white')}
          </div>

          <div className="tp-actions st-actions">
            {fight.status === 'scheduled' && (
              <>
                <button type="button" className="tp-btn" disabled={busy || !fight.red_entry_id || !fight.white_entry_id}
                  onClick={() => run(() => startFight(fight, queue))}>
                  Start fight
                </button>
                <button type="button" className="tp-btn secondary" disabled={busy} onClick={() => run(async () => { await startFight(fight, queue); await finishFightFusen('red'); })}>Red wins OO</button>
                <button type="button" className="tp-btn secondary" disabled={busy} onClick={() => run(async () => { await startFight(fight, queue); await finishFightFusen('white'); })}>White wins OO</button>
              </>
            )}
            {fight.status === 'running' && status?.next === 'finish' && (
              <button type="button" className="tp-btn" disabled={busy} onClick={() => finish()}>
                Finish — {status.winner === 'red' ? name(fight, 'red') : name(fight, 'white')} wins
              </button>
            )}
            {fight.status === 'running' && status?.next === 'hikiwake' && (
              <button type="button" className="tp-btn" disabled={busy} onClick={() => finish()}>Finish — hikiwake</button>
            )}
            {fight.status === 'running' && (status?.next === 'encho') && (
              <button type="button" className="tp-btn" disabled={busy} onClick={() => run(() => startEncho(fight))}>Encho</button>
            )}
            {fight.status === 'running' && (status?.next === 'hantei' || (rules?.hantei && fight.is_encho && timeUp && status?.draw)) && (
              <>
                <button type="button" className="tp-btn" disabled={busy} onClick={() => finish({ decision: 'red' })}>Hantei — red</button>
                <button type="button" className="tp-btn" disabled={busy} onClick={() => finish({ decision: 'white' })}>Hantei — white</button>
              </>
            )}
            {fight.status === 'running' && !status?.over && (
              <>
                <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => finish({ fusen: 'red' })}>Red wins OO</button>
                <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => finish({ fusen: 'white' })}>White wins OO</button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="tp-pools">
        <div className="tp-pool">
          <h4>Next on shiaijo {court}</h4>
          {upcoming.length === 0 ? <p className="tp-muted">Nothing left.</p> : (
            <ol>
              {upcoming.slice(0, 8).map((f) => (
                <li key={f.id}>
                  <strong>{f.label}</strong> <span className="tp-muted">{byId[f.category_id]?.name}</span>
                  {' '}{name(f, 'red')} – {name(f, 'white')}
                  {f.status === 'scheduled' && f.red_entry_id && f.white_entry_id && (
                    <button type="button" className="tp-btn secondary small" style={{ marginLeft: '0.4rem' }}
                      disabled={busy || fight?.status === 'running'} onClick={() => setPickedId(f.id)}>
                      Take next
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="tp-pool">
          <h4>Finished</h4>
          {finished.length === 0 ? <p className="tp-muted">None yet.</p> : (
            <ol>
              {finished.map((f) => (
                <li key={f.id}>
                  <strong>{f.label}</strong> {name(f, 'red')} – {name(f, 'white')}
                  <span className="tp-muted"> · {f.winner_entry_id ? `winner ${f.winner_entry_id === f.red_entry_id ? name(f, 'red') : name(f, 'white')}` : 'hikiwake'}</span>
                  {manager && (
                    <button type="button" className="tp-btn secondary small" style={{ marginLeft: '0.4rem' }}
                      disabled={busy || fight?.status === 'running'} onClick={() => { setPickedId(f.id); run(() => reopenFight(f)); }}>
                      Correct
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );

  async function finishFightFusen(side) {
    await setFightFields(fight, { fusen: side });
    const res = fightStatus({ events: [], fusen: side }, rules, { timeUp: true }, opts);
    const out = await finishFight({ ...fight, status: 'running' }, res, category);
    if (out?.message) setMsg({ type: 'info', text: out.message });
  }
}

export default ScoreInput;
