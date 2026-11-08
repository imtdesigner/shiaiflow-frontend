import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BackToDashboard, CategoryTabs, Message, entryName, useTournament,
} from '../components/TournamentShell';
import {
  addToPool, cancelCategory, clearDraw, getSavedDraw, listEntries, moveCategoryEntries, replaceInDraw, restoreCategory,
  saveDraw, setDrawsConfirmed, updateCategory, withdrawFromPool,
} from '../lib/api';
import { afterFight, myRole } from '../lib/runApi';
import {
  buildDraw, drawFromPools, moveEntry, newSeed, smallCategoryFormats, swapEntries,
} from '../lib/tournament/draw.js';
import KoBracket from '../components/KoBracket';
import { rulesText, teamReserves } from '../lib/tournament/eligibility.js';
import { categoryRow } from '../lib/tournament/categoryTemplates.js';
import CategoryRules from '../components/CategoryRules';
import { TIER_LABELS } from '../lib/tournament/placement.js';
import './TournamentPages.css';

const FORMAT_LABEL = { roundRobin: 'Round robin', directKo: 'Direct KO' };

/**
 * Pools; with onSwap/onMove the organizer can edit them: click a name to pick
 * it, click another name to swap the two, or "Move here" to move it.
 */
function PoolsView({ pools, nameOf, clubOf, tierOf, onSwap, onMove, directKo }) {
  const [picked, setPicked] = useState(null);
  const editable = !!onSwap;
  const pick = (id) => {
    if (!editable) return;
    if (!picked) setPicked(id);
    else if (picked === id) setPicked(null);
    else { onSwap(picked, id); setPicked(null); }
  };
  return (
    <>
      {editable && (
        <p className="tp-muted" style={{ marginTop: 0 }}>
          {picked
            ? `Selected: ${nameOf(picked)} — click another name to swap${directKo ? '' : ' or “Move here” on a pool'}.`
            : 'Manual editing: click a name, then another name to swap them.'}
        </p>
      )}
      <div className="tp-pools">
        {pools.map((members, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div className="tp-pool" key={i}>
            <h4>
              {directKo ? `#${i + 1}` : `Pool ${i + 1}`}
              {editable && !directKo && picked && !members.includes(picked) && (
                <button type="button" className="tp-btn secondary small" style={{ marginLeft: '0.5rem' }}
                  onClick={() => { onMove(picked, i); setPicked(null); }}>
                  Move here
                </button>
              )}
            </h4>
            <ol>
              {members.map((id) => (
                <li key={id}>
                  {editable ? (
                    <button type="button" className={`tp-pick ${picked === id ? 'picked' : ''}`} onClick={() => pick(id)}>
                      {nameOf(id)}
                    </button>
                  ) : nameOf(id)}
                  {tierOf?.(id) && <span className={`tp-badge ${tierOf(id) <= 3 ? 'ok' : ''}`} title={TIER_LABELS[tierOf(id)]}>{tierOf(id)}</span>}
                  {clubOf?.(id) && <span className="tp-muted"> · {clubOf(id)}</span>}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * After the draw, change as little as possible: a competitor who did not come
 * is replaced by a new one in the same place, a short pool gets a late entry
 * (its fights are rebuilt), or someone is withdrawn (before the pool started:
 * out of the pool; after: the opponents win the remaining fights by fusen).
 */
function DrawAdjust({ category, saved, savedPools, entries, nameOf, busy, run }) {
  const [replace, setReplace] = useState({});
  const placed = new Set((savedPools ?? []).flat());
  const unplaced = entries.filter((e) => e.checked_in && !placed.has(e.id));
  const direct = category.pool_size === 1;
  if (!saved) return null;
  return (
    <details style={{ marginTop: '1rem' }} open={unplaced.length > 0}>
      <summary className="tp-muted">
        Adjust the draw{unplaced.length ? ` — ${unplaced.length} checked-in not in the draw: ${unplaced.map((e) => nameOf(e.id)).join(', ')}` : ''}
      </summary>
      <table className="tp-table" style={{ marginTop: '0.5rem' }}>
        <thead><tr><th>{direct ? '#' : 'Pool'}</th><th>Competitor</th><th>Replace with</th><th /></tr></thead>
        <tbody>
          {saved.pools.map((p, pi) => {
            const members = savedPools[pi] ?? [];
            const short = !direct && members.length < category.pool_size;
            return [
              ...members.map((id) => (
                <tr key={id}>
                  <td>{direct ? `#${pi + 1}` : p.number}</td>
                  <td>{nameOf(id)}</td>
                  <td>
                    <select value={replace[id] ?? ''} disabled={busy || unplaced.length === 0} onChange={(e) => setReplace({ ...replace, [id]: e.target.value })}>
                      <option value="">{unplaced.length ? '—' : 'nobody waiting'}</option>
                      {unplaced.map((e) => <option key={e.id} value={e.id}>{nameOf(e.id)}</option>)}
                    </select>
                    {replace[id] && (
                      <button type="button" className="tp-btn small" style={{ marginLeft: '0.4rem' }} disabled={busy}
                        onClick={() => run(() => replaceInDraw(category.id, id, replace[id]), `${nameOf(replace[id])} takes the place of ${nameOf(id)}.`)}>
                        Replace
                      </button>
                    )}
                  </td>
                  <td>
                    {!direct && (
                      <button type="button" className="tp-btn danger small" disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Withdraw ${nameOf(id)} from pool ${p.number}?`)) return;
                          run(async () => {
                            const r = await withdrawFromPool(p.id, id);
                            if (r.fusen) await afterFight({ phase: 'pool', pool_id: p.id }, category);
                          }, `${nameOf(id)} withdrawn from pool ${p.number}.`);
                        }}>
                        Withdraw
                      </button>
                    )}
                  </td>
                </tr>
              )),
              short && unplaced.length > 0 && (
                <tr key={`add-${p.id}`}>
                  <td>{p.number}</td>
                  <td className="tp-muted">pool is short of {category.pool_size - members.length}</td>
                  <td colSpan={2}>
                    {unplaced.map((e) => (
                      <button key={e.id} type="button" className="tp-btn secondary small" style={{ marginRight: '0.3rem' }} disabled={busy}
                        onClick={() => run(() => addToPool(p.id, e.id), `${nameOf(e.id)} added to pool ${p.number}; its fights were rebuilt.`)}>
                        + {nameOf(e.id)}
                      </button>
                    ))}
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </details>
  );
}

function Drawings() {
  const {
    tournamentId, tournament, categories, setCategories, reload: reloadTournament, error: loadError, loading,
  } = useTournament();
  const [selectedId, setSelectedId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [saved, setSaved] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [moveTarget, setMoveTarget] = useState('');
  const [role, setRole] = useState(null);
  useEffect(() => { myRole(tournamentId).then(setRole).catch(() => {}); }, [tournamentId]);
  const isOwner = role === 'owner';
  const confirmed = !!tournament?.draws_confirmed;
  const locked = confirmed && !isOwner; // setup is fixed for editors after the draws are confirmed
  const allDrawn = categories.length > 0 && categories.every((c) => c.status !== 'registration');

  const category = useMemo(() => categories.find((c) => c.id === selectedId), [categories, selectedId]);
  const isOpen = category?.status === 'registration';
  const isCancelled = category?.status === 'cancelled';
  const isDrawn = category && !isOpen && !isCancelled;
  const moveTargets = categories.filter((c) => c.id !== category?.id && c.kind === category?.kind && c.status === 'registration');
  const checkedIn = entries.filter((e) => e.checked_in);
  const smallFormats = smallCategoryFormats(checkedIn.length);
  const nameOf = useCallback((id) => entryName(entries.find((e) => e.id === id)), [entries]);
  const tierOf = useCallback((id) => entries.find((x) => x.id === id)?.tier ?? null, [entries]);
  const clubOf = useCallback((id) => {
    const e = entries.find((x) => x.id === id);
    return e?.team?.club ?? e?.competitor?.club ?? '';
  }, [entries]);

  useEffect(() => {
    if (!selectedId && categories.length) setSelectedId(categories[0].id);
  }, [categories, selectedId]);

  const reload = useCallback(async () => {
    if (!selectedId) return;
    try {
      const [ens, draw] = await Promise.all([listEntries(selectedId), getSavedDraw(selectedId)]);
      setEntries(ens);
      setSaved(draw.pools.length ? draw : null);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  }, [selectedId]);

  useEffect(() => { setPreview(null); setSaved(null); setEntries([]); setMoveTarget(''); reload(); }, [reload]);

  const replaceCategory = (c) => setCategories(categories.map((x) => (x.id === c.id ? c : x)));

  const [rulesDraft, setRulesDraft] = useState(null);
  useEffect(() => { setRulesDraft(null); }, [category?.id]);
  const changeSetting = (field, value) => changeSettings({ [field]: value });

  const changeSettings = async (fields) => {
    try {
      replaceCategory(await updateCategory(category.id, fields));
      setPreview(null);
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  };

  // KO template adjusted in the bracket editor (used when it fits the draw)
  const custom = category?.ko_template_edited && category.ko_template
    ? { code: category.ko_template_code, template: category.ko_template } : null;

  const makePreview = () => {
    setMsg({ type: '', text: '' });
    setPreview(buildDraw(checkedIn.map((e) => ({
      id: e.id, club: e.team?.club ?? e.competitor?.club ?? '', tier: e.tier,
    })), {
      poolSize: category.pool_size, advancing: category.advancing, custom,
    }, newSeed()));
  };

  const editPools = (pools) => setPreview(drawFromPools(pools, {
    poolSize: category.pool_size, advancing: category.advancing, custom,
  }, null, preview.meta));

  const save = async () => {
    setBusy(true);
    try {
      replaceCategory(await saveDraw(category, preview, tournament));
      setPreview(null);
      await reload();
      setMsg({ type: 'success', text: 'Draw saved. Matches have been created.' });
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  const undo = async () => {
    if (!window.confirm('Undo the draw? Pools and matches of this category will be deleted.')) return;
    setBusy(true);
    try {
      await clearDraw(category.id);
      replaceCategory(await updateCategory(category.id, category.ko_template_edited
        ? { status: 'registration', draw_seed: null } // keep the bracket edited by hand
        : { status: 'registration', draw_seed: null, ko_template_code: null, ko_template: null }));
      setSaved(null);
      setMsg({ type: 'info', text: 'Draw undone. Registration is open again.' });
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  const runCategoryAction = async (question, action, ok) => {
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      const text = ok(await action());
      setPreview(null);
      await Promise.all([reloadTournament(), reload()]);
      setMsg({ type: 'success', text });
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  const moveAll = () => {
    const target = categories.find((c) => c.id === moveTarget);
    if (!target) return;
    runCategoryAction(
      `Move all entries from ${category.name} to ${target.name}? ${category.name} will be cancelled.`,
      () => moveCategoryEntries(category.id, target.id),
      (moved) => `Moved ${moved} entries to ${target.name}. ${category.name} is cancelled.`,
    );
  };

  const cancel = () => runCategoryAction(
    `Cancel ${category.name}? It will not be held; entries are kept.`,
    () => cancelCategory(category.id),
    () => `${category.name} is cancelled.`,
  );

  const restore = () => runCategoryAction(
    `Reopen ${category.name} for registration?`,
    () => restoreCategory(category.id),
    () => `${category.name} is open for registration again.`,
  );

  // Saved draw → same shapes as a preview.
  const savedPools = saved?.pools.map((p) => [...p.pool_entries].sort((a, b) => a.position - b.position).map((pe) => pe.entry_id));
  const savedPoolMatches = saved?.matches.filter((m) => m.phase === 'pool') ?? [];
  const savedResolved = Object.fromEntries((saved?.matches ?? []).filter((m) => m.phase === 'ko').flatMap((m) => [
    [m.red_code, m.red_entry_id], [m.white_code, m.white_entry_id],
  ]).filter(([, id]) => id));

  if (loading) return <div className="tp-page">Loading…</div>;
  if (loadError) return <div className="tp-page"><Message type="error">{loadError}</Message></div>;

  return (
    <div className="tp-page">
      <BackToDashboard />
      <h2>Draw</h2>
      <p className="tp-subtitle">{tournament?.name}</p>

      <CategoryTabs
        categories={categories}
        selectedId={selectedId}
        onSelect={(id) => { setSelectedId(id); setMsg({ type: '', text: '' }); }}
        renderExtra={(c) => ({ registration: '', cancelled: ' ✕' }[c.status] ?? ' ✓')}
      />
      <Message type={msg.type || 'info'}>{msg.text}</Message>

      {allDrawn && (
        <div className="tp-card">
          {confirmed ? (
            <p style={{ margin: 0 }}>
              <span className="tp-badge ok">draws confirmed</span>{' '}
              <span className="tp-muted">
                The setup is fixed{isOwner ? '' : ' for editors'}; late or missing competitors are handled below each draw
                (replace, add to a short pool, withdraw).
              </span>
              {isOwner && (
                <button type="button" className="tp-btn secondary small" style={{ marginLeft: '0.5rem' }} disabled={busy}
                  onClick={async () => { await setDrawsConfirmed(tournamentId, false); await reloadTournament(); }}>
                  Reopen draws
                </button>
              )}
            </p>
          ) : (
            <div className="tp-actions" style={{ marginTop: 0 }}>
              <span>Every category is drawn.</span>
              <button type="button" className="tp-btn" disabled={busy}
                onClick={async () => {
                  if (!window.confirm('Confirm all draws? Editors can no longer change the setup; entries can still be adjusted.')) return;
                  await setDrawsConfirmed(tournamentId, true); await reloadTournament();
                }}>
                Confirm draws
              </button>
            </div>
          )}
        </div>
      )}

      {category && isCancelled && (
        <div className="tp-card">
          <h3>Category cancelled</h3>
          <p className="tp-muted">
            This category will not be held{entries.length ? ` (entries left: ${entries.length})` : ''}.
          </p>
          <div className="tp-actions">
            <button type="button" className="tp-btn secondary" onClick={restore} disabled={busy}>Reopen registration</button>
          </div>
        </div>
      )}

      {category && isOpen && (
        <div className="tp-card">
          <h3>Settings</h3>
          <div className="tp-grid">
            <div className="tp-field">
              Checked-in competitors
              <strong style={{ fontSize: '1.4rem' }}>{checkedIn.length}</strong>
              <span className="tp-muted">of {entries.length} registered</span>
            </div>
            <label className="tp-field">
              Per pool
              <select value={category.pool_size} onChange={(e) => changeSetting('pool_size', Number(e.target.value))}>
                <option value={1}>direct KO</option>
                {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="tp-field">
              Advancing per pool
              <select value={category.advancing} disabled={category.pool_size === 1} onChange={(e) => changeSetting('advancing', Number(e.target.value))}>
                <option value={0}>pools only</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </label>
            <div className="tp-field">
              Shiaijo
              <strong>
                {category.shiaijos.join(' + ')}
                {category.ko_shiaijos && <span className="tp-muted"> · KO {category.ko_shiaijos.join(' + ')}</span>}
              </strong>
              <Link className="tp-muted" to={`/tournament/${tournamentId}/shiaijo`}>Change in Shiaijo plan</Link>
            </div>
          </div>
          <details style={{ marginTop: '0.75rem' }}>
            <summary className="tp-muted">Who can enter — {rulesText(category)}{category.kind === 'team' ? ` · team ${category.team_size}+${teamReserves(category.team_size)}${category.team_same_dojo ? ' · one dojo' : ''}${category.position_rules ? ' · limits per position' : ''}` : ''}</summary>
            <div style={{ marginTop: '0.75rem' }}>
              <CategoryRules key={`${category.id}-${rulesDraft ? 'd' : 's'}-${category.team_size}`} category={rulesDraft ?? category} ageBasis={tournament?.age_basis}
                onChange={(next) => !locked && setRulesDraft(next)} />
              {rulesDraft && (
                <div className="tp-actions">
                  <button type="button" className="tp-btn small" onClick={async () => {
                    const row = categoryRow(rulesDraft);
                    await changeSettings({
                      gender: row.gender, min_age: row.min_age, max_age: row.max_age, min_grade: row.min_grade, max_grade: row.max_grade,
                      ...(category.kind === 'team' ? { team_size: row.team_size, team_same_dojo: row.team_same_dojo, position_rules: row.position_rules } : {}),
                    });
                    setRulesDraft(null);
                  }}>Save who can enter</button>
                  <button type="button" className="tp-btn secondary small" onClick={() => setRulesDraft(null)}>Cancel</button>
                </div>
              )}
            </div>
          </details>
          <details style={{ marginTop: '0.75rem' }}>
            <summary className="tp-muted">
              Fight rules — pools: {category.pool_tie === 'encho' ? 'encho' : 'hikiwake'} on a tie · KO: encho
              {category.ko_encho_seconds ? ` ${category.ko_encho_seconds / 60} min` : ' until a point'}{category.ko_hantei ? ' then hantei' : ''}
            </summary>
            <div className="tp-grid" style={{ marginTop: '0.75rem' }}>
              <label className="tp-field">
                Pools: tie at time
                <select value={category.pool_tie} onChange={(e) => changeSetting('pool_tie', e.target.value)}>
                  <option value="hikiwake">hikiwake (draw)</option>
                  <option value="encho">encho</option>
                </select>
              </label>
              {category.pool_tie === 'encho' && (
                <>
                  <label className="tp-field">
                    Pools: encho (min, empty = until a point)
                    <input type="number" min="0.5" step="0.5" defaultValue={category.pool_encho_seconds ? category.pool_encho_seconds / 60 : ''}
                      onBlur={(e) => changeSetting('pool_encho_seconds', e.target.value ? Math.round(Number(e.target.value) * 60) : null)} />
                  </label>
                  <label className="tp-field tp-check">
                    <input type="checkbox" checked={category.pool_hantei} onChange={(e) => changeSetting('pool_hantei', e.target.checked)} />
                    Pools: hantei after encho
                  </label>
                </>
              )}
              <label className="tp-field">
                KO: encho (min, empty = until a point)
                <input type="number" min="0.5" step="0.5" defaultValue={category.ko_encho_seconds ? category.ko_encho_seconds / 60 : ''}
                  onBlur={(e) => changeSetting('ko_encho_seconds', e.target.value ? Math.round(Number(e.target.value) * 60) : null)} />
              </label>
              <label className="tp-field tp-check">
                <input type="checkbox" checked={category.ko_hantei} onChange={(e) => changeSetting('ko_hantei', e.target.checked)} />
                KO: hantei after encho
              </label>
            </div>
          </details>
          {smallFormats && (
            <Message type="info">
              {checkedIn.length === 3
                ? 'No KO is possible with 3 entries. Options: round robin, move everyone to a stronger category, or cancel the category.'
                : 'With 4 entries: round robin or direct KO.'}
              <div className="tp-actions" style={{ marginTop: '0.5rem' }}>
                {smallFormats.map((f) => {
                  const active = category.pool_size === f.poolSize && category.advancing === f.advancing;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      className={`tp-btn small ${active ? '' : 'secondary'}`}
                      disabled={busy || active}
                      onClick={() => changeSettings({ pool_size: f.poolSize, advancing: f.advancing })}
                    >
                      {FORMAT_LABEL[f.key]}{active ? ' ✓' : ''}
                    </button>
                  );
                })}
              </div>
              {checkedIn.length === 3 && (
                <div className="tp-actions" style={{ marginTop: '0.5rem' }}>
                  <select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)} disabled={busy || !moveTargets.length}>
                    <option value="">{moveTargets.length ? 'Stronger category…' : 'No other category in registration'}</option>
                    {moveTargets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="button" className="tp-btn secondary small" onClick={moveAll} disabled={busy || !moveTarget}>
                    Move all
                  </button>
                  <button type="button" className="tp-btn danger small" onClick={cancel} disabled={busy}>
                    Cancel category
                  </button>
                </div>
              )}
            </Message>
          )}
          <div className="tp-actions">
            <button type="button" className="tp-btn" onClick={makePreview} disabled={checkedIn.length < 2 || busy}>
              {preview ? 'New draw' : 'Make draw'}
            </button>
            {checkedIn.length < 2 && (
              <span className="tp-muted">
                At least 2 must be checked in. <Link to={`/tournament/${tournamentId}/registration`}>Registration</Link>
              </span>
            )}
          </div>
        </div>
      )}

      {preview && (
        <div className="tp-card">
          <h3>
            Draw preview
            {preview.koCode && <> · system <span className="tp-badge">{preview.koCode}</span></>}
            {custom?.code === preview.koCode && preview.koCode && <span className="tp-muted"> (edited bracket)</span>}
            {' '}<span className="tp-muted">{preview.seed === null ? '(edited by hand)' : `(seed ${preview.seed})`}</span>
          </h3>
          {preview.problems.length > 0 && (
            <Message type="error">{preview.problems.map((p) => <div key={p}>{p}</div>)}</Message>
          )}
          {preview.warnings.length > 0 && (
            <Message type="info">
              <strong>Check by hand:</strong>
              {preview.warnings.map((w) => <div key={w}>{w}</div>)}
            </Message>
          )}
          <PoolsView
            pools={preview.pools}
            nameOf={nameOf}
            clubOf={clubOf}
            tierOf={tierOf}
            directKo={preview.directKo}
            onSwap={(a, b) => editPools(swapEntries(preview.pools, a, b))}
            onMove={(id, to) => editPools(moveEntry(preview.pools, id, to))}
          />
          {preview.poolMatches.length > 0 && (
            <p className="tp-muted" style={{ marginTop: '1rem' }}>{preview.poolMatches.length} pool matches.</p>
          )}
          {preview.koTemplate && (
            <>
              <h3 style={{ marginTop: '1rem' }}>KO bracket</h3>
              <KoBracket template={preview.koTemplate} nameOf={nameOf} directKo={preview.directKo} />
            </>
          )}
          <div className="tp-actions">
            <button type="button" className="tp-btn" onClick={save} disabled={busy || preview.problems.length > 0}>
              {busy ? 'Saving…' : 'Save draw'}
            </button>
            <button type="button" className="tp-btn secondary" onClick={makePreview} disabled={busy}>Shuffle again</button>
          </div>
        </div>
      )}

      {category && isDrawn && saved && (
        <div className="tp-card">
          <h3>
            Saved draw
            {category.ko_template_code && <> · system <span className="tp-badge">{category.ko_template_code}</span></>}
          </h3>
          <PoolsView pools={savedPools} nameOf={nameOf} clubOf={clubOf} tierOf={tierOf} directKo={category.pool_size === 1} />
          <DrawAdjust
            category={category}
            saved={saved}
            savedPools={savedPools}
            entries={entries}
            nameOf={nameOf}
            busy={busy}
            run={async (fn, ok) => {
              setBusy(true); setMsg({ type: '', text: '' });
              try { await fn(); await reload(); setMsg({ type: 'success', text: ok }); }
              catch (e) { setMsg({ type: 'error', text: e.message }); }
              finally { setBusy(false); }
            }}
          />
          {savedPoolMatches.length > 0 && (
            <>
              <h3 style={{ marginTop: '1rem' }}>Pool matches</h3>
              <table className="tp-table">
                <thead><tr><th>#</th><th>Red (aka)</th><th>White (shiro)</th><th>Court</th></tr></thead>
                <tbody>
                  {savedPoolMatches.map((m) => (
                    <tr key={m.id}>
                      <td>{m.label}</td>
                      <td className="aka">{nameOf(m.red_entry_id)}</td>
                      <td className="shiro">{nameOf(m.white_entry_id)}</td>
                      <td>{m.shiaijo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {category.ko_template && (
            <>
              <h3 style={{ marginTop: '1rem' }}>KO bracket</h3>
              <KoBracket template={category.ko_template} nameOf={nameOf} resolved={savedResolved} directKo={category.pool_size === 1} />
            </>
          )}
          <div className="tp-actions">
            <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/fights`}>Fight plan</Link>
            {!locked && <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/brackets`}>Edit bracket</Link>}
            {!locked && <button type="button" className="tp-btn danger" onClick={undo} disabled={busy}>Undo draw</button>}
          </div>
        </div>
      )}
    </div>
  );
}

export default Drawings;
