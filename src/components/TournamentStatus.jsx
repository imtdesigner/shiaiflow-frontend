import { Link } from 'react-router-dom';
import Segmented from './Segmented';
import { useTournamentPhase } from './GuidePanel';
import { setDrawsConfirmed, updateTournament } from '../lib/api';
import { fmtDateTime } from '../lib/format.js';

/** Which status a phase (guide.js tournamentPhase) is in. */
const CURRENT = { setup: 'setup', signup: 'signup', draw: 'draws', register: 'register', start: 'register', live: 'running', finished: 'finished', past: 'finished' };
const ORDER = ['setup', 'published', 'signup', 'draws', 'register', 'running', 'finished'];

/**
 * Edit tournament, left column (owner, 2026-11-22): every status a tournament
 * goes through — setup, published, signup, draws (made / on the public page /
 * confirmed), registration (check-in on the day), running, finished — with the
 * current one marked and the switches right there instead of hidden in the page.
 */
export default function TournamentStatus({ tournament: t, categories, role, waitingVerification, onChanged, run }) {
  const { data, phase, reload } = useTournamentPhase(t?.id ?? null);
  if (!t) return null;
  const owner = role === 'owner';
  const live = categories.filter((c) => c.status !== 'cancelled');
  const drawn = live.filter((c) => c.status !== 'registration');
  const allDrawn = live.length > 0 && drawn.length === live.length;
  const deadlinePassed = t.registration_deadline && new Date(t.registration_deadline) < new Date();
  const signupOpen = t.registration_open && !deadlinePassed;
  const running = t.status === 'running';
  const current = t.is_public ? CURRENT[phase] ?? 'setup' : 'published';
  const at = ORDER.indexOf(current);
  const change = (fn, ok) => run(async () => { await fn(); await onChanged?.(); await reload(); }, ok);
  const set = (field, value, ok) => change(() => updateTournament(t.id, { [field]: value }), ok);
  const cls = (key) => {
    const i = ORDER.indexOf(key);
    return `ts-step ${i < at ? 'past' : i === at ? 'now' : 'next'}`;
  };

  return (
    <aside className="ts">
      <h3>Tournament status</h3>
      <ol className="ts-steps">
        <li className={cls('setup')}>
          <strong>Setup</strong>
          <span className="tp-muted">Details, categories, signup form, shiaijo plan.</span>
        </li>
        <li className={cls('published')}>
          <strong>Published</strong>
          <Segmented className="seg-small" options={[[false, 'Hidden'], [true, 'Published']]} value={!!t.is_public}
            disabled={!owner || (waitingVerification && !t.is_public)}
            onChange={(v) => set('is_public', v, v ? 'Published — on the home page and the public page.' : 'Hidden from the public.')} />
          <span className="tp-muted">
            {t.is_public ? 'Listed on the home page; the public page is open.' : 'Only you and your editors see it.'}
            {!owner && ' Only the owner can publish.'}
            {waitingVerification && !t.is_public && ' Waits for the verification of your account.'}
          </span>
        </li>
        <li className={cls('signup')}>
          <strong>Signup</strong>
          <Segmented className="seg-small" options={[[true, 'Open'], [false, 'Closed']]} value={!!t.registration_open}
            onChange={(v) => set('registration_open', v, v ? 'Signup open.' : 'Signup closed.')} />
          <span className="tp-muted">
            {t.registration_open && deadlinePassed ? 'Closed — the deadline has passed. ' : ''}
            {t.registration_deadline ? `Deadline ${fmtDateTime(t.registration_deadline)}.` : 'No deadline — close it by hand.'}
            {signupOpen && !t.is_public ? ' Competitors can sign up once the tournament is published.' : ''}
          </span>
        </li>
        <li className={cls('draws')}>
          <strong>Draws</strong>
          <span>{drawn.length} / {live.length} categories drawn · <Link to={`/tournament/${t.id}/drawings`}>Drawings</Link></span>
          <span className="ts-sub">On the public page</span>
          <Segmented className="seg-small" options={[[false, 'Hidden'], [true, 'Published']]} value={t.draws_public !== false}
            onChange={(v) => set('draws_public', v, v ? 'Draws and schedule are on the public page.' : 'Draws hidden from the public page.')} />
          {allDrawn && (t.draws_confirmed ? (
            <span className="tp-muted">
              <span className="tp-badge ok">confirmed</span> The setup is fixed{owner ? '' : ' for editors'}.
              {owner && <> <button type="button" className="tp-btn secondary small" onClick={() => change(() => setDrawsConfirmed(t.id, false), 'Draws reopened.')}>Reopen</button></>}
            </span>
          ) : (
            <button type="button" className="tp-btn secondary small"
              onClick={() => window.confirm('Confirm all draws? Editors can no longer change the setup; entries can still be adjusted.')
                && change(() => setDrawsConfirmed(t.id, true), 'Draws confirmed.')}>Confirm draws</button>
          ))}
        </li>
        <li className={cls('register')}>
          <strong>Registration</strong>
          <span className="tp-muted">
            Check-in on the day{data?.entries ? ` — ${data.entries.present} / ${data.entries.total} present` : ''}.
          </span>
          <Link to={`/tournament/${t.id}/registration`}>Registration</Link>
        </li>
        <li className={cls('running')}>
          <strong>Running</strong>
          {running
            ? <span><span className="tp-badge ok">running</span> <Link to={`/tournament/${t.id}/manage`}>Manage</Link></span>
            : <span className="tp-muted">Start it in <Link to={`/tournament/${t.id}/manage`}>Manage</Link> when everyone has checked in.</span>}
        </li>
        <li className={cls('finished')}>
          <strong>Finished</strong>
          <span className="tp-muted">{data?.fights ? `${data.fights.finished} / ${data.fights.total} fights done.` : 'When every fight is done.'}</span>
        </li>
      </ol>
    </aside>
  );
}
