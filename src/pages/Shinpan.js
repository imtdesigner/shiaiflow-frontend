import React from 'react';
import { useNavigate } from 'react-router-dom';
import backIcon from '../assets/icons/back_to_dashboard.png';
import './Shinpan.css';

function Shinpan_Allocation() {
  const navigate = useNavigate();

  return (
    <div className="Shinpan-page">
      <img
        src={backIcon}
        alt="Back to Dashboard"
        className="back-to-dashboard-icon"
        onClick={() => navigate('/dashboard')}
        title="Back to Dashboard"
      />

      <h2>Shinpan Allocation Page</h2>
      {/* More UI here */}
    </div>
  );
}

export default Shinpan_Allocation;