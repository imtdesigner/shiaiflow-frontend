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
import './GuidePanel.css';

/**
 * Setup guide on the right (owner, 2026-11-20): the tournament timeline with
 * the current phase, its steps (one word, ✓ when done) and one hint sentence
 * for the next open step; clicking the hint goes where it is done. Hidden per
 * device (localStorage). Pages that know more than the database (the Create
 * form while typing, the tournament picked on the dashboard) tell it through
 * useGuide().
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
};

/** Scroll to the step's place on the page and flash it. */
function flash(anchor) {
  if (!anchor) return;
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

export default function GuidePanel() {
  const { create, picked } = useGuide();
  const location = useLocation();
  const navigate = useNavigate();
  const [off, setOff] = useState(() => { try { return localStorage.getItem(OFF_KEY) === '1'; } catch { return false; } });
  const [openMobile, setOpenMobile] = useState(false);
  const [data, setData] = useState(null); // { t, categories, entries, fights }

  const creating = location.pathname.startsWith('/create-tournament');
  const routeId = location.pathname.match(/^\/tournament\/([^/]+)/)?.[1] ?? null;
  const tid = creating ? null : routeId ?? (location.pathname.startsWith('/dashboard') ? picked : null);

  const load = useCallback(async () => {
    if (!tid) { setData(null); return; }
    try {
      const [t, cats] = await Promise.all([getTournament(tid), listCategories(tid)]);
      const drawnIds = cats.filter((c) => !['registration', 'cancelled'].includes(c.status)).map((c) => c.id);
      const liveIds = cats.filter((c) => c.status !== 'cancelled').map((c) => c.id);
      const [ens, fs] = await Promise.all([
        listEntriesFor(t.status === 'running' ? [] : liveIds),
        t.status === 'running' ? listRunFights(drawnIds) : [],
      ]);
      const drawnSet = new Set(drawnIds);
      const counted = ens.filter((e) => drawnSet.has(e.category_id));
      setData({
        t,
        categories: cats,
        entries: t.status === 'running' ? null : { total: counted.length, present: counted.filter((e) => e.checked_in).length, all: ens.length },
        fights: t.status === 'running' ? { total: fs.length, finished: fs.filter((f) => f.status === 'finished').length } : null,
      });
    } catch { setData(null); }
  }, [tid]);

  // refresh when the page changes, when the window gets focus, and every 15 s
  useEffect(() => { load(); }, [load, location.pathname]);
  useEffect(() => {
    const t = setInterval(load, 15000);
    window.addEventListener('focus', load);
    return () => { clearInterval(t); window.removeEventListener('focus', load); };
  }, [load]);

  // make room on the right while it is open (wide screens)
  useEffect(() => {
    document.body.classList.toggle('guide-open', !off);
    return () => document.body.classList.remove('guide-open');
  }, [off]);

  const setHidden = (v) => {
    setOff(v);
    try { localStorage.setItem(OFF_KEY, v ? '1' : '0'); } catch { /* private mode */ }
  };

  let phase = null;
  let steps = [];
  let title = '';
  if (creating) {
    phase = 'setup';
    steps = createSteps(create?.form, create?.categories);
    title = create?.form?.name?.trim() || 'New tournament';
  } else if (data?.t) {
    const ctx = { categories: data.categories, entries: data.entries, fights: data.fights };
    phase = tournamentPhase(data.t, ctx);
    steps = phaseSteps(phase, data.t, { ...ctx, entries: phase === 'signup' ? { total: data.entries?.all ?? 0 } : data.entries });
    title = data.t.name;
  }
  const now = currentStep(steps);

  const go = (s) => {
    if (!s) return;
    setOpenMobile(false);
    if (s.page === 'create') { flash(s.anchor); return; }
    const path = s.page === 'public' ? publicPath(data?.t) : PAGES[s.page]?.(tid);
    if (path && path !== location.pathname) navigate(path);
    flash(s.anchor);
  };

  if (off) {
    return (
      <button type="button" className="guide-tab" onClick={() => setHidden(false)} title="Show the setup guide">‹ Guide</button>
    );
  }

  const phaseIndex = PHASES.findIndex((p) => p.key === phase);

  return (
    <aside className={`guide ${openMobile ? 'open' : ''}`} aria-label="Setup guide">
      <div className="guide-head">
        <strong>Guide</strong>
        <span className="guide-title">{title}</span>
        <button type="button" className="guide-close" onClick={() => setHidden(true)} title="Hide the guide on this device">✕</button>
      </div>

      {/* mobile: one line with the hint; tap to open the whole guide */}
      <button type="button" className="guide-bar" onClick={() => setOpenMobile(!openMobile)}>
        {now ? now.hint : phase ? 'All steps of this phase are done.' : 'Create a tournament, or select one.'}
        <span className="guide-bar-more">{openMobile ? '▾' : '▴'}</span>
      </button>

      <div className="guide-body">
        <ol className="guide-phases">
          {PHASES.map((p, i) => (
            <li key={p.key} className={i < phaseIndex ? 'done' : i === phaseIndex ? 'current' : ''}>
              <span className="guide-dot">{i < phaseIndex ? '✓' : ''}</span>{p.label}
            </li>
          ))}
        </ol>

        {!phase ? (
          <div className="guide-hint">
            <p>Create a new tournament, or select one from the list.</p>
            <button type="button" className="tp-btn small" onClick={() => navigate('/create-tournament')}>Create a tournament</button>
          </div>
        ) : (
          <>
            <ul className="guide-steps">
              {steps.map((s) => (
                <li key={s.key} className={s.done ? 'done' : s === now ? 'current' : ''}>
                  <button type="button" onClick={() => go(s)}>
                    <span className="guide-check">{s.done ? '✓' : s === now ? '●' : '○'}</span>{s.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="guide-hint">
              {now ? (
                <>
                  <p>{now.hint}</p>
                  <button type="button" className="tp-btn small" onClick={() => go(now)}>Go there</button>
                </>
              ) : <p>All steps of this phase are done.</p>}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
