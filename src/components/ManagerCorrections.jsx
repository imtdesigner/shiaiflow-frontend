import { useEffect, useState } from 'react';
import { koCheck, poolPlacesMap } from '../lib/tournament/corrections.js';
import { slotLabel } from '../lib/tournament/ko.js';
import { koRoundLabel } from '../lib/tournament/run.js';
import { listCorrections } from '../lib/runApi';
import { listEventsFor } from '../lib/api';
import { boutResult, scoringOptions } from '../lib/tournament/scoring.js';

/**
 * Manager corrections in Manage (owner, 2026-11-24): KO conflicts after a
 * correction (replay — the default — or keep as fought), the KO fights per
 * category (change the fighters of a fight not started yet, Correct a
 * finished one), the pool order by hand and the log of every correction.
 */

/** KO state per category from what Manage already has (fights + pools with places). */
export function koConflicts(categories, fights, pools) {
  return categories.filter((c) => c.ko_template?.length || fights.some((f) => f.category_id === c.id && f.phase === 'ko')).map((c) => {
    const ko = fights.filter((f) => f.category_id === c.id && f.phase === 'ko');
    const places = poolPlacesMap(pools.filter((p) => p.category_id === c.id), c.advancing, c.pool_size === 1 ? ko : null);
    return { category: c, ko, ...koCheck(ko, places) };
  });
}

/** Banner: KO fights fought with other fighters than they should have after a correction. */
export function KoConflicts({ states, nameOf, busy, onReplay, onKeep }) {
  const withConflicts = states.filter((s) => s.conflicts.length);
  if (!withConflicts.length) return null;
  const side = (id, from) => (id ? nameOf(id) : from?.length ? `winner of F-${from[0]} (fought again)` : '—');
  return (
    <div className="tp-card mc-conflict" id="g-conflicts">
      <h3>After a correction: KO fights to check</h3>
      <p className="tp-muted" style={{ marginTop: 0 }}>
        A correction changed who should be in these KO fights, but they were already fought (or are running). Fight them again
        with the right fighters — they go first on their shiaijo and what follows waits — or keep them as they were fought.
      </p>
      {withConflicts.map(({ category, conflicts }) => (
        <div key={category.id} className="mc-chain">
          <h4>{category.name}</h4>
          <ol>
            {conflicts.map((c) => (
              <li key={c.fight.id}>
                <strong>{c.fight.label}</strong> <span className="tp-muted">({c.fight.status === 'running' ? 'running now' : 'fought'}, shiaijo {c.fight.shiaijo})</span>
                {' '}was <span className="aka">{nameOf(c.fight.red_entry_id)}</span> – <span className="shiro">{nameOf(c.fight.white_entry_id)}</span>
                {' '}→ should be <span className="aka">{side(c.red, c.from)}</span> – <span className="shiro">{side(c.white, c.from)}</span>
                {c.cause === 'earlier' && <span className="tp-muted"> (follows from F-{c.from.join(', F-')})</span>}
              </li>
            ))}
          </ol>
          <div className="tp-actions">
            <button type="button" className="tp-btn" disabled={busy || conflicts.some((c) => c.fight.status === 'running')}
              title={conflicts.some((c) => c.fight.status === 'running') ? 'A fight of the list is running — let the table finish it first' : ''}
              onClick={() => onReplay(category, conflicts)}>Fight {conflicts.length === 1 ? 'it' : `these ${conflicts.length}`} again</button>
            <button type="button" className="tp-btn secondary" disabled={busy} onClick={() => onKeep(category, conflicts)}>Keep as fought</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** KO fights per category with the manager's tools. */
export function KoFights({ states, entries, nameOf, busy, canCorrect, onCorrect, onEdit, onSetFighters, onResetFighters, marksOf }) {
  const [editing, setEditing] = useState(null); // { fight, red, white, reason }
  const shown = states.filter((s) => s.ko.length);
  if (!shown.length) return null;
  return (
    <div className="tp-card" id="g-ko-fights">
      <h3>KO brackets</h3>
      <p className="tp-muted" style={{ marginTop: 0 }}>
        Fighters of a fight not started yet can be changed by hand (it stays so until "Back to the bracket"). A finished fight is
        changed with Correct: it is reopened on its shiaijo and scored again; if later fights are affected you decide above.
      </p>
      {shown.map(({ category, ko }) => {
        const catEntries = entries.filter((e) => e.category_id === category.id);
        const direct = category.pool_size === 1;
        const cell = (f, s) => {
          const id = s === 'red' ? f.red_entry_id : f.white_entry_id;
          if (id) return nameOf(id);
          const code = s === 'red' ? f.red_code : f.white_code;
          return <span className="tp-muted">{code ? slotLabel(code, direct) : '—'}</span>;
        };
        return (
          <details key={category.id} className="mc-ko" open>
            <summary><strong>{category.name}</strong> <span className="tp-muted">· {ko.filter((f) => f.status === 'finished').length}/{ko.length} fought</span></summary>
            <table className="tp-table mc-ko-table">
              <thead><tr><th>Fight</th><th>Round</th><th>Red (aka)</th><th>Result</th><th>White (shiro)</th><th /></tr></thead>
              <tbody>
                {[...ko].sort((a, b) => a.ko_no - b.ko_no).map((f) => {
                  const m = marksOf(f);
                  return (
                    <tr key={f.id} className={f.status === 'running' ? 'mc-running' : ''}>
                      <td><strong>{f.label}</strong>{f.manual_entries && <span className="mc-flag" title="Fighters set by the manager">hand</span>}{f.kept_as_fought && <span className="mc-flag" title="Kept as fought after a correction">kept</span>}</td>
                      <td className="tp-muted">{koRoundLabel(category, f.ko_no)} · S{f.shiaijo}</td>
                      <td className={f.winner_entry_id && f.winner_entry_id === f.red_entry_id ? 'mc-won' : ''}><span className="aka">{cell(f, 'red')}</span></td>
                      <td className="mc-result">{f.status === 'finished' ? `${m.red || '–'} : ${m.white || '–'}` : f.status === 'running' ? 'fighting' : ''}</td>
                      <td className={f.winner_entry_id && f.winner_entry_id === f.white_entry_id ? 'mc-won' : ''}><span className="shiro">{cell(f, 'white')}</span></td>
                      <td className="mc-actions">
                        {f.status === 'scheduled' && (
                          <button type="button" className="tp-btn secondary small" disabled={busy}
                            onClick={() => setEditing({ fight: f, category, red: f.red_entry_id ?? '', white: f.white_entry_id ?? '', reason: '' })}>Change fighters…</button>
                        )}
                        {f.status === 'scheduled' && f.manual_entries && (
                          <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => onResetFighters(category, f)}>Back to the bracket</button>
                        )}
                        {f.status === 'finished' && (
                          <button type="button" className="tp-btn secondary small" disabled={busy || !canCorrect(f)}
                            title={canCorrect(f) ? 'Reopen this fight on its shiaijo' : 'Another fight is running on this shiaijo'}
                            onClick={() => onCorrect(f, category)}>Correct</button>
                        )}
                        {f.status === 'finished' && category.kind !== 'team' && (
                          <button type="button" className="tp-btn secondary small" disabled={busy} title="Edit the points here, without the table"
                            onClick={() => onEdit(f, category)}>Edit result</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {editing?.category.id === category.id && (
              <div className="mc-edit">
                <h4>{editing.fight.label}: change the fighters</h4>
                <div className="mc-edit-row">
                  <label className="tp-field"><span className="aka">Red (aka)</span>
                    <select value={editing.red} onChange={(e) => setEditing({ ...editing, red: e.target.value })}>
                      <option value="">— empty —</option>
                      {catEntries.map((e) => <option key={e.id} value={e.id}>{nameOf(e.id)}</option>)}
                    </select>
                  </label>
                  <button type="button" className="tp-btn secondary small" title="Swap red and white"
                    onClick={() => setEditing({ ...editing, red: editing.white, white: editing.red })}>⇄</button>
                  <label className="tp-field"><span className="shiro">White (shiro)</span>
                    <select value={editing.white} onChange={(e) => setEditing({ ...editing, white: e.target.value })}>
                      <option value="">— empty —</option>
                      {catEntries.map((e) => <option key={e.id} value={e.id}>{nameOf(e.id)}</option>)}
                    </select>
                  </label>
                </div>
                <label className="tp-field"><span>Reason (for the log)</span>
                  <input value={editing.reason} placeholder="e.g. wrong pool place, injury" onChange={(e) => setEditing({ ...editing, reason: e.target.value })} />
                </label>
                {editing.red && editing.red === editing.white && <p className="tp-message error">Red and white are the same fighter.</p>}
                <div className="tp-actions">
                  <button type="button" className="tp-btn" disabled={busy || (editing.red && editing.red === editing.white)}
                    onClick={async () => { await onSetFighters(category, editing.fight, editing.red || null, editing.white || null, editing.reason.trim()); setEditing(null); }}>Save</button>
                  <button type="button" className="tp-btn secondary" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}

/** Pool order by hand: arrows, a reason, preview of what changes in the KO. */
export function PoolOrderDialog({ category, pool, order: start, nameOf, preview, busy, onSave, onReset, onClose }) {
  const [order, setOrder] = useState(start);
  const [reason, setReason] = useState(pool.manual_reason ?? '');
  const move = (i, d) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOrder(next);
  };
  const p = preview(order);
  const same = order.every((id, i) => id === start[i]);
  return (
    <div className="st-popup-back" onClick={onClose}>
      <div className="st-popup mc-order" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="st-popup-close" onClick={onClose} title="Close">✕</button>
        <h3>{category.name} · Pool {pool.number}: order by hand</h3>
        <p className="tp-muted" style={{ marginTop: 0 }}>Use only if the result of the fights cannot give the right order. The pool keeps this order until "Back to computed".</p>
        <ol className="mc-order-list">
          {order.map((id, i) => (
            <li key={id} className={i < category.advancing ? 'ps-through' : ''}>
              <span>{nameOf(id)}</span>
              <span>
                <button type="button" className="tp-btn secondary small" disabled={i === 0} onClick={() => move(i, -1)} title="Up">▲</button>
                <button type="button" className="tp-btn secondary small" disabled={i === order.length - 1} onClick={() => move(i, 1)} title="Down">▼</button>
              </span>
            </li>
          ))}
        </ol>
        <label className="tp-field"><span>Reason (for the log)</span>
          <input value={reason} placeholder="e.g. hansoku not entered, referees' decision" onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="mc-preview">
          <strong>What changes:</strong>
          {p.changes.length === 0 && p.conflicts.length === 0 && <span className="tp-muted"> nothing in the KO.</span>}
          {p.changes.length > 0 && <span> {p.changes.join('; ')} (not started yet — changed at once).</span>}
          {p.conflicts.length > 0 && (
            <span className="mc-warn"> Already fought: {p.conflicts.join(', ')} — after saving you decide above: fight again or keep as fought.</span>
          )}
        </div>
        <div className="tp-actions">
          <button type="button" className="tp-btn" disabled={busy || (same && pool.manual_order)} onClick={() => onSave(order, reason.trim())}>Save order</button>
          {pool.manual_order && <button type="button" className="tp-btn secondary" disabled={busy} onClick={onReset}>Back to computed</button>}
          <button type="button" className="tp-btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const KIND = {
  reopen: 'Fight reopened', edit: 'Result edited', replay: 'Fought again', keep: 'Kept as fought', order: 'Pool order by hand',
  order_reset: 'Pool order back to computed', swap: 'Fighters changed', swap_reset: 'Fighters back to the bracket',
};

/** The log of corrections (managers only). */
export function CorrectionLog({ tournamentId, categories, nameOf, version }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { listCorrections(tournamentId).then(setRows).catch(() => setRows([])); }, [tournamentId, version]);
  if (!rows?.length) return null;
  const cat = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const pair = (x) => (x ? `${x.red ? nameOf(x.red) : '—'} – ${x.white ? nameOf(x.white) : '—'}` : '');
  return (
    <details className="tp-card mc-log" id="g-corrections">
      <summary><h3 style={{ display: 'inline' }}>Corrections</h3> <span className="tp-muted">· {rows.length}</span></summary>
      <table className="tp-table">
        <thead><tr><th>Time</th><th>Category</th><th>What</th><th>Details</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
              <td>{cat[r.category_id] ?? ''}</td>
              <td>{KIND[r.kind] ?? r.kind}</td>
              <td>
                {r.note}
                {r.kind === 'edit' && <span className="tp-muted"> · {resultText(r.before)} → {resultText(r.after)}</span>}
                {(r.kind === 'swap' || r.kind === 'replay' || r.kind === 'keep') && r.after && <span className="tp-muted"> · {pair(r.before)} → {pair(r.after)}</span>}
                {r.kind === 'order' && <span className="tp-muted"> · {(r.after?.order ?? []).map(nameOf).join(', ')}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

const POINTS = ['M', 'K', 'D', 'T'];
const sideText = (events, side) => (events ?? []).filter((e) => e.side === side && e.type !== 'hansoku').map((e) => e.type).join('') || '–';
const resultText = (x) => (x ? (x.fusen ? `fusen ${x.fusen}` : x.decision ? `hantei ${x.decision}` : `${sideText(x.events, 'red')} : ${sideText(x.events, 'white')}`) : '');

/**
 * Result of a finished fight edited directly (owner, 2026-11-24): the points in
 * order (the first one is circled), hansoku, or hantei / fusen; the winner
 * follows from them. Team matches go through Correct (bouts at the table).
 */
export function EditResultDialog({ category, fight, nameOf, busy, onSave, onClose }) {
  const [events, setEvents] = useState(null);
  const [special, setSpecial] = useState(fight.fusen ? `fusen-${fight.fusen}` : fight.decision ? `hantei-${fight.decision}` : 'points');
  useEffect(() => {
    listEventsFor([fight.id]).then((ev) => setEvents(ev.filter((e) => !e.bout_id).map((e) => ({ side: e.side, type: e.type })))).catch(() => setEvents([]));
  }, [fight.id]);
  if (!events) return null;
  const [kind, side] = special.split('-');
  const decision = kind === 'hantei' ? side : null;
  const fusen = kind === 'fusen' ? side : null;
  const res = boutResult({ events, decision, fusen }, scoringOptions(category));
  const mustWin = fight.phase !== 'pool';
  const add = (s, type) => setEvents([...events, { side: s, type }]);
  const label = (e) => (e.type === 'hansoku' ? '▲' : e.type);
  const names = { red: nameOf(fight.red_entry_id), white: nameOf(fight.white_entry_id) };
  return (
    <div className="st-popup-back" onClick={onClose}>
      <div className="st-popup mc-order mc-result-edit" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="st-popup-close" onClick={onClose} title="Close">✕</button>
        <h3>{fight.label}: edit the result</h3>
        <p className="tp-muted" style={{ marginTop: 0 }}>Points in the order they were scored (the first is circled on the screens). Click a point to remove it.</p>
        {['red', 'white'].map((s) => (
          <div key={s} className="mc-side">
            <div className={s === 'red' ? 'aka' : 'shiro'}><strong>{names[s]}</strong></div>
            <div className="mc-add">
              {POINTS.map((p) => <button key={p} type="button" className="tp-btn secondary small" onClick={() => add(s, p)}>+ {p}</button>)}
              <button type="button" className="tp-btn secondary small" onClick={() => add(s, 'hansoku')}>+ ▲ hansoku</button>
            </div>
          </div>
        ))}
        <div className="mc-events">
          {events.length === 0 && <span className="tp-muted">No points.</span>}
          {events.map((e, i) => (
            <button key={i} type="button" className={`mc-ev ${e.side}`} title="Remove" onClick={() => setEvents(events.filter((_, j) => j !== i))}>
              {i + 1}. {e.side === 'red' ? 'Red' : 'White'} {label(e)} ✕
            </button>
          ))}
        </div>
        <div className="fr-row">
          <span className="fr-row-label">Decided by</span>
          <select value={special} onChange={(e) => setSpecial(e.target.value)}>
            <option value="points">Points</option>
            <option value="hantei-red">Hantei — red</option>
            <option value="hantei-white">Hantei — white</option>
            <option value="fusen-red">Fusen-gachi — red</option>
            <option value="fusen-white">Fusen-gachi — white</option>
          </select>
        </div>
        <p className="mc-preview">
          <strong>Result:</strong>{' '}
          {res.winner ? `${names[res.winner]} wins ${res.winner === 'red' ? `${res.redIppons}–${res.whiteIppons}` : `${res.whiteIppons}–${res.redIppons}`}${res.by ? ` (${res.by})` : ''}` : 'hikiwake (draw)'}
          {fight.winner_entry_id !== (res.winner ? fight[`${res.winner}_entry_id`] : null) && <span className="mc-warn"> — the winner changes; the pool / KO follow (later fights already fought: you decide in Manage).</span>}
        </p>
        {mustWin && !res.winner && <p className="tp-message error">A {fight.phase === 'ko' ? 'KO fight' : 'ipponshobu'} needs a winner — add the deciding point or a hantei.</p>}
        <div className="tp-actions">
          <button type="button" className="tp-btn" disabled={busy || (mustWin && !res.winner)} onClick={() => onSave({ events, decision, fusen }, res)}>Save result</button>
          <button type="button" className="tp-btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
