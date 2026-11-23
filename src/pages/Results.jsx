import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackToDashboard, Message, useTournament } from '../components/TournamentShell';
import { SpiritList, candidateText, useResultsData } from '../components/FightingSpirit';
import { setFightingSpirit } from '../lib/runApi';
import { fightingSpirit, placeLabel } from '../lib/tournament/results.js';
import { fmtDate } from '../lib/format.js';
import './TournamentPages.css';

/**
 * Final results (owner, 2026-11-23): per category 1st, 2nd, 3rd, 3rd and the
 * Fighting spirit — the tables propose one each right after their last fight
 * of the category; a single proposal is taken, two are picked between, and
 * the organizer can always choose by hand. Print = all categories, or one.
 */
export default function Results() {
  const { tournamentId, tournament, categories, loading, error: loadError, reload: reloadT } = useTournament();
  const drawn = categories.filter((c) => !['registration', 'cancelled'].includes(c.status));
  const { ready, error, reload, byCategory } = useResultsData(drawn);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [changing, setChanging] = useState(null); // category id whose Fighting spirit is being changed
  const [printOnly, setPrintOnly] = useState(null);

  useEffect(() => {
    if (!printOnly) return undefined;
    const t = setTimeout(() => window.print(), 50);
    const after = () => setPrintOnly(null);
    window.addEventListener('afterprint', after);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', after); };
  }, [printOnly]);

  const pick = async (categoryId, competitorId) => {
    setBusy(true); setMsg('');
    try { await setFightingSpirit(categoryId, competitorId); await reloadT(); await reload(); setChanging(null); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="tp-page">Loading…</div>;
  if (loadError) return <div className="tp-page"><Message type="error">{loadError}</Message></div>;
  const withSpirit = tournament?.fighting_spirit !== false;

  return (
    <div className="tp-page">
      <BackToDashboard />
      <h2 id="g-results" className="tp-no-print">Results</h2>
      <div className="rs-head">
        <h2 className="tp-print-only">{tournament.name}</h2>
        <p className="tp-subtitle">
          <span className="tp-no-print">{tournament.name} · </span>
          {[tournament.start_date && fmtDate(tournament.start_date), tournament.venue, tournament.city].filter(Boolean).join(' · ')}
        </p>
      </div>
      <Message type="error">{error || msg}</Message>
      {drawn.length === 0 && <Message type="info">No results yet — the categories are not drawn.</Message>}
      {drawn.length > 0 && !ready && <p>Loading…</p>}

      {ready && drawn.map((c) => {
        const d = byCategory(c);
        const fs = fightingSpirit(c, d.proposals);
        const person = (id) => d.candidates.find((x) => x.competitorId === id);
        const tables = d.proposals.filter((p) => p.competitor_id);
        return (
          <div key={c.id} className={`tp-card rs-card ${printOnly && printOnly !== c.id ? 'tp-no-print' : ''}`}>
            <h3>
              {c.name}
              <span className="tp-muted"> · {d.results.finished ? 'final' : 'still fighting'}</span>
            </h3>
            {d.results.places.length === 0 ? <p className="tp-muted">No places for this format.</p> : (
              <table className="tp-table rs-places">
                <tbody>
                  {d.results.places.map((p, i) => (
                    <tr key={i}>
                      <td className="rs-place">{placeLabel(p.place)}</td>
                      <td><strong>{p.entryId ? d.nameOfEntry(p.entryId) : '—'}</strong></td>
                      <td className="tp-muted">{p.entryId ? d.clubOfEntry(p.entryId) : ''}</td>
                    </tr>
                  ))}
                  {withSpirit && (
                    <tr className="rs-spirit">
                      <td className="rs-place">Fighting spirit</td>
                      <td><strong>{fs.competitorId ? person(fs.competitorId)?.name ?? '—' : '—'}</strong>{fs.competitorId && person(fs.competitorId)?.team && <span className="tp-muted"> · {person(fs.competitorId).team}</span>}</td>
                      <td className="tp-muted">{fs.competitorId ? person(fs.competitorId)?.club ?? '' : ''}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {withSpirit && (
              <div className="rs-spirit-edit tp-no-print">
                <p className="tp-muted">
                  {fs.from === 'organizer' && 'Fighting spirit chosen by the organizer. '}
                  {fs.from === 'table' && 'Fighting spirit as proposed by the table. '}
                  {tables.length === 0 && 'No proposal from the tables yet (asked after the last fight of the category on each shiaijo). '}
                  {tables.length > 0 && `Tables: ${tables.map((p) => `shiaijo ${p.shiaijo} → ${candidateText(person(p.competitor_id))}`).join('; ')}.`}
                </p>
                {!fs.competitorId && fs.picks.length > 1 && (
                  <div className="tp-actions">
                    <span>Two proposals — pick one:</span>
                    {fs.picks.map((id) => (
                      <button key={id} type="button" className="tp-btn small" disabled={busy} onClick={() => pick(c.id, id)}>{person(id)?.name ?? '—'}</button>
                    ))}
                  </div>
                )}
                <div className="tp-actions">
                  <button type="button" className="tp-btn secondary small" onClick={() => setChanging(changing === c.id ? null : c.id)}>
                    {changing === c.id ? 'Close' : 'Choose by hand…'}
                  </button>
                  {fs.from === 'organizer' && (
                    <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => pick(c.id, null)}>Back to the tables' proposal</button>
                  )}
                  <button type="button" className="tp-btn secondary small" onClick={() => setPrintOnly(c.id)}>Print this category</button>
                </div>
                {changing === c.id && <SpiritList candidates={d.candidates} selected={fs.competitorId} disabled={busy} onPick={(id) => pick(c.id, id)} />}
              </div>
            )}
            {!withSpirit && (
              <div className="tp-actions tp-no-print">
                <button type="button" className="tp-btn secondary small" onClick={() => setPrintOnly(c.id)}>Print this category</button>
              </div>
            )}
          </div>
        );
      })}

      <p className="tp-muted tp-no-print">
        Places fill in as the finals end. {withSpirit ? 'Fighting spirit can be switched off in Edit tournament → Tournament basics.' : 'Fighting spirit is switched off (Edit tournament → Tournament basics).'}
      </p>
      <div className="tp-actions tp-no-print">
        <button type="button" className="tp-btn" onClick={() => window.print()} disabled={!ready}>Print all</button>
        <button type="button" className="tp-btn secondary" onClick={reload}>Refresh</button>
        <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/manage`}>Manage</Link>
      </div>
    </div>
  );
}
