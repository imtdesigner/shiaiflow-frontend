import './App.css';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
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
import profileIcon from './assets/icons/my_profile.png';
import tournamentIcon from './assets/icons/select_tournament.png';
import React, { useState } from 'react';
import packageJson from '../package.json';
import CreateTournament from './pages/CreateTournament';
import EditTournament from './pages/EditTournament';
import Brackets from './pages/Brackets';
import Drawings from './pages/Drawings';
import Registration from './pages/Registration';
import Manage from './pages/Manage';
import Shinpan from './pages/Shinpan';
import ScoreInput from './pages/ScoreInput';
import { useNavigate } from 'react-router-dom';
import SignupPage from './pages/SignupPage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './ProtectRoute'; // import it
import ProfilePage from './pages/ProfilePage'; // at top with other imports



function Home () {
return (
  <>
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
            placeholder="By name, city, country or dojo"
          />
        </div>
        {/* <div className="live-results">
          <h2>Watch Live Results</h2>
          <ul className="live-list">
            <li><a href="#">Rijeka Spring Cup 2025</a></li>
          </ul>
        </div> */}
      </div>
      <h1>WORKING HARD TO BRING YOU TAIKAI APP</h1>
      <p className="powered">Powered by ChatGPT</p>
      <p className="app-version">Version {packageJson.version}</p>
    </div>
  </>
);
}

function Explore() {
  return <h2 className="page">Explore Tournaments</h2>;
}

function Attend() {
  return <h2 className="page">Attend a Tournament</h2>;
}


function Dashboard() {
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState('');
  const [pendingPath, setPendingPath] = useState('');
  const navigate = useNavigate();

  const handleNavigation = (path) => {
    if (path === '/create-tournament') {
      navigate(path);
    } else if (selectedTournament) {
      navigate(`/tournament/${selectedTournament}/${path}`);
    } else {
      setPendingPath(path); // store where user wanted to go
      setShowDropdown(true); // open selector
    }
  };

  const handleTournamentSelect = (tournament) => {
    setSelectedTournament(tournament);
    setShowDropdown(false);

    // If user had clicked an icon before, go to that path
    if (pendingPath) {
      navigate(`/tournament/${tournament}/${pendingPath}`);
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
          {selectedTournament && <p className="selected-tournament">{selectedTournament}</p>}

          {showDropdown && (
            <ul className="dropdown-list">
              <li onClick={() => handleTournamentSelect('RijekaCup2025')}>Rijeka Cup 2025</li>
              <li onClick={() => handleTournamentSelect('ShiaiFlowTest')}>ShiaiFlow Test Event</li>
              <li onClick={() => handleTournamentSelect('SpringOpen2025')}>Spring Open 2025</li>
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

function App() {
  return (
    <Router>
  <nav className="navbar">
  <div className="nav-logo">
    <Link to="/" className="nav-logo-text">
      Shiai<span className="flow">Flow</span>
    </Link>
  </div>
  <div className="nav-links">
    <Link to="/login">Log In</Link>
    <Link to="/signup">Sign Up</Link>
    <Link to="/explore">Explore</Link>
    <Link to="/attend">Attend a Tournament</Link>
    <div className="nav-icon-wrapper">
      <a href="mailto:IMTdesigner@shiaiflow.com">
      <img src={contactIcon} alt="Contact Developer" className="contact-icon" />
    </a>
  </div>
  </div>
</nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        
        {/* Wrap dashboard in protected route */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />

        <Route path="/explore" element={<Explore />} />
        <Route path="/attend" element={<Attend />} />
        
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
<Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </Router>
    
  );
}

export default App;