import './App.css';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import contactIcon from './assets/icons/contact.png';
import bracketIcon from './assets/icons/bracket_editor.png';
import drawingsIcon from './assets/icons/drawings.png';
import registrationIcon from './assets/icons/registration.png';
import editTournamentIcon from './assets/icons/edit_tournament.png';
import manageIcon from './assets/icons/manage_tournament.png';
import shinpanIcon from './assets/icons/shinpan_allocation.png';
import scoreIcon from './assets/icons/score_input.png';
import createIcon from './assets/icons/create_tournament.png';
import tournamentIcon from './assets/icons/select_tournament.png';
import React, { useEffect, useState } from 'react';
import packageJson from '../package.json';
import CreateTournament from './pages/CreateTournament';
import EditTournament from './pages/EditTournament';
import Brackets from './pages/Brackets';
import Drawings from './pages/Drawings';
import Registration from './pages/Registration';
import Manage from './pages/Manage';
import Shinpan from './pages/Shinpan';
import ScoreInput from './pages/ScoreInput';
import ShiaijoPlan from './pages/ShiaijoPlan';
import FightPlan from './pages/FightPlan';
import JoinCourt from './pages/JoinCourt';
import SignupPage from './pages/SignupPage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './ProtectRoute'; // import it
import ProfilePage from './pages/ProfilePage'; // at top with other imports
import ResetPasswordPage from './pages/ResetPasswordPage';
import { supabase } from './supabaseClient';
import { amIAdmin, listMyTournaments, listPublicTournaments } from './lib/api';
import AdminAccounts from './pages/AdminAccounts';
import { PublicTournamentRoute } from './pages/PublicTournament';
import Tournaments from './pages/Tournaments';
import TournamentList from './components/TournamentList';
import './pages/TournamentPages.css';



/** Home (before login): active published tournaments with the ways in. */
function Home () {
  const [tournaments, setTournaments] = useState(null);
  const [query, setQuery] = useState('');
  useEffect(() => { listPublicTournaments().then(setTournaments).catch(() => setTournaments([])); }, []);
  return (
    <div className="app-container">
      <h1 className="home-logo">
        <span className="shiai">Shiai</span><span className="flow">Flow</span>
      </h1>
      <p className="home-kanji">試合フロー</p>
      <div className="home-actions">
        <div className="search-wrapper">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="search-icon" />
          <input
            type="text"
            className="search-tournaments"
            placeholder="Search: name, place, date, category, status…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <TournamentList tournaments={tournaments} query={query} emptyText="No active tournaments right now." />
      <p><Link to="/tournaments">Past tournaments →</Link></p>
      <p className="powered">Powered by Claude</p>
      <p className="app-version">Version {packageJson.version}</p>
    </div>
  );
}

function Dashboard() {
  const [showDropdown, setShowDropdown] = useState(false);
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('sf-selected-tournament')) ?? null; } catch { return null; }
  });
  const [pendingPath, setPendingPath] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    listMyTournaments().then(setTournaments).catch(() => setTournaments([]));
  }, []);

  const handleNavigation = (path) => {
    if (path === '/create-tournament') {
      navigate(path);
    } else if (selectedTournament) {
      navigate(`/tournament/${selectedTournament.id}/${path}`);
    } else {
      setPendingPath(path); // store where user wanted to go
      setShowDropdown(true); // open selector
    }
  };

  const handleTournamentSelect = (tournament) => {
    const selected = { id: tournament.id, name: tournament.name };
    setSelectedTournament(selected);
    try { sessionStorage.setItem('sf-selected-tournament', JSON.stringify(selected)); } catch { /* ignore */ }
    setShowDropdown(false);

    // If user had clicked an icon before, go to that path
    if (pendingPath) {
      navigate(`/tournament/${tournament.id}/${pendingPath}`);
      setPendingPath(''); // reset
    }
  };

  return (
    <div className="dashboard">
      {/* ... profile bar ... */}

      <div className="dashboard-main">
        <div className="create-container special-font">
          <div className="icon-label" onClick={() => handleNavigation('/create-tournament')}>
            <img src={createIcon} alt="Create Tournament" />
            <p>Create Tournament</p>
          </div>
        </div>

        <div className="tournament-dropdown">
          <img
            src={tournamentIcon}
            alt="Select Tournament"
            className="dropdown-icon"
            onClick={() => setShowDropdown(!showDropdown)}
          />
          {selectedTournament && <p className="selected-tournament">{selectedTournament.name}</p>}

          {showDropdown && (
            <ul className="dropdown-list">
              {tournaments.length === 0 && (
                <li onClick={() => navigate('/create-tournament')}>No tournaments yet — create your first one</li>
              )}
              {tournaments.map((t) => (
                <li key={t.id} onClick={() => handleTournamentSelect(t)}>
                  {t.name}{t.start_date ? ` (${t.start_date.slice(0, 4)})` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* rest of the icons */}
        <div className="icon-row">
          <div className="icon-label" onClick={() => handleNavigation('edit')}>
            <img src={editTournamentIcon} alt="Edit tournament" />
            <p>Edit tournament</p>
          </div>
          <div className="icon-label" onClick={() => handleNavigation('brackets')}>
            <img src={bracketIcon} alt="Bracket Editor" />
            <p>Edit brackets</p>
          </div>
          <div className="icon-label" onClick={() => handleNavigation('drawings')}>
            <img src={drawingsIcon} alt="Drawings" />
            <p>Drawings</p>
          </div>
          <div className="icon-label" onClick={() => handleNavigation('registration')}>
            <img src={registrationIcon} alt="Registration" />
            <p>Registration</p>
          </div>
          <div className="icon-label" onClick={() => handleNavigation('manage')}>
            <img src={manageIcon} alt="Manage Tournament" />
            <p>Manage (Start) tournament</p>
          </div>
        </div>

        <div className="icon-row">
          <div className="icon-label" onClick={() => handleNavigation('shinpan')}>
            <img src={shinpanIcon} alt="Shinpan Allocation" />
            <p>Allocate shinpans</p>
          </div>
          <div className="icon-label" onClick={() => handleNavigation('score')}>
            <img src={scoreIcon} alt="Score Input" />
            <p>Scoretable</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { if (session) amIAdmin().then(setIsAdmin); else setIsAdmin(false); }, [session]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (isMounted) {
        setSession(currentSession);
        setIsAuthLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (isMounted) {
        setSession(currentSession);
        setIsAuthLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Logout failed:', error.message);
      return;
    }

    navigate('/', { replace: true });
  };

  const publicOnly = (page) => {
    if (isAuthLoading) {
      return <div className="page">Loading...</div>;
    }

    return session ? <Navigate to="/dashboard" replace /> : page;
  };

  return (
    <>
  <nav className="navbar">
  <div className="nav-logo">
    <Link to={session ? '/dashboard' : '/'} className="nav-logo-text">
      Shiai<span className="flow">Flow</span>
    </Link>
  </div>
  <div className="nav-links">
    {!isAuthLoading && (session ? (
      <>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/profile">Profile</Link>
        {isAdmin && <Link to="/admin/accounts">Admin</Link>}
        <button type="button" className="nav-link-button" onClick={handleLogout}>
          Log Out
        </button>
      </>
    ) : (
      <>
        <Link to="/login">Log In</Link>
        <Link to="/signup">Sign Up</Link>
      </>
    ))}
    <Link to="/tournaments">Tournaments</Link>
    <div className="nav-icon-wrapper">
      <a href="mailto:IMTdesigner@shiaiflow.com">
      <img src={contactIcon} alt="Contact Developer" className="contact-icon" />
    </a>
  </div>
  </div>
</nav>
      <Routes>
        <Route path="/" element={publicOnly(<Home />)} />
        <Route path="/login" element={publicOnly(<LoginPage />)} />
        <Route path="/signup" element={publicOnly(<SignupPage />)} />
        
        {/* Wrap dashboard in protected route */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />

        <Route path="/tournaments" element={<Tournaments />} />
        <Route path="/admin/accounts" element={<ProtectedRoute><AdminAccounts /></ProtectedRoute>} />
        {/* old links */}
        <Route path="/explore" element={<Navigate to="/tournaments" replace />} />
        <Route path="/attend" element={<Navigate to="/tournaments" replace />} />
        
        <Route 
  path="/create-tournament" 
  element={
    <ProtectedRoute>
      <CreateTournament />
    </ProtectedRoute>
  } 
/>
<Route 
  path="/tournament/:tournamentId/edit" 
  element={
    <ProtectedRoute>
      <EditTournament />
    </ProtectedRoute>
  } 
/>
<Route 
  path="/tournament/:tournamentId/brackets" 
  element={
    <ProtectedRoute>
      <Brackets />
    </ProtectedRoute>
  } 
/>
<Route 
  path="/tournament/:tournamentId/drawings" 
  element={
    <ProtectedRoute>
      <Drawings />
    </ProtectedRoute>
  } 
/>
<Route 
  path="/tournament/:tournamentId/registration" 
  element={
    <ProtectedRoute>
      <Registration />
    </ProtectedRoute>
  } 
/>
<Route 
  path="/tournament/:tournamentId/manage" 
  element={
    <ProtectedRoute>
      <Manage />
    </ProtectedRoute>
  } 
/>
<Route
  path="/tournament/:tournamentId/fights"
  element={
    <ProtectedRoute>
      <FightPlan />
    </ProtectedRoute>
  }
/>
<Route
  path="/tournament/:tournamentId/shiaijo"
  element={
    <ProtectedRoute>
      <ShiaijoPlan />
    </ProtectedRoute>
  }
/>
<Route 
  path="/tournament/:tournamentId/shinpan" 
  element={
    <ProtectedRoute>
      <Shinpan />
    </ProtectedRoute>
  } 
/>
<Route 
  path="/tournament/:tournamentId/score" 
  element={
    <ProtectedRoute>
      <ScoreInput />
    </ProtectedRoute>
  } 
/>
<Route
  path="/profile"
  element={
    <ProtectedRoute>
      <ProfilePage />
    </ProtectedRoute>
  }
/>
<Route path="/reset-password" element={<ResetPasswordPage />} />
<Route path="/join/:tournamentId" element={<JoinCourt />} />
<Route path="/t/:tournamentId" element={<PublicTournamentRoute />} />

      </Routes>
    </>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
