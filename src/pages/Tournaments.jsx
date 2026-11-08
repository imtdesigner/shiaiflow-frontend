import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import TournamentList from '../components/TournamentList';
import { listPublicTournaments } from '../lib/api';
import './TournamentPages.css';

/**
 * Tournaments: every published tournament that is active (signup open, signup
 * closed, ongoing); "Past" shows the ones that are over, with their setup and
 * results.
 */
function Tournaments() {
  const [past, setPast] = useState(false);
  const [tournaments, setTournaments] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setTournaments(null);
    listPublicTournaments({ past }).then(setTournaments).catch(() => setTournaments([]));
  }, [past]);

  return (
    <div className="tp-page tp-tournaments">
      <h2>Tournaments</h2>
      <div className="tp-tabs" style={{ justifyContent: 'center' }}>
        <button type="button" className={`tp-tab ${!past ? 'active' : ''}`} onClick={() => setPast(false)}>Active</button>
        <button type="button" className={`tp-tab ${past ? 'active' : ''}`} onClick={() => setPast(true)}>Past</button>
      </div>
      <div className="home-actions">
        <div className="search-wrapper">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="search-icon" />
          <input
            type="text"
            className="search-tournaments"
            placeholder="By name, city or country"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <TournamentList
        tournaments={tournaments}
        query={query}
        past={past}
        emptyText={past ? 'No past tournaments yet.' : 'No active tournaments right now.'}
      />
    </div>
  );
}

export default Tournaments;
