import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BackToDashboard, CategoryTabs, Message, entryName, useTournament,
} from '../components/TournamentShell';
import {
  clearDraw, getSavedDraw, listEntries, saveDraw, updateCategory,
} from '../lib/api';
import { buildDraw, newSeed } from '../lib/tournament/draw.js';
import { matchRounds, roundName, parsePoolCode, isWinnerRef } from '../lib/tournament/ko.js';
import './TournamentPages.css';

function codeLabel(code) {
  if (isWinnerRef(code)) return `pobjednik ${code.slice(1)}`;
  const { pool, place } = parsePoolCode(code);
  return `${place}. iz poola ${pool}`;
}

function PoolsView({ pools, nameOf }) {
  return (
    <div className="tp-pools">
      {pools.map((members, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div className="tp-pool" key={i}>
          <h4>{members.length === 1 ? `#${i + 1}` : `Pool ${i + 1}`}</h4>
          <ol>{members.map((id) => <li key={id}>{nameOf(id)}</li>)}</ol>
        </div>
      ))}
    </div>
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
  const { tournamentId, tournament, categories, setCategories, error: loadError, loading } = useTournament();
  const [selectedId, setSelectedId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [saved, setSaved] = useState(null);
  const [preview, setPreview] = useState(null);
  const [shiaijo, setShiaijo] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const category = useMemo(() => categories.find((c) => c.id === selectedId), [categories, selectedId]);
  const isDrawn = category && category.status !== 'registration';
  const checkedIn = entries.filter((e) => e.checked_in);
  const nameOf = useCallback((id) => entryName(entries.find((e) => e.id === id)), [entries]);

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

  useEffect(() => { setPreview(null); setSaved(null); setEntries([]); reload(); }, [reload]);

  const replaceCategory = (c) => setCategories(categories.map((x) => (x.id === c.id ? c : x)));

  const changeSetting = async (field, value) => {
    try {
      replaceCategory(await updateCategory(category.id, { [field]: value }));
      setPreview(null);
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  };

  const makePreview = () => {
    setMsg({ type: '', text: '' });
    setPreview(buildDraw(checkedIn.map((e) => e.id), {
      poolSize: category.pool_size, advancing: category.advancing,
    }, newSeed()));
  };

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
        renderExtra={(c) => (c.status !== 'registration' ? ' ✓' : '')}
      />
      <Message type={msg.type || 'info'}>{msg.text}</Message>

      {category && !isDrawn && (
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
            {' '}<span className="tp-muted">(seed {preview.seed})</span>
          </h3>
          {preview.problems.length > 0 && (
            <Message type="error">{preview.problems.map((p) => <div key={p}>{p}</div>)}</Message>
          )}
          <PoolsView pools={preview.pools} nameOf={nameOf} />
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
          <PoolsView pools={savedPools} nameOf={nameOf} />
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
