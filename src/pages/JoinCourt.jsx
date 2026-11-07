import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Message } from '../components/TournamentShell';
import { claimCourt } from '../lib/runApi';
import './TournamentPages.css';

/** Scorer joins a shiaijo with the PIN from the manager (no account needed). */
function JoinCourt() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const [court, setCourt] = useState(1);
  const [pin, setPinText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const join = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await claimCourt(tournamentId, court, pin.trim());
      navigate(`/tournament/${tournamentId}/score`, { replace: true });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="tp-page" style={{ maxWidth: 420 }}>
      <h2>Scoretable</h2>
      <p className="tp-subtitle">Choose your shiaijo and type the PIN from the tournament manager.</p>
      <Message type="error">{error}</Message>
      <form className="tp-card" onSubmit={join}>
        <label className="tp-field">
          Shiaijo
          <select value={court} onChange={(e) => setCourt(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>Shiaijo {n}</option>)}
          </select>
        </label>
        <label className="tp-field">
          PIN
          <input inputMode="numeric" autoComplete="one-time-code" value={pin} onChange={(e) => setPinText(e.target.value)} required />
        </label>
        <div className="tp-actions">
          <button type="submit" className="tp-btn" disabled={busy || !pin.trim()}>{busy ? 'Joining…' : 'Open scoretable'}</button>
        </div>
      </form>
    </div>
  );
}

export default JoinCourt;
