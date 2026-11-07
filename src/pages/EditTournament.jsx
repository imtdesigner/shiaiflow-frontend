import React from 'react';
import { useNavigate } from 'react-router-dom';
import backIcon from '../assets/icons/back_to_dashboard.png';
import './EditTournament.css';

function EditTournament() {
  const navigate = useNavigate();

  return (
    <div className="edit-tournament-page">
      <img
        src={backIcon}
        alt="Back to Dashboard"
        className="back-to-dashboard-icon"
        onClick={() => navigate('/dashboard')}
        title="Back to Dashboard"
      />

      <h2>Edit Tournament Page</h2>
      {/* More UI here */}
    </div>
  );
}

export default EditTournament;