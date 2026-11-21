import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BackToDashboard, Message, useTournament } from '../components/TournamentShell';
import SignupSetup from '../components/SignupSetup';
import Segmented from '../components/Segmented';
import ShiaijoPlan from './ShiaijoPlan';
import './TournamentPages.css';

const STEPS = [['create', '1 · Tournament & categories'], ['signup', '2 · Signup setup'], ['shiaijo', '3 · Shiaijo plan']];

/**
 * The new-tournament wizard after Create (owner, 2026-11-22): just the
 * continuation of the Create form — 2 Signup setup, 3 Shiaijo plan — with the
 * same parts as in Edit tournament; at the end, a pointer to Edit tournament
 * for the other options.
 */
export default function SetupWizard() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const { tournament, categories, reload, error, loading } = useTournament();
  const [params, setParams] = useSearchParams();
  const step = params.get('step') === 'shiaijo' ? 'shiaijo' : 'signup';
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const run = async (fn, ok) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try { await fn(); await reload(); if (ok) setMsg({ type: 'success', text: ok }); }
    catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };
  const go = (s) => { setParams({ step: s }); window.scrollTo({ top: 0 }); };

  if (loading) return <div className="tp-page">Loading…</div>;
  if (error) return <div className="tp-page"><Message type="error">{error}</Message></div>;

  return (
    <div className="tp-page">
      <BackToDashboard />
      <h2>New tournament</h2>
      <p className="tp-subtitle">{tournament?.name} — created. Two more steps.</p>
      <Segmented className="et-tabs wz-steps" options={STEPS} value={step}
        onChange={(s) => (s === 'create' ? navigate(`/tournament/${tournamentId}/edit`) : go(s))} />
      <Message type={msg.type || 'info'}>{msg.text}</Message>

      {step === 'signup' && (
        <>
          <SignupSetup tournament={tournament} categories={categories} run={run} busy={busy} />
          <div className="tp-actions">
            <button type="button" className="tp-btn" onClick={() => go('shiaijo')}>Next: shiaijo plan</button>
          </div>
        </>
      )}

      {step === 'shiaijo' && (
        <>
          <ShiaijoPlan embedded />
          <div className="tp-card wz-done">
            <h3>Done</h3>
            <p>
              The tournament is set up. Check the other options in <strong>Edit tournament</strong> — publishing, the draws on the public page,
              the PIN for editors and tables — and the categories in Drawings.
            </p>
            <div className="tp-actions">
              <button type="button" className="tp-btn secondary" onClick={() => go('signup')}>Back: signup setup</button>
              <Link className="tp-btn" to={`/tournament/${tournamentId}/edit`}>Go to Edit tournament</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
