import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BackToDashboard, CategoryTabs, Message, entryName, useTournament,
} from '../components/TournamentShell';
import { listEntriesFor, listTournamentFights, setFightCourt } from '../lib/api';
import { matchRounds, slotLabel } from '../lib/tournament/ko.js';
import { courtQueue, fightSeconds, koRound, koRoundLabel } from '../lib/tournament/run.js';
import './TournamentPages.css';

const fmt = (seconds) => {
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

/** Clock time from the tournament start ('09:00:00') plus seconds, or +h:mm without a start. */
const clock = (startTime, seconds) => {
  if (!startTime) return `+${fmt(seconds)}`;
  const [h, m] = startTime.split(':').map(Number);
  const total = Math.round((h * 60 + m) + seconds / 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** Seconds a fight takes (fight time of its category, phase and KO round). */
const fightSecondsOf = (f, c) => fightSeconds(c, f.phase === 'ko' ? 'ko' : 'pool', koRound(c, f.ko_no));

/**
 * Fight plan: every saved fight, by category (pools, then KO) or by shiaijo
 * (the whole tournament per court, in order, with estimated start). The court
 * of each fight can be changed by hand; "plan" puts it back on the shiaijo plan.
 */
function FightPlan() {
  const { tournamentId, tournament, categories, error: loadError, loading } = useTournament();
  const [view, setView] = useState('category');
  const [selectedId, setSelectedId] = useState(null);
  const [fights, setFights] = useState([]);
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const drawn = useMemo(() => categories.filter((c) => !['registration', 'cancelled'].includes(c.status)), [categories]);
  const byId = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const courtCount = tournament?.shiaijo_count ?? 2;
  const courts = Array.from({ length: courtCount }, (_, i) => i + 1);

  useEffect(() => {
    if ((!selectedId || !drawn.some((c) => c.id === selectedId)) && drawn.length) setSelectedId(drawn[0].id);
  }, [drawn, selectedId]);

  const reload = useCallback(async () => {
    const ids = drawn.map((c) => c.id);
    try {
      const [fs, ens] = await Promise.all([listTournamentFights(ids), listEntriesFor(ids)]);
      setFights(fs);
      setEntries(ens);
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }, [drawn]);

  useEffect(() => { reload(); }, [reload]);

  const entryById = useMemo(() => Object.fromEntries(entries.map((e) => [e.id, e])), [entries]);
  const meta = useMemo(() => Object.fromEntries(drawn.map((c) => {
    const t = c.ko_template ?? [];
    return [c.id, { rounds: matchRounds(t), finalNo: t.length ? t[t.length - 1].no : null, directKo: c.pool_size === 1 }];
  })), [drawn]);

  const side = (f, which) => {
    const id = which === 'red' ? f.red_entry_id : f.white_entry_id;
    if (id) return entryName(entryById[id]);
    const code = which === 'red' ? f.red_code : f.white_code;
    return code ? slotLabel(code, meta[f.category_id]?.directKo) : '—';
  };
  const roundOf = (f) => (f.phase === 'ko' ? koRoundLabel(byId[f.category_id], f.ko_no) : f.phase === 'ipponshobu' ? 'Ipponshobu' : 'Pool');

  const changeCourt = async (f, value) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try {
      await setFightCourt(f, value === 'plan' ? null : Number(value), byId[f.category_id], tournament);
      await reload();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  const CourtSelect = ({ f }) => (
    <select
      value={f.shiaijo ?? ''}
      disabled={busy || f.status !== 'scheduled'}
      onChange={(e) => changeCourt(f, e.target.value)}
      title={f.court_manual ? 'Changed by hand' : 'From the shiaijo plan'}
    >
      {courts.map((n) => <option key={n} value={n}>{n}{f.court_manual && f.shiaijo === n ? ' ✎' : ''}</option>)}
      {f.court_manual && <option value="plan">↺ back to plan</option>}
    </select>
  );

  // --- by shiaijo: whole tournament per court, in order -----------------------
  const perCourt = useMemo(() => {
    // same order as the scoretables: court_seq once the tournament started, plan order before
    const sorted = courts.flatMap((n) => courtQueue(fights, drawn, n));
    const secs = (f) => fightSecondsOf(f, byId[f.category_id]);
    // regular fights first; the end-of-tournament block starts once every court is done
    const regularEnd = Math.max(0, ...courts.map((n) => sorted
      .filter((f) => f.shiaijo === n && !f.end_block).reduce((t, f) => t + secs(f), 0)));
    return courts.map((n) => {
      let t = 0;
      let blockStarted = false;
      const list = sorted.filter((f) => f.shiaijo === n).map((f) => {
        if (f.end_block && !blockStarted) { t = Math.max(t, regularEnd); blockStarted = true; }
        const start = t;
        t += secs(f);
        return { f, start };
      });
      return { court: n, list, total: t };
    });
  }, [fights, byId, meta, courtCount, drawn]); // eslint-disable-line react-hooks/exhaustive-deps

  const category = byId[selectedId];
  const catFights = fights.filter((f) => f.category_id === selectedId);
  const poolNumbers = [...new Set(catFights.filter((f) => f.phase !== 'ko').map((f) => f.label.match(/^F-P(\d+)\./)?.[1]))]
    .filter(Boolean).map(Number).sort((a, b) => a - b);

  const FightRows = ({ list, showCategory, showStart }) => (
    <table className="tp-table">
      <thead>
        <tr>
          {showStart && <th>Start</th>}
          <th>Fight</th>{showCategory && <th>Category</th>}<th>Round</th>
          <th>Red (aka)</th><th>White (shiro)</th><th>Shiaijo</th>
        </tr>
      </thead>
      <tbody>
        {list.map(({ f, start }) => (
          <tr key={f.id} className={f.end_block ? 'tp-end-block' : ''}>
            {showStart && <td className="tp-muted">{clock(tournament?.start_time, start)}</td>}
            <td><strong>{f.label}</strong></td>
            {showCategory && <td>{byId[f.category_id]?.name}</td>}
            <td className="tp-muted">{roundOf(f)}{f.end_block ? ' · end' : ''}</td>
            <td className="aka">{side(f, 'red')}</td>
            <td className="shiro">{side(f, 'white')}</td>
            <td><span className="tp-print-only">{f.shiaijo}</span><span className="tp-no-print"><CourtSelect f={f} /></span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (loading) return <div className="tp-page">Loading…</div>;
  if (loadError) return <div className="tp-page"><Message type="error">{loadError}</Message></div>;

  return (
    <div className="tp-page">
      <BackToDashboard />
      <h2>Fight plan</h2>
      <p className="tp-subtitle">{tournament?.name}</p>

      {tournament?.start_time && <p className="tp-print-only">Start {tournament.start_time.slice(0, 5)}</p>}
      <div className="tp-tabs tp-no-print">
        <button type="button" className={`tp-tab ${view === 'category' ? 'active' : ''}`} onClick={() => setView('category')}>By category</button>
        <button type="button" className={`tp-tab ${view === 'court' ? 'active' : ''}`} onClick={() => setView('court')}>By shiaijo</button>
      </div>
      <Message type={msg.type || 'info'}>{msg.text}</Message>

      {drawn.length === 0 && (
        <Message type="info">
          No fights yet — make the draw first. <Link to={`/tournament/${tournamentId}/drawings`}>Draw</Link>
        </Message>
      )}

      {view === 'category' && drawn.length > 0 && (
        <>
          <div className="tp-no-print"><CategoryTabs categories={drawn} selectedId={selectedId} onSelect={setSelectedId} /></div>
          {category && <h3 className="tp-print-only">{category.name}</h3>}
          {category && (
            <>
              {poolNumbers.map((p) => (
                <div className="tp-card" key={p}>
                  <h3>Pool {p}</h3>
                  <FightRows list={catFights.filter((f) => f.label.startsWith(`F-P${p}.`)).map((f) => ({ f }))} />
                </div>
              ))}
              {catFights.some((f) => f.phase === 'ko') && (
                <div className="tp-card">
                  <h3>KO <span className="tp-muted">· {category.ko_template_code}</span></h3>
                  <FightRows list={catFights.filter((f) => f.phase === 'ko').map((f) => ({ f }))} />
                </div>
              )}
            </>
          )}
        </>
      )}

      {view === 'court' && drawn.length > 0 && perCourt.map(({ court, list, total }) => (
        <div className="tp-card tp-print-page" key={court}>
          <h3>
            Shiaijo {court}
            {tournament?.central_shiaijos?.includes(court) && <span className="tp-badge ok">central</span>}
            {' '}<span className="tp-muted">· {list.length} fights · ends ≈ {clock(tournament?.start_time, total)}</span>
          </h3>
          {list.length === 0 ? <p className="tp-muted">No fights.</p> : <FightRows list={list} showCategory showStart />}
        </div>
      ))}

      <p className="tp-muted">
        Start = {tournament?.start_time ? `from ${tournament.start_time.slice(0, 5)}, ` : 'set a start time in the Shiaijo plan for clock times; '}estimated from fight times only (no breaks or changeovers); the end-of-tournament block starts once
        every shiaijo has finished its other fights. ✎ = court changed by hand.
      </p>
      <div className="tp-actions tp-no-print">
        <button type="button" className="tp-btn" onClick={() => window.print()}>Print</button>
        <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/shiaijo`}>Shiaijo plan</Link>
        <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/brackets`}>Bracket editor</Link>
      </div>
    </div>
  );
}

export default FightPlan;
