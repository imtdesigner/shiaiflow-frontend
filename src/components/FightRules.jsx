import { DEFAULT_CRITERIA, NEW_CATEGORY_CRITERIA } from '../lib/tournament/standings.js';
import { FIGHT_FIELDS, copyFields } from '../lib/tournament/categoryTemplates.js';
import Segmented from './Segmented';

const CRITERIA = {
  wins: 'Wins (more)',
  losses: 'Losses (fewer)',
  draws: 'Draws (more)',
  scored: 'Ippons scored (more)',
  conceded: 'Ippons conceded (fewer)',
  headToHead: 'Head-to-head (direct match)',
};

const min = (s) => (s ? String(s / 60) : '');
const sec = (v, fallback = null) => (v === '' || v == null ? fallback : Math.max(30, Math.round(Number(v) * 60) || 0));

/** Tie at time: encho until the first point, or encho N min then hantei. */
function TieRule({ title, seconds, hantei, onChange }) {
  const mode = seconds ? 'timed' : 'point';
  return (
    <div className="fr-tie">
      {title && <span className="fr-tie-title">{title}</span>}
      <Segmented options={[['point', 'Encho until the first point'], ['timed', 'Encho with a time limit']]} value={mode}
        onChange={(m) => onChange(m === 'point' ? { seconds: null, hantei: false } : { seconds: seconds || 120, hantei: true })} />
      {mode === 'timed' && (
        <span className="cr-range">
          <input type="number" step="0.5" min="0.5" value={min(seconds)} onChange={(e) => onChange({ seconds: sec(e.target.value, seconds), hantei })} /> min
          <label className="tp-check"><input type="checkbox" checked={!!hantei} onChange={(e) => onChange({ seconds, hantei: e.target.checked })} /> then hantei (the referees decide)</label>
        </span>
      )}
    </div>
  );
}

/** A labelled row: the question on the left, the answer (buttons, inputs) next to it. */
const Row = ({ label, children, note }) => (
  <div className="fr-row">
    <span className="fr-row-label">{label}</span>
    <span className="fr-row-value">{children}</span>
    {note && <span className="tp-muted fr-row-note">{note}</span>}
  </div>
);

/**
 * "Type of tournament" (part 2 of a category; owner, 2026-11-21): sanbon or
 * ippon-shobu, Pools on / off — with pools: size, uneven split, fight time,
 * how many go to the KO, draws, ranking — then the KO: fight times per round,
 * draws, 3rd place. Pools off = straight into the KO. `hidePools` leaves out
 * pools on / off, pool size and advancing (Drawings has them with the
 * small-category options).
 */
export default function FightRules({ category, onChange, hidePools = false, structureLocked = false, others = [] }) {
  const c = category;
  const set = (patch) => onChange({ ...c, ...patch });
  const criteria = c.ranking_criteria?.length ? c.ranking_criteria : DEFAULT_CRITERIA;
  const unused = Object.keys(CRITERIA).filter((k) => !criteria.includes(k));
  const moveCriterion = (i, d) => {
    const next = [...criteria];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set({ ranking_criteria: next });
  };
  const pools = Number(c.pool_size) !== 1;
  const advancing = Number(c.advancing);
  const ko = !pools || advancing > 0;
  const team = c.kind === 'team';
  const setPools = (on) => set(on ? { pool_size: 3, advancing: c.advancing || 2 } : { pool_size: 1 });

  // "Same as": copy everything of this part from another category of the same kind
  const sameAs = (id) => {
    const src = others.find((o) => String(o.id ?? o._key) === id);
    if (!src) return;
    const fields = FIGHT_FIELDS.filter((k) => !(hidePools && (k === 'pool_size' || k === 'advancing'))
      && !(structureLocked && (k === 'pool_split' || k === 'third_place')));
    onChange(copyFields(c, src, fields));
  };

  return (
    <div className="fr">
      {others.length > 0 && (
        <div className="fr-same">
          <span className="tp-muted">Same as</span>
          <select value="" onChange={(e) => sameAs(e.target.value)}>
            <option value="">— copy everything below from… —</option>
            {others.map((o) => <option key={o.id ?? o._key} value={String(o.id ?? o._key)}>{o.name}</option>)}
          </select>
        </div>
      )}

      <Row label="Points to win">
        <Segmented options={[['sanbon', 'Sanbon-shobu — 2 points win'], ['ippon', 'Ippon-shobu — 1 point wins']]}
          value={c.fight_system ?? 'sanbon'} onChange={(v) => set({ fight_system: v })} />
      </Row>
      {!hidePools && (
        <Row label="Pools" note={pools ? null : 'Everyone goes straight into the KO bracket.'}>
          <Segmented options={[[true, 'Pools, then KO'], [false, 'No pools — KO only']]} value={pools} onChange={setPools} disabled={structureLocked} />
        </Row>
      )}
      {structureLocked && <p className="tp-muted">Pools and bracket are drawn: pool sizes and the 3rd place fight change only after Undo draw. Times, draws and ranking can still change.</p>}

      {pools && (
        <div className="fr-part">
          <h5 className="fr-h">Pools</h5>
          <p className="tp-muted fr-note">In a pool everyone fights everyone (round robin).</p>
          {!hidePools && (
            <Row label="Fighters in one pool">
              <Segmented options={[2, 3, 4, 5, 6, 7, 8].map((n) => [n, String(n)])} value={Number(c.pool_size)}
                onChange={(n) => set({ pool_size: n })} disabled={structureLocked} />
            </Row>
          )}
          <Row label="If it does not divide evenly">
            <Segmented options={[['even', 'Smaller pools (7 → 3+2+2)'], ['bigger', 'Bigger pools (7 → 4+3)']]}
              value={c.pool_split ?? 'even'} onChange={(v) => set({ pool_split: v })} disabled={structureLocked} />
          </Row>
          <Row label="Fight time">
            <span className="cr-range"><input type="number" step="0.5" min="0.5" value={min(c.pool_fight_seconds)}
              onChange={(e) => set({ pool_fight_seconds: sec(e.target.value, c.pool_fight_seconds) })} /> min</span>
          </Row>
          {!hidePools && (
            <Row label="From each pool to the KO">
              <Segmented options={[[1, 'Winner only (1 per pool)'], [2, 'Winner and runner-up (2 per pool)']]} value={advancing}
                onChange={(n) => set({ advancing: n })} disabled={structureLocked} />
            </Row>
          )}
          {team ? (
            <>
              <Row label="Draw at time">
                <Segmented options={[['hikiwake', 'Team match stays a draw'], ['encho', 'Daihyosen decides']]}
                  value={c.pool_tie ?? 'hikiwake'} onChange={(v) => set({ pool_tie: v })} />
              </Row>
              <p className="tp-muted fr-note">
                A bout may end in a draw. More bout wins wins the team match; equal → more points. Still equal = a draw.
                <br /><strong>Daihyosen</strong> = one deciding bout: each team sends one member of its choice.
              </p>
            </>
          ) : (
            <>
              <Row label="Draw at time">
                <Segmented options={[['hikiwake', 'Hikiwake — a draw'], ['encho', 'Encho — extra time']]}
                  value={c.pool_tie ?? 'hikiwake'} onChange={(v) => set({ pool_tie: v })} />
              </Row>
              {c.pool_tie === 'encho' && (
                <TieRule title="" seconds={c.pool_encho_seconds} hantei={c.pool_hantei}
                  onChange={({ seconds, hantei }) => set({ pool_encho_seconds: seconds, pool_hantei: hantei })} />
              )}
            </>
          )}
          <h5 className="fr-h">Ranking in the pool — in this order</h5>
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
          {(unused.length > 0 || criteria.join() !== NEW_CATEGORY_CRITERIA.join()) && (
            <div className="tp-actions" style={{ marginTop: 0 }}>
              {unused.map((k) => (
                <button key={k} type="button" className="tp-btn secondary small" onClick={() => set({ ranking_criteria: [...criteria, k] })}>+ {CRITERIA[k]}</button>
              ))}
              {criteria.join() !== NEW_CATEGORY_CRITERIA.join() && (
                <button type="button" className="tp-btn secondary small" onClick={() => set({ ranking_criteria: [...NEW_CATEGORY_CRITERIA] })}>Back to default</button>
              )}
            </div>
          )}
          <p className="tp-muted">Still equal on everything for a place that matters → one deciding fight (ipponshobu); two such ties at once → the pool is fought again.</p>
        </div>
      )}

      {ko && (
        <div className="fr-part">
          <h5 className="fr-h">KO</h5>
          <Row label="Fight time" note="Quarterfinal and semifinal empty = same as the KO.">
            <span className="fr-times">
              {[['ko_fight_seconds', 'KO', false], ['qf_fight_seconds', 'Quarterfinal', true], ['sf_fight_seconds', 'Semifinal', true], ['final_fight_seconds', 'Final', false]].map(([k, label, optional]) => (
                <label key={k} className="fr-time">{label}
                  <span className="cr-range"><input type="number" step="0.5" min="0.5" value={min(c[k])} placeholder={optional ? '= KO' : ''}
                    onChange={(e) => set({ [k]: sec(e.target.value, optional ? null : c[k]) })} /> min</span>
                </label>
              ))}
            </span>
          </Row>
          {team ? (
            <>
              <Row label="Draw at time"><span>A tied team match → daihyosen (one deciding bout).</span></Row>
              <Row label="Daihyosen"><TieRule title="" seconds={c.daihyosen_encho_seconds} hantei={c.daihyosen_hantei}
                onChange={({ seconds, hantei }) => set({ daihyosen_encho_seconds: seconds, daihyosen_hantei: hantei })} /></Row>
              {!pools && <p className="tp-muted fr-note">A bout may end in a draw. More bout wins wins the team match; equal → more points; still equal → daihyosen.</p>}
            </>
          ) : (
            <Row label="Draw at time"><TieRule title="" seconds={c.ko_encho_seconds} hantei={c.ko_hantei}
              onChange={({ seconds, hantei }) => set({ ko_encho_seconds: seconds, ko_hantei: hantei })} /></Row>
          )}
          {(team ? c.daihyosen_encho_seconds && c.daihyosen_hantei : c.ko_encho_seconds && c.ko_hantei) ? (
            <Row label="Last rounds">
              <Segmented options={[['', 'Hantei as above'], ['final', 'No hantei in the final'], ['semifinal', 'No hantei in semifinals and final']]}
                value={c.no_hantei_from ?? ''} onChange={(v) => set({ no_hantei_from: v || null })} />
            </Row>
          ) : null}
          <Row label="3rd place">
            <Segmented options={[['shared', 'Shared — both semifinalists'], ['fight', 'Fight for 3rd place']]}
              value={c.third_place ?? 'shared'} onChange={(v) => set({ third_place: v })} disabled={structureLocked} />
          </Row>
        </div>
      )}
      {!ko && <p className="tp-muted">Pools only — no KO. The final ranking comes from the pools.</p>}
    </div>
  );
}
