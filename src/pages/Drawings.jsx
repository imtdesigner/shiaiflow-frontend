import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BackToDashboard, CategoryTabs, Message, entryName, useTournament,
} from '../components/TournamentShell';
import {
  cancelCategory, clearDraw, getSavedDraw, listEntries, moveCategoryEntries, restoreCategory,
  saveDraw, updateCategory,
} from '../lib/api';
import {
  buildDraw, drawFromPools, moveEntry, newSeed, smallCategoryFormats, swapEntries,
} from '../lib/tournament/draw.js';
import KoBracket from '../components/KoBracket';
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

  const changeSetting = (field, value) => changeSettings({ [field]: value });

  const changeSettings = async (fields) => {
    try {
      replaceCategory(await updateCategory(category.id, fields));
      setPreview(null);
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  };

  const makePreview = () => {
    setMsg({ type: '', text: '' });
    setPreview(buildDraw(checkedIn.map((e) => ({
      id: e.id, club: e.team?.club ?? e.competitor?.club ?? '', tier: e.tier,
    })), {
      poolSize: category.pool_size, advancing: category.advancing,
    }, newSeed()));
  };

  const editPools = (pools) => setPreview(drawFromPools(pools, {
    poolSize: category.pool_size, advancing: category.advancing,
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
      replaceCategory(await updateCategory(category.id, {
        status: 'registration', draw_seed: null, ko_template_code: null, ko_template: null,
      }));
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
            <button type="button" className="tp-btn danger" onClick={undo} disabled={busy}>Undo draw</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Drawings;
