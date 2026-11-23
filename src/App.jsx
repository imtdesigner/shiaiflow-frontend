import './App.css';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
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
import SetupWizard from './pages/SetupWizard';
import Brackets from './pages/Brackets';
import Drawings from './pages/Drawings';
import Registration from './pages/Registration';
import Manage from './pages/Manage';
import Shinpan from './pages/Shinpan';
import ScoreInput from './pages/ScoreInput';
import ShiaijoPlan from './pages/ShiaijoPlan';
import FightPlan from './pages/FightPlan';
import Results from './pages/Results';
import PaperBackup from './pages/PaperBackup';
import JoinCourt from './pages/JoinCourt';
import SignupPage from './pages/SignupPage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './ProtectRoute'; // import it
import ProfilePage from './pages/ProfilePage'; // at top with other imports
import ResetPasswordPage from './pages/ResetPasswordPage';
import { supabase } from './supabaseClient';
import { flushPendingLogo } from './lib/pendingLogo';
import { AccountBanner } from './components/AccountStatus';
import { accountWaiting, amIAdmin, listMyTournaments, listOrganizationAccounts, listPublicTournaments } from './lib/api';
import AdminAccounts from './pages/AdminAccounts';
import { PublicTournamentRoute } from './pages/PublicTournament';
import CourtDisplay from './pages/CourtDisplay';
import GuidePanel, { GuideProvider, PhaseLabel, useGuide, useTournamentPhase } from './components/GuidePanel';
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

function Dashboard({ pinOnly = false }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('sf-selected-tournament')) ?? null; } catch { return null; }
  });
  const [pendingPath, setPendingPath] = useState('');
  const navigate = useNavigate();
  const { setPicked } = useGuide();
  useEffect(() => { setPicked(selectedTournament?.id ?? null); }, [selectedTournament, setPicked]);
  const { phase } = useTournamentPhase(selectedTournament?.id ?? null);

  useEffect(() => {
    listMyTournaments().then((list) => {
      setTournaments(list);
      // a PIN-only device works on one tournament: pick it right away
      if (pinOnly && list.length === 1) {
        const only = { id: list[0].id, name: list[0].name };
        setSelectedTournament(only);
        try { sessionStorage.setItem('sf-selected-tournament', JSON.stringify(only)); } catch { /* ignore */ }
      }
    }).catch(() => setTournaments([]));
  }, [pinOnly]);

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
      <AccountBanner />

      <div className="dashboard-main">
        {!pinOnly && (
          <div className="create-container special-font">
            <div className="icon-label" onClick={() => handleNavigation('/create-tournament')}>
              <img src={createIcon} alt="Create Tournament" />
              <p>Create Tournament</p>
            </div>
          </div>
        )}

        <div className="tournament-dropdown">
          <img
            src={tournamentIcon}
            alt="Select Tournament"
            className="dropdown-icon"
            onClick={() => setShowDropdown(!showDropdown)}
          />
          {selectedTournament && <p className="selected-tournament">{selectedTournament.name} <PhaseLabel phase={phase} /></p>}

          {showDropdown && (
            <ul className="dropdown-list">
              {tournaments.length === 0 && (
                <li onClick={() => !pinOnly && navigate('/create-tournament')}>{pinOnly ? 'No tournament yet — join one with its PIN' : 'No tournaments yet — create your first one'}</li>
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
  const location = useLocation();
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { if (session) amIAdmin().then(setIsAdmin); else setIsAdmin(false); }, [session]);
  // accounts waiting for the admins (new dojo / federation, or one turned individual)
  const [pendingAccounts, setPendingAccounts] = useState(0);
  useEffect(() => {
    if (!isAdmin) { setPendingAccounts(0); return undefined; }
    const load = () => listOrganizationAccounts().then((a) => setPendingAccounts(a.filter(accountWaiting).length)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [isAdmin]);
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
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (event === 'SIGNED_IN') flushPendingLogo(currentSession);
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

  // Table devices (owner, 2026-11-20): who joined a tournament through the Table door
  // gets only its scoretables (and Manage = pick the shiaijo); a device that only
  // has table roles (PIN through the Table door) gets no dashboard, profile or guide.
  const [memberships, setMemberships] = useState(null); // [{ tournament_id, role }]
  useEffect(() => {
    if (!session) { setMemberships([]); return; }
    supabase.from('tournament_members').select('tournament_id, role').eq('user_id', session.user.id)
      .then(({ data }) => setMemberships(data ?? []));
  }, [session, location.pathname]);
  const scorerIn = new Set((memberships ?? []).filter((m) => m.role === 'scorer').map((m) => m.tournament_id));
  // a device whose only roles are tables (PIN through the Table door) — with or without an account —
  // gets just the scoretable; owning or editing any tournament gives the full app back
  const tableOnly = scorerIn.size > 0 && (memberships ?? []).every((m) => m.role === 'scorer');
  // signed in only with a PIN (no account): works on its tournament only — no create, profile or admin
  const pinOnly = !!session?.user?.is_anonymous;
  const tableHome = tableOnly ? `/tournament/${[...scorerIn][0]}/manage` : null;
  const routeTournament = location.pathname.match(/^\/tournament\/([^/]+)\/([a-z-]+)/);
  const tableRedirect = (() => {
    if (routeTournament && scorerIn.has(routeTournament[1]) && !['score', 'manage'].includes(routeTournament[2])) {
      return `/tournament/${routeTournament[1]}/manage`;
    }
    if (tableOnly && /^\/(dashboard|profile|create-tournament|admin)/.test(location.pathname)) return tableHome;
    if (pinOnly && /^\/(profile|create-tournament|admin)/.test(location.pathname)) return '/dashboard';
    return null;
  })();
  // tournament pages wait for the roles, so a table never sees a page it may not use
  const waitRoles = !!session && memberships === null && !!routeTournament;

  // court display screens are full screen, without the app's navigation
  const display = /\/court\/\d+\/?$/.test(location.pathname);
  // setup guide on the organizer's pages (not the scoretable)
  const guided = !!session && !tableOnly && (location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/create-tournament')
    || (/^\/tournament\/[^/]+\/(edit|brackets|drawings|registration|manage|fights|shiaijo)/.test(location.pathname)));

  return (
    <>
  {!display && <nav className="navbar">
  <div className="nav-logo">
    <Link to={session ? '/dashboard' : '/'} className="nav-logo-text">
      Shiai<span className="flow">Flow</span>
    </Link>
  </div>
  <div className="nav-links">
    {!isAuthLoading && (session ? (
      <>
        {tableOnly ? <Link to={tableHome}>Scoretable</Link> : (
          <>
            <Link to="/dashboard">Dashboard</Link>
            {!pinOnly && <Link to="/profile">Profile</Link>}
          </>
        )}
        {isAdmin && (
          <Link to="/admin/accounts" title={pendingAccounts ? `${pendingAccounts} account(s) waiting for verification` : 'Admin'}>
            Admin{pendingAccounts > 0 && <span className="nav-count">{pendingAccounts}</span>}
          </Link>
        )}
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
</nav>}
      {guided && <GuidePanel />}
      {tableRedirect ? <Navigate to={tableRedirect} replace /> : waitRoles ? <div className="page">Loading...</div> : (
      <Routes>
        <Route path="/" element={publicOnly(<Home />)} />
        <Route path="/login" element={publicOnly(<LoginPage />)} />
        <Route path="/signup" element={publicOnly(<SignupPage />)} />
        
        {/* Wrap dashboard in protected route */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard pinOnly={pinOnly} />
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
  path="/tournament/:tournamentId/setup" 
  element={
    <ProtectedRoute>
      <SetupWizard />
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
<Route path="/tournament/:tournamentId/results" element={<ProtectedRoute><Results /></ProtectedRoute>} />
<Route path="/tournament/:tournamentId/paper" element={<ProtectedRoute><PaperBackup /></ProtectedRoute>} />
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
<Route path="/t/:tournamentId/court/:court" element={<CourtDisplay />} />
<Route path="/:tournamentId/court/:court" element={<CourtDisplay />} />
<Route path="/t/:tournamentId" element={<PublicTournamentRoute />} />
<Route path="/:tournamentId" element={<PublicTournamentRoute />} />

      </Routes>
      )}
    </>
  );
}

function App() {
  return (
    <Router>
      <GuideProvider>
        <AppContent />
      </GuideProvider>
    </Router>
  );
}

export default App;
