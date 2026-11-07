import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackToDashboard, Message } from '../components/TournamentShell';
import { createTournament } from '../lib/api';
import './TournamentPages.css';

// Category presets taken from DP HKS 2026 (times in seconds).
const PRESETS = [
  { name: 'Junior A', kind: 'individual', pool_size: 3, advancing: 2, pool_fight_seconds: 120, ko_fight_seconds: 180, final_fight_seconds: 180 },
  { name: 'Junior B', kind: 'individual', pool_size: 3, advancing: 2, pool_fight_seconds: 120, ko_fight_seconds: 180, final_fight_seconds: 180 },
  { name: 'Kyu W', kind: 'individual', pool_size: 3, advancing: 2, pool_fight_seconds: 120, ko_fight_seconds: 180, final_fight_seconds: 180 },
  { name: 'Kyu M', kind: 'individual', pool_size: 3, advancing: 2, pool_fight_seconds: 120, ko_fight_seconds: 180, final_fight_seconds: 180 },
  { name: 'Dan W', kind: 'individual', pool_size: 3, advancing: 2, pool_fight_seconds: 180, ko_fight_seconds: 180, final_fight_seconds: 240 },
  { name: 'Dan M', kind: 'individual', pool_size: 3, advancing: 2, pool_fight_seconds: 240, ko_fight_seconds: 240, final_fight_seconds: 300 },
  { name: 'Team juniors', kind: 'team', team_size: 3, pool_size: 3, advancing: 1, pool_fight_seconds: 300, ko_fight_seconds: 300, final_fight_seconds: 300 },
  { name: 'Team adults', kind: 'team', team_size: 3, pool_size: 1, advancing: 1, pool_fight_seconds: 300, ko_fight_seconds: 300, final_fight_seconds: 300 },
];

const EMPTY_CATEGORY = {
  name: '', kind: 'individual', team_size: null, pool_size: 3, advancing: 2,
  pool_fight_seconds: 180, ko_fight_seconds: 180, final_fight_seconds: 240,
};

const toMin = (s) => (s / 60).toString();
const toSec = (m) => Math.max(30, Math.round(Number(m) * 60) || 0);

function CreateTournament() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', start_date: '', end_date: '', venue: '', city: '', country: 'Croatia',
    shiaijo_count: 2, is_public: true,
  });
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const addCategory = (preset) => {
    if (preset && categories.some((c) => c.name === preset.name)) return;
    setCategories([...categories, { ...EMPTY_CATEGORY, ...preset }]);
  };
  const updateCategory = (i, k, v) => setCategories(categories.map((c, j) => {
    if (j !== i) return c;
    const next = { ...c, [k]: v };
    if (k === 'kind') next.team_size = v === 'team' ? 3 : null;
    return next;
  }));
  const removeCategory = (i) => setCategories(categories.filter((_, j) => j !== i));

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
        is_public: form.is_public,
        status: 'registration',
      }, categories.map((c) => ({
        name: c.name.trim(),
        kind: c.kind,
        team_size: c.kind === 'team' ? Number(c.team_size) : null,
        pool_size: Number(c.pool_size),
        advancing: Number(c.advancing),
        pool_fight_seconds: Number(c.pool_fight_seconds),
        ko_fight_seconds: Number(c.ko_fight_seconds),
        final_fight_seconds: Number(c.final_fight_seconds),
      })));
      navigate(`/tournament/${t.id}/registration`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="tp-page">
      <BackToDashboard />
      <h2>New tournament</h2>
      <p className="tp-subtitle">Basic details and categories. Everything can be changed later.</p>
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
              <input type="number" min="1" max="12" value={form.shiaijo_count} onChange={set('shiaijo_count')} />
            </label>
            <label className="tp-field tp-check">
              <input type="checkbox" checked={form.is_public} onChange={set('is_public')} />
              Public results (visible without login)
            </label>
          </div>
        </div>

        <div className="tp-card">
          <h3>Categories</h3>
          <div className="tp-actions" style={{ marginTop: 0, marginBottom: '1rem' }}>
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className="tp-btn secondary small"
                disabled={categories.some((c) => c.name === p.name)}
                onClick={() => addCategory(p)}
              >
                + {p.name}
              </button>
            ))}
            <button type="button" className="tp-btn small" onClick={() => addCategory()}>+ Empty category</button>
          </div>

          {categories.length === 0 ? (
            <p className="tp-muted">Add categories with the buttons above (settings from DP HKS 2026).</p>
          ) : (
            <table className="tp-table">
              <thead>
                <tr>
                  <th>Name</th><th>Type</th><th>Team</th><th>Per pool</th><th>Advancing</th>
                  <th>Pool (min)</th><th>KO (min)</th><th>Final (min)</th><th />
                </tr>
              </thead>
              <tbody>
                {categories.map((c, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <tr key={i}>
                    <td><input value={c.name} onChange={(e) => updateCategory(i, 'name', e.target.value)} /></td>
                    <td>
                      <select value={c.kind} onChange={(e) => updateCategory(i, 'kind', e.target.value)}>
                        <option value="individual">Individual</option>
                        <option value="team">Team</option>
                      </select>
                    </td>
                    <td>
                      {c.kind === 'team' ? (
                        <select value={c.team_size} onChange={(e) => updateCategory(i, 'team_size', Number(e.target.value))}>
                          <option value={3}>3</option>
                          <option value={5}>5</option>
                        </select>
                      ) : '—'}
                    </td>
                    <td>
                      <select value={c.pool_size} onChange={(e) => updateCategory(i, 'pool_size', Number(e.target.value))}>
                        <option value={1}>direct KO</option>
                        {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={c.advancing} onChange={(e) => updateCategory(i, 'advancing', Number(e.target.value))} disabled={c.pool_size === 1}>
                        <option value={0}>pools only</option>
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                      </select>
                    </td>
                    <td><input type="number" step="0.5" min="0.5" value={toMin(c.pool_fight_seconds)} onChange={(e) => updateCategory(i, 'pool_fight_seconds', toSec(e.target.value))} /></td>
                    <td><input type="number" step="0.5" min="0.5" value={toMin(c.ko_fight_seconds)} onChange={(e) => updateCategory(i, 'ko_fight_seconds', toSec(e.target.value))} /></td>
                    <td><input type="number" step="0.5" min="0.5" value={toMin(c.final_fight_seconds)} onChange={(e) => updateCategory(i, 'final_fight_seconds', toSec(e.target.value))} /></td>
                    <td><button type="button" className="tp-btn danger small" onClick={() => removeCategory(i)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
