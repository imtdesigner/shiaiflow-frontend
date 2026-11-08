import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackToDashboard, Message } from '../components/TournamentShell';
import CategoryRules from '../components/CategoryRules';
import FightRules from '../components/FightRules';
import { createTournament, listCategorySources } from '../lib/api';
import { CATEGORY_TEMPLATES, EMPTY_CATEGORY, categoryRow, categorySetup } from '../lib/tournament/categoryTemplates.js';
import { rulesText } from '../lib/tournament/eligibility.js';
import './TournamentPages.css';

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
    name: '', start_date: '', end_date: '', venue: '', city: '', country: 'Croatia',
    shiaijo_count: 2, age_basis: 'birth_year', single_category: false,
  });
  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState(null); // copy dialog: null = closed
  const [sourceQuery, setSourceQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const addCategories = (list) => setCategories((cur) => [...cur, ...list.map((c) => withKey({ ...EMPTY_CATEGORY, ...categorySetup(c) }))]);
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
    setSaving(true);
    try {
      const t = await createTournament({
        name: form.name.trim(),
        start_date: form.start_date || null,
        end_date: form.end_date || form.start_date || null,
        venue: form.venue.trim() || null,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        shiaijo_count: Number(form.shiaijo_count),
        age_basis: form.age_basis,
        single_category: form.single_category,
        is_public: false,
        status: 'registration',
      }, categories.map(categoryRow));
      navigate(`/tournament/${t.id}/registration`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const q = sourceQuery.trim().toLowerCase();
  const shownSources = (sources ?? []).filter((t) => !q || `${t.name} ${t.city ?? ''} ${t.start_date ?? ''}`.toLowerCase().includes(q));

  return (
    <div className="tp-page">
      <BackToDashboard />
      <h2>New tournament</h2>
      <p className="tp-subtitle">Details and categories. Everything can be changed later.</p>
      <Message type="error">{error}</Message>

      <form onSubmit={handleSubmit}>
        <div className="tp-card">
          <h3>Tournament</h3>
          <div className="tp-grid">
            <label className="tp-field" style={{ gridColumn: '1 / -1' }}>
              Name
              <input value={form.name} onChange={set('name')} placeholder="e.g. Croatian Kendo Championship 2027" required />
            </label>
            <label className="tp-field">Start date<input type="date" value={form.start_date} onChange={set('start_date')} /></label>
            <label className="tp-field">End date<input type="date" value={form.end_date} onChange={set('end_date')} /></label>
            <label className="tp-field">Venue<input value={form.venue} onChange={set('venue')} /></label>
            <label className="tp-field">City<input value={form.city} onChange={set('city')} /></label>
            <label className="tp-field">Country<input value={form.country} onChange={set('country')} /></label>
            <label className="tp-field">
              Number of courts (shiaijo)
              <select value={form.shiaijo_count} onChange={set('shiaijo_count')}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <h4>Signup</h4>
          <div className="tp-grid">
            <label className="tp-field">
              Age limits count
              <select value={form.age_basis} onChange={set('age_basis')}>
                <option value="birth_year">by birth year (tournament year − birth year)</option>
                <option value="birth_date">by exact age on the first day (asks the date of birth)</option>
              </select>
            </label>
            <label className="tp-field tp-check">
              <input type="checkbox" checked={form.single_category} onChange={set('single_category')} />
              A competitor may enter only one individual category (of those they qualify for)
            </label>
          </div>
        </div>

        <div className="tp-card">
          <h3>Categories</h3>
          <p className="tp-muted">Start from a template — everything can be changed, the name too — or add an empty one.</p>
          <div className="tp-actions" style={{ marginTop: 0, marginBottom: '1rem' }}>
            {CATEGORY_TEMPLATES.map((p) => (
              <button key={p.name} type="button" className="tp-btn secondary small" onClick={() => addCategories([p])}>+ {p.name}</button>
            ))}
            <button type="button" className="tp-btn small" onClick={() => addCategories([EMPTY_CATEGORY])}>+ Add new</button>
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
                  <button type="button" className="tp-btn small" onClick={() => { addCategories(t.categories); setSources(null); }}>
                    Copy {t.categories.length} categor{t.categories.length === 1 ? 'y' : 'ies'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {categories.length === 0 && <p className="tp-muted">No categories yet.</p>}
          {categories.map((c) => (
            <div key={c._key} className="ct-category">
              <div className="ct-category-head">
                <input value={c.name} placeholder="Category name" onChange={(e) => updateCategory(c._key, 'name', e.target.value)} />
                <select value={c.kind} onChange={(e) => updateCategory(c._key, 'kind', e.target.value)}>
                  <option value="individual">Individual</option>
                  <option value="team">Team</option>
                </select>
                <span className="tp-muted">{rulesText(c)}</span>
                <button type="button" className="tp-btn danger small" style={{ marginLeft: 'auto' }} onClick={() => removeCategory(c._key)}>Remove</button>
              </div>

              <h4>1 · Who can enter</h4>
              <CategoryRules category={c} ageBasis={form.age_basis} onChange={(next) => replaceCategory(c._key, next)} />

              <h4>2 · Fights</h4>
              <FightRules category={c} onChange={(next) => replaceCategory(c._key, next)} />
              <p className="tp-muted">The KO bracket can be adjusted per category in the bracket editor.</p>
            </div>
          ))}
        </div>

        <div className="tp-actions">
          <button type="submit" className="tp-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Create tournament and go to registration'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateTournament;
