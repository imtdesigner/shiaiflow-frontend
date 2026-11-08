import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BackToDashboard, CategoryTabs, Message, entryName, useTournament,
} from '../components/TournamentShell';
import KoBracket from '../components/KoBracket';
import { getSavedDraw, listEntries, saveKoTemplate } from '../lib/api';
import { myRole } from '../lib/runApi';
import {
  checkTemplate, normalizeTemplate, parseSlotInput, sameTemplate, setSlot, swapSlots,
} from '../lib/tournament/bracketEdit.js';
import { directKoQualifiers } from '../lib/tournament/draw.js';
import { getTemplate, parseTemplate } from '../lib/tournament/ko.js';
import { KO_VARIANTS } from '../lib/tournament/koTemplates.data.js';
import { splitPools, systemCode } from '../lib/tournament/pools.js';
import './TournamentPages.css';

/**
 * Bracket editor: shows the category's KO template (default from the library,
 * or the one adjusted earlier) and lets the organizer drag slots onto each
 * other or type a slot code. Before the draw the template is used by the
 * draw; after it the KO fights are rebuilt (until a KO fight has started).
 */
function Brackets() {
  const {
    tournamentId, tournament, categories, reload: reloadTournament, error: loadError, loading,
  } = useTournament();
  const [selectedId, setSelectedId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [role, setRole] = useState(null);
  useEffect(() => { myRole(tournamentId).then(setRole).catch(() => {}); }, [tournamentId]);
  const locked = !!tournament?.draws_confirmed && role !== 'owner';

  const category = useMemo(() => categories.find((c) => c.id === selectedId), [categories, selectedId]);
  const drawn = category && !['registration', 'cancelled'].includes(category.status);
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
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }, [selectedId]);

  useEffect(() => { setDraft(null); setSaved(null); reload(); }, [reload]);

  // Which KO system applies: from the saved draw, or from who is checked in now.
  const system = useMemo(() => {
    if (!category) return null;
    const directKo = category.pool_size === 1;
    const adv = directKo ? 1 : category.advancing;
    const poolCount = saved
      ? saved.pools.length
      : splitPools(entries.filter((e) => e.checked_in), category.pool_size, category.pool_split).length;
    if (adv < 1 || poolCount * adv < 2) return { directKo, adv, poolCount, code: null };
    return { directKo, adv, poolCount, code: systemCode(poolCount, adv) };
  }, [category, saved, entries]);

  const defaultTemplate = useMemo(() => (system?.code ? getTemplate(system.code) : null), [system]);
  const current = useMemo(() => {
    if (!category || !system?.code) return null;
    if (category.ko_template && category.ko_template_code === system.code && (drawn || category.ko_template_edited)) {
      return category.ko_template;
    }
    return defaultTemplate;
  }, [category, system, drawn, defaultTemplate]);

  useEffect(() => { setDraft(current); }, [current]);

  const variants = Object.keys(KO_VARIANTS).filter((k) => system?.code && k.startsWith(`${system.code}@`));
  const check = draft && system ? checkTemplate(draft, system.poolCount, system.adv) : { errors: [], warnings: [] };
  const dirty = draft && current && !sameTemplate(draft, current);
  const isDefault = draft && defaultTemplate && sameTemplate(draft, defaultTemplate);

  const apply = (next) => {
    const n = normalizeTemplate(next);
    if (n.error) { setMsg({ type: 'error', text: n.error }); return; }
    setMsg({ type: '', text: '' });
    setDraft(n.template);
  };

  const onSet = (slot, text) => {
    const code = parseSlotInput(text);
    if (!code) { setMsg({ type: 'error', text: `“${text}” is not a slot code. Use P2.1, W03 or #5.` }); return; }
    apply(setSlot(draft, slot, code));
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveKoTemplate(category, system.code, isDefault ? null : draft, tournament);
      await reloadTournament();
      await reload();
      setMsg({ type: 'success', text: drawn ? 'Bracket saved. KO fights have been rebuilt.' : 'Bracket saved. The draw will use it.' });
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  const resolved = useMemo(() => {
    if (!saved || !system?.directKo) return {};
    return directKoQualifiers(saved.pools.map((p) => [...p.pool_entries].sort((a, b) => a.position - b.position).map((pe) => pe.entry_id)));
  }, [saved, system]);

  if (loading) return <div className="tp-page">Loading…</div>;
  if (loadError) return <div className="tp-page"><Message type="error">{loadError}</Message></div>;

  return (
    <div className="tp-page">
      <BackToDashboard />
      <h2>Bracket editor</h2>
      <p className="tp-subtitle">{tournament?.name}</p>

      <CategoryTabs
        categories={categories}
        selectedId={selectedId}
        onSelect={(id) => { setSelectedId(id); setMsg({ type: '', text: '' }); }}
        renderExtra={(c) => (c.ko_template_edited ? ' ✎' : '')}
      />
      <Message type={msg.type || 'info'}>{msg.text}</Message>

      {category && !system?.code && (
        <Message type="info">
          No KO for this category yet — it needs at least 2 checked-in entries and advancing from the pools.
          {' '}<Link to={`/tournament/${tournamentId}/registration`}>Registration</Link>
        </Message>
      )}

      {category && system?.code && !defaultTemplate && !current && (
        <Message type="error">KO system {system.code} is not in the library yet.</Message>
      )}

      {draft && (
        <div className="tp-card">
          <h3>
            System <span className="tp-badge">{system.code}</span>
            {' '}<span className="tp-muted">
              {system.directKo ? `${system.poolCount} entries, direct KO` : `${system.poolCount} pools, ${system.adv} advancing`}
              {drawn ? ' · drawn' : ' · from checked-in entries'}
              {isDefault ? ' · default' : ' · edited'}
            </span>
          </h3>
          <p className="tp-muted" style={{ marginTop: 0 }}>
            Drag a slot onto another to swap them, or click a slot and type a code: P2.1 = pool 2, 1st place;
            W03 = winner of F-3{system.directKo ? '; #5 = entry 5' : ''}. Moving a W slot moves that fight.
          </p>
          {locked && <Message type="info">The draws are confirmed — only the owner can change brackets now.</Message>}
          {check.errors.length > 0 && <Message type="error">{check.errors.map((e) => <div key={e}>{e}</div>)}</Message>}
          {check.warnings.length > 0 && (
            <Message type="info"><strong>Check:</strong>{check.warnings.map((w) => <div key={w}>{w}</div>)}</Message>
          )}
          <KoBracket
            template={draft}
            nameOf={nameOf}
            resolved={resolved}
            directKo={system.directKo}
            onSwap={locked ? undefined : (a, b) => apply(swapSlots(draft, a, b))}
            onSet={onSet}
          />
          <div className="tp-actions">
            <button type="button" className="tp-btn" onClick={save} disabled={locked || busy || !dirty || check.errors.length > 0}>
              {busy ? 'Saving…' : 'Save bracket'}
            </button>
            <button type="button" className="tp-btn secondary" onClick={() => apply(current)} disabled={busy || !dirty}>Undo changes</button>
            <button type="button" className="tp-btn secondary" onClick={() => apply(defaultTemplate)} disabled={busy || !defaultTemplate || isDefault}>
              Default {system.code}
            </button>
            {variants.map((v) => (
              <button key={v} type="button" className="tp-btn secondary" disabled={busy}
                onClick={() => apply(parseTemplate(KO_VARIANTS[v]))}>
                Variant {v.split('@')[1]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Brackets;
