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
import { matchRounds, roundName, parsePoolCode, isWinnerRef } from '../lib/tournament/ko.js';
import './TournamentPages.css';

const FORMAT_LABEL = { roundRobin: 'Svatko sa svakim', directKo: 'Izravni KO' };

function codeLabel(code) {
  if (isWinnerRef(code)) return `pobjednik ${code.slice(1)}`;
  const { pool, place } = parsePoolCode(code);
  return `${place}. iz poola ${pool}`;
}

/**
 * Pools; with onSwap/onMove the organizer can edit them: click a name to pick
 * it, click another name to swap the two, or "Premjesti ovdje" to move it.
 */
function PoolsView({ pools, nameOf, clubOf, seedOf, onSwap, onMove, directKo }) {
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
            ? `Odabran: ${nameOf(picked)} — klikni drugo ime za zamjenu${directKo ? '' : ' ili „Premjesti ovdje“ na poolu'}.`
            : 'Ručno uređivanje: klikni ime pa drugo ime za zamjenu.'}
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
                  Premjesti ovdje
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
                  {seedOf?.(id) && <span className="tp-badge" title="Nositelj">N{seedOf(id)}</span>}
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

function KoView({ template, nameOf, resolved = {} }) {
  if (!template?.length) return null;
  const rounds = matchRounds(template);
  return (
    <ul className="tp-ko-list">
      {template.map((m) => (
        <li key={m.no}>
          <strong>{String(m.no).padStart(2, '0')}</strong>{' '}
          <span className="tp-muted">{roundName(rounds.get(m.no))}</span>:{' '}
          <span className="aka">{resolved[m.red] ? nameOf(resolved[m.red]) : codeLabel(m.red)}</span>
          {' – '}
          <span className="shiro">{resolved[m.white] ? nameOf(resolved[m.white]) : codeLabel(m.white)}</span>
        </li>
      ))}
    </ul>
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
  const [shiaijo, setShiaijo] = useState(1);
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
  const seedOf = useCallback((id) => entries.find((x) => x.id === id)?.seed ?? null, [entries]);
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
      id: e.id, club: e.team?.club ?? e.competitor?.club ?? '', seed: e.seed,
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
      replaceCategory(await saveDraw(category, preview, { shiaijo }));
      setPreview(null);
      await reload();
      setMsg({ type: 'success', text: 'Ždrijeb je spremljen. Borbe su kreirane.' });
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  const undo = async () => {
    if (!window.confirm('Poništiti ždrijeb? Poolovi i borbe ove kategorije bit će obrisani.')) return;
    setBusy(true);
    try {
      await clearDraw(category.id);
      replaceCategory(await updateCategory(category.id, {
        status: 'registration', draw_seed: null, ko_template_code: null, ko_template: null,
      }));
      setSaved(null);
      setMsg({ type: 'info', text: 'Ždrijeb poništen. Prijave su ponovno otvorene.' });
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
      `Prebaciti sve prijave iz ${category.name} u ${target.name}? Kategorija ${category.name} bit će poništena.`,
      () => moveCategoryEntries(category.id, target.id),
      (moved) => `Prebačeno ${moved} prijava u ${target.name}. Kategorija ${category.name} je poništena.`,
    );
  };

  const cancel = () => runCategoryAction(
    `Poništiti kategoriju ${category.name}? Neće se održati; prijave ostaju spremljene.`,
    () => cancelCategory(category.id),
    () => `Kategorija ${category.name} je poništena.`,
  );

  const restore = () => runCategoryAction(
    `Vratiti kategoriju ${category.name} u prijave?`,
    () => restoreCategory(category.id),
    () => `Kategorija ${category.name} je ponovno otvorena za prijave.`,
  );

  // Saved draw → same shapes as a preview.
  const savedPools = saved?.pools.map((p) => [...p.pool_entries].sort((a, b) => a.position - b.position).map((pe) => pe.entry_id));
  const savedPoolMatches = saved?.matches.filter((m) => m.phase === 'pool') ?? [];
  const savedResolved = Object.fromEntries((saved?.matches ?? []).filter((m) => m.phase === 'ko').flatMap((m) => [
    [m.red_code, m.red_entry_id], [m.white_code, m.white_entry_id],
  ]).filter(([, id]) => id));

  if (loading) return <div className="tp-page">Učitavam…</div>;
  if (loadError) return <div className="tp-page"><Message type="error">{loadError}</Message></div>;

  return (
    <div className="tp-page">
      <BackToDashboard />
      <h2>Ždrijeb</h2>
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
          <h3>Kategorija je poništena</h3>
          <p className="tp-muted">
            Ova kategorija se ne održava{entries.length ? ` (preostalo prijava: ${entries.length})` : ''}.
          </p>
          <div className="tp-actions">
            <button type="button" className="tp-btn secondary" onClick={restore} disabled={busy}>Vrati u prijave</button>
          </div>
        </div>
      )}

      {category && isOpen && (
        <div className="tp-card">
          <h3>Postavke</h3>
          <div className="tp-grid">
            <div className="tp-field">
              Prisutni natjecatelji
              <strong style={{ fontSize: '1.4rem' }}>{checkedIn.length}</strong>
              <span className="tp-muted">od {entries.length} prijavljenih</span>
            </div>
            <label className="tp-field">
              Po poolu
              <select value={category.pool_size} onChange={(e) => changeSetting('pool_size', Number(e.target.value))}>
                <option value={1}>izravni KO</option>
                {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="tp-field">
              Prolazi iz poola
              <select value={category.advancing} disabled={category.pool_size === 1} onChange={(e) => changeSetting('advancing', Number(e.target.value))}>
                <option value={0}>samo pool</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </label>
            <label className="tp-field">
              Teren
              <select value={shiaijo} onChange={(e) => setShiaijo(Number(e.target.value))}>
                {Array.from({ length: tournament?.shiaijo_count ?? 1 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>Shiaijo {i + 1}</option>
                ))}
              </select>
            </label>
          </div>
          {smallFormats && (
            <Message type="info">
              {checkedIn.length === 3
                ? 'S 3 sudionika KO nije moguć. Opcije: svatko sa svakim, prebaciti sve u jaču kategoriju ili poništiti kategoriju.'
                : 'S 4 sudionika: svatko sa svakim ili izravni KO.'}
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
                    <option value="">{moveTargets.length ? 'Jača kategorija…' : 'Nema druge kategorije u prijavama'}</option>
                    {moveTargets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="button" className="tp-btn secondary small" onClick={moveAll} disabled={busy || !moveTarget}>
                    Prebaci sve
                  </button>
                  <button type="button" className="tp-btn danger small" onClick={cancel} disabled={busy}>
                    Poništi kategoriju
                  </button>
                </div>
              )}
            </Message>
          )}
          <div className="tp-actions">
            <button type="button" className="tp-btn" onClick={makePreview} disabled={checkedIn.length < 2 || busy}>
              {preview ? 'Novi ždrijeb' : 'Napravi ždrijeb'}
            </button>
            {checkedIn.length < 2 && (
              <span className="tp-muted">
                Treba barem 2 prisutna. <Link to={`/tournament/${tournamentId}/registration`}>Prijave</Link>
              </span>
            )}
          </div>
        </div>
      )}

      {preview && (
        <div className="tp-card">
          <h3>
            Prijedlog ždrijeba
            {preview.koCode && <> · sustav <span className="tp-badge">{preview.koCode}</span></>}
            {' '}<span className="tp-muted">{preview.seed === null ? '(ručno uređeno)' : `(seed ${preview.seed})`}</span>
          </h3>
          {preview.problems.length > 0 && (
            <Message type="error">{preview.problems.map((p) => <div key={p}>{p}</div>)}</Message>
          )}
          {preview.warnings.length > 0 && (
            <Message type="info">
              <strong>Za ručnu provjeru:</strong>
              {preview.warnings.map((w) => <div key={w}>{w}</div>)}
            </Message>
          )}
          <PoolsView
            pools={preview.pools}
            nameOf={nameOf}
            clubOf={clubOf}
            seedOf={seedOf}
            directKo={preview.directKo}
            onSwap={(a, b) => editPools(swapEntries(preview.pools, a, b))}
            onMove={(id, to) => editPools(moveEntry(preview.pools, id, to))}
          />
          {preview.poolMatches.length > 0 && (
            <p className="tp-muted" style={{ marginTop: '1rem' }}>{preview.poolMatches.length} borbi u poolovima.</p>
          )}
          {preview.koTemplate && (
            <>
              <h3 style={{ marginTop: '1rem' }}>KO dio</h3>
              <KoView template={preview.koTemplate} nameOf={nameOf} />
            </>
          )}
          <div className="tp-actions">
            <button type="button" className="tp-btn" onClick={save} disabled={busy || preview.problems.length > 0}>
              {busy ? 'Spremam…' : 'Spremi ždrijeb'}
            </button>
            <button type="button" className="tp-btn secondary" onClick={makePreview} disabled={busy}>Promiješaj ponovno</button>
          </div>
        </div>
      )}

      {category && isDrawn && saved && (
        <div className="tp-card">
          <h3>
            Spremljeni ždrijeb
            {category.ko_template_code && <> · sustav <span className="tp-badge">{category.ko_template_code}</span></>}
          </h3>
          <PoolsView pools={savedPools} nameOf={nameOf} clubOf={clubOf} seedOf={seedOf} directKo={category.pool_size === 1} />
          {savedPoolMatches.length > 0 && (
            <>
              <h3 style={{ marginTop: '1rem' }}>Borbe u poolovima</h3>
              <table className="tp-table">
                <thead><tr><th>#</th><th>Crveni (aka)</th><th>Bijeli (shiro)</th><th>Teren</th></tr></thead>
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
              <h3 style={{ marginTop: '1rem' }}>KO dio</h3>
              <KoView template={category.ko_template} nameOf={nameOf} resolved={savedResolved} />
            </>
          )}
          <div className="tp-actions">
            <button type="button" className="tp-btn danger" onClick={undo} disabled={busy}>Poništi ždrijeb</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Drawings;
