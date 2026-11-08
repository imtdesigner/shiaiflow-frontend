import { DEFAULT_CRITERIA } from '../lib/tournament/standings.js';

const CRITERIA = {
  wins: 'Wins (more)',
  losses: 'Losses (fewer)',
  draws: 'Draws (more)',
  scored: 'Ippons scored (more)',
  conceded: 'Ippons conceded (fewer)',
  headToHead: 'Head-to-head',
};

const min = (s) => (s ? String(s / 60) : '');
const sec = (v, fallback = null) => (v === '' || v == null ? fallback : Math.max(30, Math.round(Number(v) * 60) || 0));

function Minutes({ label, value, onChange, optional = false, placeholder }) {
  return (
    <label className="tp-field">
      {label}
      <input type="number" step="0.5" min="0.5" value={min(value)} placeholder={placeholder}
        onChange={(e) => onChange(sec(e.target.value, optional ? null : value))} />
    </label>
  );
}

/** Tie at time: encho until the first point, or encho N min then hantei. */
function TieRule({ title, seconds, hantei, onChange }) {
  const mode = seconds ? 'timed' : 'point';
  return (
    <div className="fr-tie">
      <span className="fr-tie-title">{title}</span>
      <select value={mode} onChange={(e) => onChange(e.target.value === 'point' ? { seconds: null, hantei: false } : { seconds: seconds || 120, hantei: true })}>
        <option value="point">encho until the first point</option>
        <option value="timed">encho with a time limit, then hantei</option>
      </select>
      {mode === 'timed' && (
        <span className="cr-range">
          <input type="number" step="0.5" min="0.5" value={min(seconds)} onChange={(e) => onChange({ seconds: sec(e.target.value, seconds), hantei })} /> min
          <label className="tp-check"><input type="checkbox" checked={!!hantei} onChange={(e) => onChange({ seconds, hantei: e.target.checked })} /> hantei after it</label>
        </span>
      )}
    </div>
  );
}

/**
 * How a category is fought (part 2 of a category): pools, system, fight
 * times per round, ties (pools, KO, daihyosen), 3rd place and the pool
 * ranking criteria. `hidePools` leaves out pool size / advancing (Drawings
 * has them with the small-category options).
 */
export default function FightRules({ category, onChange, hidePools = false }) {
  const c = category;
  const set = (patch) => onChange({ ...c, ...patch });
  const criteria = c.ranking_criteria?.length ? c.ranking_criteria : DEFAULT_CRITERIA;
  const unused = Object.keys(CRITERIA).filter((k) => !criteria.includes(k));
  const moveCriterion = (i, d) => {
    const next = [...criteria];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set({ ranking_criteria: next });
  };
  const direct = Number(c.pool_size) === 1;

  return (
    <div className="fr">
      <div className="tp-grid">
        {!hidePools && (
          <>
            <label className="tp-field">
              Per pool
              <select value={c.pool_size} onChange={(e) => set({ pool_size: Number(e.target.value) })}>
                <option value={1}>direct KO</option>
                {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="tp-field">
              Advancing per pool
              <select value={c.advancing} onChange={(e) => set({ advancing: Number(e.target.value) })} disabled={direct}>
                <option value={0}>pools only</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </label>
          </>
        )}
        <label className="tp-field">
          Uneven number of entries
          <select value={c.pool_split ?? 'even'} disabled={direct} onChange={(e) => set({ pool_split: e.target.value })}>
            <option value="even">even pools (7 by 3 → 3+2+2)</option>
            <option value="bigger">bigger pools (7 by 3 → 4+3)</option>
          </select>
        </label>
        <label className="tp-field">
          Pool of 4
          <select value="full" disabled title="Coming later: the minimum-fights format is still being worked out">
            <option value="full">full round robin (6 fights)</option>
            <option value="min">minimum fights (coming later)</option>
          </select>
        </label>
        <label className="tp-field">
          System
          <select value={c.fight_system ?? 'sanbon'} onChange={(e) => set({ fight_system: e.target.value })}>
            <option value="sanbon">sanbon-shobu (two ippons win)</option>
            <option value="ippon">ippon-shobu (first point wins)</option>
          </select>
        </label>
        <label className="tp-field">
          3rd place
          <select value={c.third_place ?? 'shared'} disabled={Number(c.advancing) === 0 && !direct} onChange={(e) => set({ third_place: e.target.value })}>
            <option value="shared">shared (both semifinal losers)</option>
            <option value="fight">fight for 3rd place</option>
          </select>
        </label>
      </div>

      <h5 className="fr-h">Fight time (min)</h5>
      <div className="tp-grid">
        <Minutes label="Pool" value={c.pool_fight_seconds} onChange={(v) => set({ pool_fight_seconds: v })} />
        <Minutes label="KO" value={c.ko_fight_seconds} onChange={(v) => set({ ko_fight_seconds: v })} />
        <Minutes label="Quarterfinal" optional placeholder="= KO" value={c.qf_fight_seconds} onChange={(v) => set({ qf_fight_seconds: v })} />
        <Minutes label="Semifinal" optional placeholder="= KO" value={c.sf_fight_seconds} onChange={(v) => set({ sf_fight_seconds: v })} />
        <Minutes label="Final" value={c.final_fight_seconds} onChange={(v) => set({ final_fight_seconds: v })} />
      </div>

      <h5 className="fr-h">Tie at time</h5>
      <div className="fr-tie">
        <span className="fr-tie-title">Pools</span>
        <select value={c.pool_tie ?? 'hikiwake'} onChange={(e) => set({ pool_tie: e.target.value })}>
          <option value="hikiwake">hikiwake (draw)</option>
          <option value="encho">encho</option>
        </select>
      </div>
      {c.pool_tie === 'encho' && (
        <TieRule title="Pool encho" seconds={c.pool_encho_seconds} hantei={c.pool_hantei}
          onChange={({ seconds, hantei }) => set({ pool_encho_seconds: seconds, pool_hantei: hantei })} />
      )}
      <TieRule title="KO" seconds={c.ko_encho_seconds} hantei={c.ko_hantei}
        onChange={({ seconds, hantei }) => set({ ko_encho_seconds: seconds, ko_hantei: hantei })} />
      {c.kind === 'team' && (
        <TieRule title="Daihyosen" seconds={c.daihyosen_encho_seconds} hantei={c.daihyosen_hantei}
          onChange={({ seconds, hantei }) => set({ daihyosen_encho_seconds: seconds, daihyosen_hantei: hantei })} />
      )}

      {!direct && (
        <>
          <h5 className="fr-h">Pool ranking — criteria in order</h5>
          <ol className="fr-criteria">
            {criteria.map((k, i) => (
              <li key={k}>
                <span>{CRITERIA[k] ?? k}</span>
                <button type="button" className="tp-btn secondary small" disabled={i === 0} onClick={() => moveCriterion(i, -1)} aria-label="Up">↑</button>
                <button type="button" className="tp-btn secondary small" disabled={i === criteria.length - 1} onClick={() => moveCriterion(i, 1)} aria-label="Down">↓</button>
                <button type="button" className="tp-btn secondary small" disabled={criteria.length === 1} onClick={() => set({ ranking_criteria: criteria.filter((x) => x !== k) })} aria-label="Remove">✕</button>
              </li>
            ))}
          </ol>
          {(unused.length > 0 || criteria.join() !== DEFAULT_CRITERIA.join()) && (
            <div className="tp-actions" style={{ marginTop: 0 }}>
              {unused.map((k) => (
                <button key={k} type="button" className="tp-btn secondary small" onClick={() => set({ ranking_criteria: [...criteria, k] })}>+ {CRITERIA[k]}</button>
              ))}
              {criteria.join() !== DEFAULT_CRITERIA.join() && (
                <button type="button" className="tp-btn secondary small" onClick={() => set({ ranking_criteria: [...DEFAULT_CRITERIA] })}>Back to the Excel order</button>
              )}
            </div>
          )}
          <p className="tp-muted">Still tied on every criterion for a place that matters → ipponshobu; two ties at once → the pool is replayed.</p>
        </>
      )}
    </div>
  );
}
