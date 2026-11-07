import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import backIcon from '../assets/icons/back_to_dashboard.png';
import { getTournament, listCategories } from '../lib/api';
import '../pages/TournamentPages.css';

/** Loads the tournament from the URL and its categories. */
export function useTournament() {
  const { tournamentId } = useParams();
  const [tournament, setTournament] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [t, cats] = await Promise.all([getTournament(tournamentId), listCategories(tournamentId)]);
      setTournament(t);
      setCategories(cats);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => { reload(); }, [reload]);

  return { tournamentId, tournament, categories, setCategories, error, loading, reload };
}

export function BackToDashboard() {
  const navigate = useNavigate();
  return (
    <img
      src={backIcon}
      alt="Back to Dashboard"
      className="back-to-dashboard-icon"
      onClick={() => navigate('/dashboard')}
      title="Back to Dashboard"
    />
  );
}

export function Message({ type = 'info', children }) {
  if (!children) return null;
  return <div className={`tp-message ${type}`}>{children}</div>;
}

/** Category selector as pill tabs. */
export function CategoryTabs({ categories, selectedId, onSelect, renderExtra }) {
  return (
    <div className="tp-tabs">
      {categories.map((c) => (
        <button
          type="button"
          key={c.id}
          className={`tp-tab ${c.id === selectedId ? 'active' : ''}`}
          onClick={() => onSelect(c.id)}
        >
          {c.name}
          {renderExtra ? renderExtra(c) : null}
        </button>
      ))}
    </div>
  );
}

export function entryName(entry) {
  if (entry?.team) return entry.team.name;
  const c = entry?.competitor;
  if (!c) return '—';
  return c.display_name || `${c.last_name}${c.first_name ? ` ${c.first_name}` : ''}`;
}
