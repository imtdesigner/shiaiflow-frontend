import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackToDashboard, Message } from '../components/TournamentShell';
import CategoryRules from '../components/CategoryRules';
import FightRules from '../components/FightRules';
import { createTournament, listCategorySources } from '../lib/api';
import { CATEGORY_TEMPLATES, EMPTY_CATEGORY, RULE_FIELDS, categoryRow, categorySetup, copyFields } from '../lib/tournament/categoryTemplates.js';
import { rulesText } from '../lib/tournament/eligibility.js';
import { PublicPagePart, TournamentPart, VenuePart, linkReady, noEnterSubmit } from '../components/TournamentFields';
import { addDays, dayCount, daysValue } from '../lib/tournament/days.js';
import { fmtDay } from '../lib/format.js';
import Segmented from '../components/Segmented';
import './TournamentPages.css';
import { useGuide } from '../components/GuidePanel';
import { DEFAULT_PROGRAM } from '../lib/tournament/program.js';

let nextKey = 1;
const withKey = (c) => ({ ...c, _key: nextKey++ });

/**
 * New tournament: details, then categories. A category starts from a template
 * (everything editable, the name too), from scratch, or as a copy from an
 * earlier tournament (own or published). Each category has two parts: who can
 * enter (signup rules) and how it is fought.
 */
function CreateTournament() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', start_date: '', end_date: '', use_schedule: null, venue: '', address: '', city: '', country: 'Croatia',
    shiaijo_count: 2, age_basis: 'birth_year', single_category: false, days: [], slug: '', custom_link: null, program: DEFAULT_PROGRAM,
  });
  const [linkState, setLinkState] = useState(null);
  const [linkConfirmed, setLinkConfirmed] = useState(false);
  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState(null); // copy dialog: null = closed
  const [sourceQuery, setSourceQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // the setup guide follows the form while it is filled in
  const { setCreate } = useGuide();
  useEffect(() => { setCreate({ form, categories }); }, [form, categories, setCreate]);
  useEffect(() => () => setCreate(null), [setCreate]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  // a new category (template or empty) takes the fight rules of the first category of its kind;
  // copies from another tournament keep their own
  const addCategories = (list, inherit = true) => setCategories((cur) => [...cur, ...list.map((c) => {
    const fresh = { ...EMPTY_CATEGORY, ...categorySetup(c), _fresh: c._fresh };
    const first = inherit && cur.find((x) => x.kind === fresh.kind);
    return withKey(first ? copyFields(fresh, first, RULE_FIELDS) : fresh);
  })]);
  // "Add new": an empty category that offers the templates inside it; a template fills everything in
  const addNew = () => addCategories([{ ...EMPTY_CATEGORY, _fresh: true }]);
  const applyTemplate = (key, tpl) => setCategories((cur) => cur.map((c) => {
    if (c._key !== key) return c;
    const fresh = { ...EMPTY_CATEGORY, ...categorySetup(tpl), day: c.day ?? 1 };
    const first = cur.find((x) => x._key !== key && x.kind === fresh.kind && x.name.trim());
    return { ...(first ? copyFields(fresh, first, RULE_FIELDS) : fresh), _key: key };
  }));
  const replaceCategory = (key, next) => setCategories((cur) => cur.map((c) => (c._key === key ? { ...next, _key: key } : c)));
  const updateCategory = (key, k, v) => setCategories((cur) => cur.map((c) => {
    if (c._key !== key) return c;
    const next = { ...c, [k]: v };
    if (k === 'kind') {
      next.team_size = v === 'team' ? 3 : null;
      if (v !== 'team') { next.team_same_dojo = false; next.position_rules = null; }
    }
    return next;
  }));
  const removeCategory = (key) => setCategories((cur) => cur.filter((c) => c._key !== key));

  const openCopy = async () => {
    setSources([]);
    try { setSources(await listCategorySources()); } catch (e) { setError(e.message); setSources(null); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Enter the tournament name.'); return; }
    if (categories.some((c) => !c.name.trim())) { setError('Every category needs a name.'); return; }
    if (form.custom_link && !linkReady(form.slug, '', linkState, linkConfirmed)) { setError('Check the link name.'); return; }
    const days = form.start_date ? daysValue(form.start_date, form.end_date || form.start_date, form.use_schedule ? form.days : []) : null;
    const lastDay = days ? days.length : 1;
    setSaving(true);
    try {
      const t = await createTournament({
        name: form.name.trim(),
        start_date: form.start_date || null,
        end_date: form.end_date || form.start_date || null,
        venue: form.venue.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        shiaijo_count: Number(form.shiaijo_count),
        age_basis: form.age_basis,
        days,
        start_time: days?.[0]?.start || null,
        program: form.use_schedule ? form.program : null,
        slug: (form.custom_link && form.slug) || null,
        single_category: form.single_category,
        is_public: false,
        status: 'registration',
      }, categories.map((c) => ({ ...categoryRow(c), day: Math.min(Number(c.day) || 1, lastDay) })));
      navigate(`/tournament/${t.id}/registration`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const q = sourceQuery.trim().toLowerCase();
  const days = dayCount(form.start_date, form.end_date);
  const shownSources = (sources ?? []).filter((t) => !q || `${t.name} ${t.city ?? ''} ${t.start_date ?? ''}`.toLowerCase().includes(q));

  return (
    <div className="tp-page">
      <BackToDashboard />
      <h2>New tournament</h2>
      <p className="tp-subtitle">Details and categories. Everything can be changed later.</p>
      <p className="tp-muted guide-note">The setup guide on the right (at the bottom on small screens) shows the next step — click it to jump there.</p>
      <Message type="error">{error}</Message>

      <form onSubmit={handleSubmit} onKeyDown={noEnterSubmit}>
        <TournamentPart form={form} setForm={setForm} />
        <VenuePart form={form} setForm={setForm} />
        <PublicPagePart form={form} setForm={setForm} linkConfirmed={linkConfirmed} setLinkConfirmed={setLinkConfirmed} setLinkState={setLinkState} />

        <div id="g-categories" className="tp-card">
          <h3>Categories</h3>
          <p className="tp-muted">Add a category, then pick a template inside it (Junior A, Kyu, Dan …) — everything stays editable, the name too.</p>
          <div className="tp-actions" style={{ marginTop: 0, marginBottom: '1rem' }}>
            <button type="button" className="tp-btn" onClick={addNew}>+ Add new category</button>
            <button type="button" className="tp-btn secondary small" onClick={sources ? () => setSources(null) : openCopy}>
              {sources ? 'Close copying' : 'Copy from another tournament…'}
            </button>
          </div>

          {sources && (
            <div className="tp-card" style={{ background: '#faf8f3' }}>
              <input placeholder="Find a tournament (name, city, year)" value={sourceQuery} onChange={(e) => setSourceQuery(e.target.value)} />
              {sources.length === 0 && <p className="tp-muted">Loading…</p>}
              {shownSources.slice(0, 30).map((t) => (
                <div key={t.id} className="ct-source">
                  <div>
                    <strong>{t.name}</strong>{t.own && <span className="tp-badge ok">yours</span>}
                    <div className="tp-muted">{[t.start_date, t.city].filter(Boolean).join(' · ')} — {t.categories.map((c) => c.name).join(', ')}</div>
                  </div>
                  <button type="button" className="tp-btn small" onClick={() => { addCategories(t.categories, false); setSources(null); }}>
                    Copy {t.categories.length} categor{t.categories.length === 1 ? 'y' : 'ies'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {categories.length === 0 && <p className="tp-muted">No categories yet.</p>}
          {categories.map((c) => (
            <div key={c._key} id={`g-cat-${c._key}`} className="ct-category">
              <button type="button" className="tp-btn danger small ct-remove"
                onClick={() => { if (!c.name.trim() || window.confirm(`Remove the category "${c.name.trim()}"?`)) removeCategory(c._key); }}>Remove category</button>
              <div id={`g-cat-${c._key}-name`} className="ct-head">
                {c._fresh && (
                  <div className="ct-templates">
                    <span className="ct-head-label">Templates</span>
                    {CATEGORY_TEMPLATES.map((p) => (
                      <button key={p.name} type="button" className="tp-btn secondary small" onClick={() => applyTemplate(c._key, p)}>{p.name}</button>
                    ))}
                  </div>
                )}
                <div className="ct-head-name">
                  <input value={c.name} placeholder="Category name" onChange={(e) => updateCategory(c._key, 'name', e.target.value)} />
                </div>
                <div>
                  <Segmented options={[['individual', 'Individual'], ['team', 'Team']]} value={c.kind}
                    onChange={(v) => updateCategory(c._key, 'kind', v)} />
                </div>
                {days > 1 && (
                  <div>
                    <Segmented options={Array.from({ length: days }, (_, i) => [i + 1, `Day ${i + 1}${form.start_date ? ` · ${fmtDay(addDays(form.start_date, i))}` : ''}`])}
                      value={Number(c.day ?? 1)} onChange={(v) => updateCategory(c._key, 'day', v)} />
                  </div>
                )}
                <span className="tp-muted">{rulesText(c)}</span>
              </div>

              <div id={`g-cat-${c._key}-who`}>
                <h4>1 · Who can enter</h4>
                <CategoryRules category={c} ageBasis={form.age_basis} onAgeBasis={(v) => setForm({ ...form, age_basis: v })}
                  onChange={(next) => replaceCategory(c._key, next)} />
              </div>

              <div id={`g-cat-${c._key}-fights`}>
                <h4>2 · Type of tournament</h4>
                <FightRules category={c} onChange={(next) => replaceCategory(c._key, next)}
                  others={categories.filter((x) => x._key !== c._key && x.kind === c.kind && x.name.trim())} />
              </div>
              <p className="tp-muted">The KO bracket can be adjusted per category in the bracket editor.</p>
            </div>
          ))}
          {categories.length > 0 && (
            <div className="tp-actions">
              <button type="button" className="tp-btn secondary" onClick={addNew}>+ Add one more category</button>
            </div>
          )}
        </div>

        <div id="g-create" className="tp-actions">
          <button type="submit" className="tp-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Create tournament and go to registration'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateTournament;
