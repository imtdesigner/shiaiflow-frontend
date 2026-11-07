import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Message } from '../components/TournamentShell';
import { claimTournament } from '../lib/runApi';
import { supabase } from '../supabaseClient';
import './TournamentPages.css';

/**
 * Editors and tables join a tournament with its PIN (no account needed).
 * Before the start they edit the tournament; once it runs they open a
 * scoretable (and pick the shiaijo there) or Manage.
 */
function JoinCourt() {
  const { tournamentId } = useParams();
  const [tournament, setTournament] = useState(null);
  const [pin, setPinText] = useState('');
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('tournaments').select('id, name, status, shiaijo_count').eq('id', tournamentId).maybeSingle()
      .then(({ data }) => setTournament(data));
  }, [tournamentId, joined]);

  const join = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await claimTournament(tournamentId, pin.trim());
      setJoined(true);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const select = () => {
    try { sessionStorage.setItem('sf-selected-tournament', JSON.stringify({ id: tournamentId, name: tournament?.name })); } catch { /* ignore */ }
  };
  const running = tournament?.status === 'running';
  const courts = Array.from({ length: tournament?.shiaijo_count ?? 2 }, (_, i) => i + 1);

  return (
    <div className="tp-page" style={{ maxWidth: 520 }}>
      <h2>{tournament?.name ?? 'Tournament'}</h2>
      <p className="tp-subtitle">Editors and scoretables — type the PIN from the tournament owner.</p>
      <Message type="error">{error}</Message>

      {!joined ? (
        <form className="tp-card" onSubmit={join}>
          <label className="tp-field">
            PIN
            <input inputMode="numeric" autoComplete="one-time-code" value={pin} onChange={(e) => setPinText(e.target.value)} required />
          </label>
          <div className="tp-actions">
            <button type="submit" className="tp-btn" disabled={busy || !pin.trim()}>{busy ? 'Checking…' : 'Continue'}</button>
          </div>
        </form>
      ) : (
        <div className="tp-card">
          <h3>You're in</h3>
          {running ? (
            <>
              <p className="tp-muted">The tournament is running. Scoretable — pick your shiaijo:</p>
              <div className="tp-actions">
                {courts.map((n) => (
                  <Link key={n} className="tp-btn" to={`/tournament/${tournamentId}/score?court=${n}`} onClick={select}>Shiaijo {n}</Link>
                ))}
              </div>
              <div className="tp-actions">
                <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/manage`} onClick={select}>Manage</Link>
              </div>
            </>
          ) : (
            <>
              <p className="tp-muted">Before the start you can edit the tournament. Scoretables open once it is started.</p>
              <div className="tp-actions">
                <Link className="tp-btn" to="/dashboard" onClick={select}>Open the tournament</Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default JoinCourt;
