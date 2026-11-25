import { useEffect, useState } from 'react';
import { listBouts, listEventsFor, listPools } from '../lib/api';
import { fightMarks, poolStandings } from '../lib/tournament/poolView.js';

/**
 * Standings of one pool: place, name, wins / losses / draws, ippons scored /
 * conceded (Excel order). Places that go on to the KO are marked once the pool
 * is decided; a tie that needs an ipponshobu or a replay is said under it.
 * Corrections go through the fights (manager reopens a fight), never here.
 */
export default function PoolStandings({
  category, pool, members, fights, events, bouts, known, nameOf, title, onCorrect, canCorrect, onOrder, onEdit,
}) {
  // known (usePoolData): a finished fight counts only once its points are loaded
  const poolFights = fights.filter((f) => f.pool_id === pool.id && (f.phase === 'pool' || f.phase === 'ipponshobu'))
    .map((f) => (known && f.status === 'finished' && !known.has(f.id) ? { ...f, status: 'running' } : f));
  const computed = poolStandings(category, members, poolFights, events, bouts);
  // a pool ordered by the manager shows the manager's places (owner, 2026-11-24)
  const place = new Map((pool.pool_entries ?? []).map((pe) => [pe.entry_id, pe.final_place]));
  const s = pool.manual_order
    ? { ...computed, status: 'decided', table: [...computed.table].sort((a, b) => (place.get(a.id) ?? 99) - (place.get(b.id) ?? 99)) }
    : computed;
  const decided = s.status === 'decided';
  const advancing = category?.advancing ?? 0;
  return (
    <div className="pool-standings">
      <h4>
        {title ?? `Pool ${pool.number}`}
        <span className="tp-muted"> · {decided ? 'final' : `${s.played} / ${s.total} fights`}</span>
      </h4>
      <table className="tp-table">
        <thead>
          <tr><th>#</th><th>Name</th><th title="Wins">W</th><th title="Losses">L</th><th title="Draws">D</th><th title="Ippons scored">+</th><th title="Ippons conceded">−</th></tr>
        </thead>
        <tbody>
          {s.table.map((r, i) => (
            <tr key={r.id} className={decided && i < advancing ? 'ps-through' : ''}>
              <td>{decided ? i + 1 : <span className="tp-muted">{i + 1}</span>}</td>
              <td>{nameOf(r.id)}{r.resolvedBy && <span className="tp-muted"> ({r.resolvedBy})</span>}</td>
              <td>{r.wins}</td><td>{r.losses}</td><td>{r.draws}</td><td>{r.scored}</td><td>{r.conceded}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pool.manual_order && <p className="ps-manual">Order set by the manager{pool.manual_reason ? ` — ${pool.manual_reason}` : ''}.</p>}
      {onOrder && (decided || computed.status !== 'incomplete') && (
        <button type="button" className="tp-btn secondary small" onClick={() => onOrder(pool, s.table.map((r) => r.id))}>Change order…</button>
      )}
      {s.status === 'ipponshobu' && <p className="tp-muted">Tie for place {s.ipponshobu.place} — ipponshobu decides.</p>}
      {s.status === 'replay' && <p className="tp-muted">Two ties at once — the pool is fought again.</p>}
      {decided && advancing > 0 && <p className="tp-muted">Bold: through to the KO.</p>}
      {onCorrect && poolFights.some((f) => f.status === 'finished') && (
        <details className="ps-fights">
          <summary>Fights</summary>
          <ul>
            {poolFights.filter((f) => f.status === 'finished').map((f) => {
              const m = fightMarks(category, f, events, bouts);
              return (
                <li key={f.id}>
                  <strong>{f.label}</strong> <span className="aka">{nameOf(f.red_entry_id)}</span>
                  {' '}<b>{m.red || '–'} : {m.white || '–'}{!f.winner_entry_id ? ' X' : ''}</b>
                  {' '}<span className="shiro">{nameOf(f.white_entry_id)}</span>
                  <button type="button" className="tp-btn secondary small" disabled={!canCorrect?.(f)}
                    title={canCorrect?.(f) ? 'Reopen this fight on its shiaijo' : 'Another fight is running on this shiaijo'}
                    onClick={() => onCorrect(f)}>Correct</button>
                  {onEdit && category?.kind !== 'team' && (
                    <button type="button" className="tp-btn secondary small" title="Edit the points here, without the table" onClick={() => onEdit(f)}>Edit result</button>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Pools, score events and team bouts needed for the standings of the given
 * categories (Manage, scoretable). Refetched when a pool fight finishes or is
 * reopened — the standings count finished fights only.
 */
export function usePoolData(categoryIds, fights, version = 0) {
  const catKey = categoryIds.join();
  const [pools, setPools] = useState([]);
  const [done, setDone] = useState({ key: null, events: [], bouts: [] });
  // places change when a pool finishes (or is ordered by hand): refetch then too
  const placeKey = fights.filter((f) => f.phase === 'pool' || f.phase === 'ipponshobu').map((f) => f.status).join();
  useEffect(() => {
    listPools(catKey ? catKey.split(',') : []).then(setPools).catch(() => setPools([]));
  }, [catKey, version, placeKey]);
  const finishedKey = fights
    .filter((f) => f.status === 'finished' && (f.phase === 'pool' || f.phase === 'ipponshobu'))
    .map((f) => `${f.id}:${f.finished_at ?? ''}`).sort().join();
  useEffect(() => {
    const ids = finishedKey ? finishedKey.split(',').map((k) => k.split(':')[0]) : [];
    if (!ids.length) { setDone({ key: finishedKey, events: [], bouts: [] }); return; }
    Promise.all([listEventsFor(ids), listBouts(ids)])
      .then(([events, bouts]) => setDone({ key: finishedKey, events, bouts }))
      .catch(() => {});
  }, [finishedKey]);
  // fights whose points are loaded: a finished fight without its points would
  // read as a draw ("two ties at once") until they arrive
  const known = new Set(done.key ? done.key.split(',').map((k) => k.split(':')[0]) : []);
  return { pools, events: done.events, bouts: done.bouts, known };
}

/** Members of a pool in pool order. */
export const poolMembers = (pool) => [...(pool.pool_entries ?? [])].sort((a, b) => a.position - b.position).map((pe) => pe.entry_id);
