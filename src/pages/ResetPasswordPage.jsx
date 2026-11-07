import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ResetPasswordPage = () => {
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const initializeRecoverySession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (isMounted && session) {
        setIsReady(true);
      }
    };

    initializeRecoverySession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (isMounted && (event === 'PASSWORD_RECOVERY' || session)) {
        setIsReady(true);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleReset = async (e) => {
    e.preventDefault();

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setMessage('Reset failed: ' + error.message);
      setMessageType('error');
    } else {
      setMessage('Password updated successfully!');
      setMessageType('success');
      setTimeout(() => {
        window.location.href = '/login'; // or redirect where you want
      }, 1500);
    }
  };

  return (
    <div className="signup-page">
      <h2>Reset Password</h2>

      {message && <div className={`popup-message ${messageType}`}>{message}</div>}

      <form onSubmit={handleReset}>
        <input
          type="password"
          placeholder="New Password"
          required
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <button type="submit" disabled={!isReady}>Update Password</button>
      </form>

      {!isReady && (
        <p className="email-note">Open this page using the link from your password reset email.</p>
      )}
    </div>
  );
};

export default ResetPasswordPage;
