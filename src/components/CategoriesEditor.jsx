import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import CategoryCard from './CategoryCard';
import { Message } from './TournamentShell';
import { addCategory, deleteCategory, listEntriesFor, updateCategory, updateTournament } from '../lib/api';
import { EMPTY_CATEGORY, RULE_FIELDS, categoryRow, categorySetup, copyFields } from '../lib/tournament/categoryTemplates.js';
import { dayCount } from '../lib/tournament/days.js';

// after the draw these would change the pools or the bracket: kept until Undo draw
const STRUCTURE = ['kind', 'team_size', 'pool_size', 'advancing', 'pool_split', 'third_place', 'ko_template', 'ko_template_code', 'ko_template_edited'];
let nextKey = 1;

/**
 * Edit tournament → Categories (owner, 2026-11-22): the same category cards as
 * in Create. Each card saves on its own; new categories are added at the end;
 * a category without entries can be removed (with entries: Registration /
 * cancel in Drawings). After the draw what changes the pools or the bracket
 * stays as drawn; with the draws confirmed only the owner changes categories.
 */
export default function CategoriesEditor({ tournament, categories, role, onSaved }) {
  const [drafts, setDrafts] = useState({}); // id → edited category
  const [fresh, setFresh] = useState([]); // new, not saved yet
  const [counts, setCounts] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const ids = useMemo(() => categories.map((c) => c.id).join(), [categories]);
  useEffect(() => {
    listEntriesFor(categories.map((c) => c.id)).then((ens) => {
      const m = {};
      for (const e of ens) m[e.category_id] = (m[e.category_id] ?? 0) + 1;
      setCounts(m);
    }).catch(() => {});
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  const readOnly = tournament.draws_confirmed && role !== 'owner';
  const days = dayCount(tournament.start_date, tournament.end_date);
  const all = [...categories, ...fresh];
  const others = (c) => all.filter((x) => (x.id ?? x._key) !== (c.id ?? c._key) && x.kind === c.kind && x.name?.trim() && x.status !== 'cancelled');
  const run = async (fn, ok) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try { await fn(); await onSaved?.(); if (ok) setMsg({ type: 'success', text: ok }); }
    catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };
  const ageBasis = (v) => run(() => updateTournament(tournament.id, { age_basis: v }));

  const addNew = () => setFresh((cur) => {
    const base = { ...EMPTY_CATEGORY, _key: `new-${nextKey++}`, _fresh: true };
    const first = all.find((x) => x.kind === base.kind && x.status !== 'cancelled');
    return [...cur, first ? copyFields(base, first, RULE_FIELDS) : base];
  });
  const template = (key, tpl) => setFresh((cur) => cur.map((c) => {
    if (c._key !== key) return c;
    const next = { ...EMPTY_CATEGORY, ...categorySetup(tpl), day: c.day ?? 1, name: c.name.trim() ? c.name : tpl.name, _key: key };
    const first = categories.find((x) => x.kind === next.kind && x.status !== 'cancelled');
    return first ? copyFields(next, first, RULE_FIELDS) : next;
  }));

  const saveExisting = (c) => {
    const draft = drafts[c.id];
    if (!draft.name.trim()) { setMsg({ type: 'error', text: 'Every category needs a name.' }); return; }
    const row = { ...categoryRow(draft), day: Number(draft.day) || 1 };
    if (c.status !== 'registration') for (const k of STRUCTURE) delete row[k];
    run(async () => { await updateCategory(c.id, row); setDrafts(({ [c.id]: _, ...rest }) => rest); }, `${draft.name.trim()} saved.`);
  };
  const saveNew = (c) => {
    if (!c.name.trim()) { setMsg({ type: 'error', text: 'Every category needs a name.' }); return; }
    const order = Math.max(-1, ...categories.map((x) => x.sort_order ?? 0)) + 1;
    run(async () => {
      await addCategory(tournament.id, { ...categoryRow(c), day: Math.min(Number(c.day) || 1, days) }, order);
      setFresh((cur) => cur.filter((x) => x._key !== c._key));
    }, `${c.name.trim()} added.`);
  };

  return (
    <div className="tp-card">
      <h3>Categories</h3>
      <p className="tp-muted" style={{ marginTop: 0 }}>Each category saves on its own. After the draw, what would change the pools or the bracket stays as drawn (Undo draw in Drawings to change it).</p>
      {readOnly && <Message type="info">The draws are confirmed — only the owner can change the categories now.</Message>}
      <Message type={msg.type || 'info'}>{msg.text}</Message>
      <div className="tp-actions" style={{ marginTop: 0, marginBottom: '1rem' }}>
        <button type="button" className="tp-btn" disabled={readOnly} onClick={addNew}>+ Add new category</button>
      </div>

      {categories.map((saved) => {
        const c = drafts[saved.id] ?? saved;
        const entries = counts[saved.id] ?? 0;
        const drawn = saved.status !== 'registration';
        const cancelled = saved.status === 'cancelled';
        const canRemove = !drawn && entries === 0 && !readOnly;
        return (
          <CategoryCard key={saved.id} c={c} id={saved.id} days={days} startDate={tournament.start_date}
            ageBasis={tournament.age_basis} onAgeBasis={readOnly ? undefined : ageBasis}
            onChange={(next) => setDrafts((d) => ({ ...d, [saved.id]: next }))}
            onRemove={canRemove ? () => run(() => deleteCategory(saved.id), `${saved.name} removed.`) : null}
            removeNote={canRemove ? null : cancelled ? 'Cancelled — restore it in Drawings.' : drawn ? 'Drawn — Undo draw in Drawings to remove it.' : entries ? `${entries} ${entries === 1 ? 'entry' : 'entries'} — move or remove them in Registration first.` : null}
            others={others(saved)} structureLocked={drawn} readOnly={readOnly || cancelled}>
            {drafts[saved.id] && (
              <div className="tp-actions ct-save">
                <button type="button" className="tp-btn" disabled={busy} onClick={() => saveExisting(saved)}>Save {c.name.trim() || 'category'}</button>
                <button type="button" className="tp-btn secondary" disabled={busy} onClick={() => setDrafts(({ [saved.id]: _, ...rest }) => rest)}>Cancel</button>
              </div>
            )}
          </CategoryCard>
        );
      })}

      {fresh.map((c) => (
        <CategoryCard key={c._key} c={c} id={c._key} days={days} startDate={tournament.start_date}
          ageBasis={tournament.age_basis} onAgeBasis={ageBasis}
          onChange={(next) => setFresh((cur) => cur.map((x) => (x._key === c._key ? { ...next, _key: c._key } : x)))}
          onTemplate={(p) => template(c._key, p)}
          onRemove={() => setFresh((cur) => cur.filter((x) => x._key !== c._key))} others={others(c)}>
          <div className="tp-actions ct-save">
            <button type="button" className="tp-btn" disabled={busy} onClick={() => saveNew(c)}>Add {c.name.trim() || 'category'} to the tournament</button>
          </div>
        </CategoryCard>
      ))}

      {all.length > 0 && !readOnly && (
        <div className="tp-actions">
          <button type="button" className="tp-btn secondary" onClick={addNew}>+ Add one more category</button>
        </div>
      )}
      <p className="tp-muted">Entries, presence and the draw of each category: <Link to={`/tournament/${tournament.id}/registration`}>Registration</Link> · <Link to={`/tournament/${tournament.id}/drawings`}>Drawings</Link>.</p>
    </div>
  );
}
