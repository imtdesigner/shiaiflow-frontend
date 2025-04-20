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

function Login() {
  return <h2 className="page">Login Page</h2>;
}

function Signup() {
  return <h2 className="page">Sign Up Page</h2>;
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
  return (
    <div className="dashboard">
      <div className="top-bar">
        <div className="profile-wrapper">
          <img src={profileIcon} alt="My Profile" className="top-profile-icon" />
        </div>
      </div>

      <div className="dashboard-main">
      <div className="create-container special-font">
        <div className="icon-label">
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
        <li onClick={() => { setSelectedTournament('Rijeka Cup 2025'); setShowDropdown(false); }}>Rijeka Cup 2025</li>
        <li onClick={() => { setSelectedTournament('ShiaiFlow Test Event'); setShowDropdown(false); }}>ShiaiFlow Test Event</li>
        <li onClick={() => { setSelectedTournament('Spring Open 2025'); setShowDropdown(false); }}>Spring Open 2025</li>
      </ul>
      )}
      </div>

        <div className="icon-row">
        <div className="icon-label">
            <img src={editTournamentIcon} alt="Edit tournament" />
            <p>Edit tournament</p>
          </div>
          <div className="icon-label">
            <img src={bracketIcon} alt="Bracket Editor" />
            <p>Edit brackets</p>
          </div>
          <div className="icon-label">  
            <img src={drawingsIcon} alt="Drawings" />
            <p>Drawings</p>
          </div>
          <div className="icon-label">
            <img src={registrationIcon} alt="Registration" />
            <p>Registration</p>
          </div>
          <div className="icon-label">
            <img src={manageIcon} alt="Manage Tournament" />
            <p>Manage (Start) tournament</p>
          </div>
        </div>

        <div className="icon-row">
          <div className="icon-label">
            <img src={shinpanIcon} alt="Shinpan Allocation" />
            <p>Allocate shinpans</p>
          </div>
          <div className="icon-label">
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
    <Link to="/dashboard">Log In</Link>
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
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/attend" element={<Attend />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Router>
    
  );
}

export default App;