import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getTournament, listCategories, listEntriesFor } from '../lib/api';
import { listRunFights } from '../lib/runApi';
import { publicPath } from '../lib/tournament/days.js';
import {
  PHASES, createSteps, currentStep, phaseSteps, tournamentPhase,
} from '../lib/tournament/guide.js';

export { PHASES };
import './GuidePanel.css';

/**
 * Setup guide (owner, 2026-11-20): a thin line on the right with the steps of
 * the tournament's current phase (one word each; past steps almost invisible)
 * and only the hint of the next open step stands out, left of the line;
 * clicking it goes where it is done. The phase itself is shown in the
 * tournament overview (dashboard), not here. Hidden per device (localStorage).
 * Pages that know more than the database (the Create form while typing, the
 * tournament picked on the dashboard) tell it through useGuide().
 */
const GuideContext = createContext({ setCreate: () => {}, setPicked: () => {} });
export const useGuide = () => useContext(GuideContext);

export function GuideProvider({ children }) {
  const [create, setCreate] = useState(null); // { form, categories } while creating
  const [picked, setPicked] = useState(null); // tournament id picked on the dashboard
  const value = useMemo(() => ({ create, setCreate, picked, setPicked }), [create, picked]);
  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>;
}

const OFF_KEY = 'sf-guide-off';
const PAGES = {
  edit: (id) => `/tournament/${id}/edit`,
  drawings: (id) => `/tournament/${id}/drawings`,
  registration: (id) => `/tournament/${id}/registration`,
  shiaijo: (id) => `/tournament/${id}/shiaijo`,
  manage: (id) => `/tournament/${id}/manage`,
  brackets: (id) => `/tournament/${id}/brackets`,
  fights: (id) => `/tournament/${id}/fights`,
};

/** Pages of a tournament opened on this device (steps that only ask to check a page). */
const SEEN_KEY = (tid) => `sf-guide-seen-${tid}`;
const readSeen = (tid) => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY(tid)) ?? '[]')); } catch { return new Set(); } };

/** Scroll to the step's place on the page and flash it. */
function flash(anchor) {
  if (!anchor) return;
  // pages with tabs (Edit tournament) open the tab that holds the anchor
  setTimeout(() => window.dispatchEvent(new CustomEvent('guide-goto', { detail: anchor })), 50);
  let tries = 0;
  const t = setInterval(() => {
    const el = document.getElementById(anchor);
    tries += 1;
    if (!el && tries < 20) return;
    clearInterval(t);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('guide-flash');
    setTimeout(() => el.classList.remove('guide-flash'), 1800);
    el.querySelector?.('input, select, textarea')?.focus({ preventScroll: true });
  }, 100);
}

/**
 * State of a tournament for the guide: { t, categories, entries, fights } and
 * its phase. Refreshes when the page changes, on window focus and every 15 s.
 */
export function useTournamentPhase(tid) {
  const location = useLocation();
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    if (!tid) { setData(null); return; }
    try {
      const [t, cats] = await Promise.all([getTournament(tid), listCategories(tid)]);
      const drawnIds = cats.filter((c) => !['registration', 'cancelled'].includes(c.status)).map((c) => c.id);
      const liveIds = cats.filter((c) => c.status !== 'cancelled').map((c) => c.id);
      const running = t.status === 'running';
      const [ens, fs] = await Promise.all([
        listEntriesFor(running ? [] : liveIds),
        running ? listRunFights(drawnIds) : [],
      ]);
      const drawnSet = new Set(drawnIds);
      const counted = ens.filter((e) => drawnSet.has(e.category_id));
      setData({
        t,
        categories: cats,
        entries: running ? null : { total: counted.length, present: counted.filter((e) => e.checked_in).length, all: ens.length },
        fights: running ? { total: fs.length, finished: fs.filter((f) => f.status === 'finished').length } : null,
      });
    } catch { setData(null); }
  }, [tid]);

  useEffect(() => { load(); }, [load, location.pathname]);
  useEffect(() => {
    const t = setInterval(load, 15000);
    window.addEventListener('focus', load);
    return () => { clearInterval(t); window.removeEventListener('focus', load); };
  }, [load]);

  const phase = data?.t && data.t.id === tid
    ? tournamentPhase(data.t, { categories: data.categories, entries: data.entries, fights: data.fights })
    : null;
  return { data: phase ? data : null, phase, reload: load };
}

/** The tournament's current phase as a small label (dashboard overview). */
export function PhaseLabel({ phase }) {
  const p = PHASES.find((x) => x.key === phase);
  return p ? <span className={`guide-phase-label ${phase}`}>{p.label}</span> : null;
}

export default function GuidePanel() {
  const { create, picked } = useGuide();
  const location = useLocation();
  const navigate = useNavigate();
  const [off, setOff] = useState(() => { try { return localStorage.getItem(OFF_KEY) === '1'; } catch { return false; } });

  const creating = location.pathname.startsWith('/create-tournament');
  // Create form: which guide place has the focus, and which were left (a step moves on only then)
  const [focus, setFocus] = useState({ current: null, left: new Set() });
  useEffect(() => {
    if (!creating) return undefined;
    setFocus({ current: null, left: new Set() });
    const anchorOf = (el) => el?.closest?.('[id^="g-"]')?.id ?? null;
    const onIn = (e) => setFocus((f) => ({ ...f, current: anchorOf(e.target) }));
    const onOut = (e) => {
      const a = anchorOf(e.target);
      const to = anchorOf(e.relatedTarget);
      if (!a || a === to) return;
      setFocus((f) => ({ current: to, left: new Set([...f.left, a]) }));
    };
    // a click also counts (Safari does not focus checkboxes and buttons on click)
    const onDown = (e) => {
      const a = anchorOf(e.target);
      setFocus((f) => (f.current && f.current !== a
        ? { current: a, left: new Set([...f.left, f.current]) }
        : { ...f, current: a }));
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [creating]);
  const routeId = location.pathname.match(/^\/tournament\/([^/]+)/)?.[1] ?? null;
  const tid = creating ? null : routeId ?? (location.pathname.startsWith('/dashboard') ? picked : null);
  const { data, phase: tPhase } = useTournamentPhase(tid);

  // remember the tournament pages opened here
  const page = location.pathname.match(/^\/tournament\/[^/]+\/([a-z]+)/)?.[1] ?? null;
  const [seen, setSeen] = useState(new Set());
  useEffect(() => {
    if (!tid) { setSeen(new Set()); return; }
    const set = readSeen(tid);
    if (page && routeId === tid && !set.has(page)) {
      set.add(page);
      try { localStorage.setItem(SEEN_KEY(tid), JSON.stringify([...set])); } catch { /* private mode */ }
    }
    setSeen(set);
  }, [tid, page, routeId]);

  // make room on the right while it is shown (wide screens)
  useEffect(() => {
    document.body.classList.toggle('guide-open', !off);
    return () => document.body.classList.remove('guide-open');
  }, [off]);

  const setHidden = (v) => {
    setOff(v);
    try { localStorage.setItem(OFF_KEY, v ? '1' : '0'); } catch { /* private mode */ }
  };

  // the focus is in this place, or in a place inside it (Create form)
  const inside = (a) => {
    if (!focus.current || !a) return false;
    if (focus.current === a) return true;
    const el = document.getElementById(a);
    const cur = document.getElementById(focus.current);
    return !!(el && cur && el.contains(cur));
  };
  let steps = [];
  let phase = null;
  if (creating) {
    phase = 'setup';
    steps = createSteps(create?.form, create?.categories, { inside, left: (a) => focus.left.has(a) });
  } else if (data) {
    phase = tPhase;
    const ctx = { categories: data.categories, entries: data.entries, fights: data.fights };
    steps = phaseSteps(phase, data.t, { ...ctx, seen, entries: phase === 'signup' ? { total: data.entries?.all ?? 0 } : data.entries });
  }
  // the hint follows the place being filled in (the most specific one); else the first open step
  const now = (creating ? steps.filter((s) => inside(s.anchor)).at(-1) : null) ?? currentStep(steps);

  const go = (s) => {
    if (!s) return;
    if (s.page === 'create') { flash(s.anchor); return; }
    const path = s.page === 'public' ? publicPath(data?.t) : PAGES[s.page]?.(tid);
    if (path && path !== location.pathname) navigate(path);
    flash(s.anchor);
  };

  if (off) {
    return <button type="button" className="guide-tab" onClick={() => setHidden(false)} title="Show the setup guide">‹ Guideline</button>;
  }

  return (
    <aside className="guide" aria-label="Setup guide">
      <button type="button" className="guide-close" onClick={() => setHidden(true)} title="Hide the guide on this device">✕</button>
      {phase && (
        // the tournament's lifecycle as info: the current phase, all phases on hover
        <div className="guide-phase" tabIndex={0}>
          <span className="guide-phase-now">{PHASES.find((p) => p.key === phase)?.label}</span>
          <ol className="guide-phase-all">
            {PHASES.map((p, i) => {
              const at = PHASES.findIndex((x) => x.key === phase);
              return <li key={p.key} className={i < at ? 'past' : i === at ? 'now' : ''}>{i < at ? '✓ ' : ''}{p.label}</li>;
            })}
          </ol>
        </div>
      )}
      {!phase ? (
        <ol className="guide-line">
          <li className="now">
            <button type="button" onClick={() => navigate('/create-tournament')}>
              <span className="guide-hint">Create a tournament, or select one.</span>
            </button>
          </li>
        </ol>
      ) : (
        <ol className="guide-line">
          {steps.map((s) => {
            const cls = s === now ? 'now' : s.done ? 'done' : 'next';
            return (
              <li key={s.key} className={cls}>
                <button type="button" onClick={() => go(s)} title={s.hint}>
                  <span className="guide-label">{s.done ? '✓ ' : ''}{s.label}</span>
                  {s === now && <span className="guide-hint">{s.hint} →</span>}
                </button>
              </li>
            );
          })}
          {!now && <li className="now"><span className="guide-hint quiet">All done in this phase.</span></li>}
        </ol>
      )}
    </aside>
  );
}
