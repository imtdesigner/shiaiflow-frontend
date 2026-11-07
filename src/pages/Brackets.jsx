import React from 'react';
import { useNavigate } from 'react-router-dom';
import backIcon from '../assets/icons/back_to_dashboard.png';
import './Brackets.css';

function EditBrackets() {
  const navigate = useNavigate();

  return (
    <div className="edit-brackets-page">
      <img
        src={backIcon}
        alt="Back to Dashboard"
        className="back-to-dashboard-icon"
        onClick={() => navigate('/dashboard')}
        title="Back to Dashboard"
      />

      <h2>Edit Brackets Page</h2>
      {/* More UI here */}
    </div>
  );
}

export default EditBrackets;