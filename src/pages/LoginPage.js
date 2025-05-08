import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import './SignupPage.css'; // You can reuse SignupPage.css if you want

const LoginPage = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const handleChange = (e) => {
    setFormData({ 
      ...formData, 
      [e.target.name]: e.target.value 
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setMessageType('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password,
    });

    if (error) {
      setMessage('Login failed: ' + error.message);
      setMessageType('error');
      return;
    }

    setMessage('Login successful! Redirecting...');
    setMessageType('success');

    // (Optional) Redirect after login
    setTimeout(() => {
      window.location.href = '/profile'; // or wherever you want to send them
    }, 1500);
  };

  return (
    <div className="signup-page">
      <h2>Login</h2>

      {message && (
        <div className={`popup-message ${messageType}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <input 
          type="email" 
          name="email" 
          placeholder="Email" 
          required 
          onChange={handleChange} 
        />
        <input 
          type="password" 
          name="password" 
          placeholder="Password" 
          required 
          onChange={handleChange} 
        />
        <button type="submit">Log In</button>
      </form>
    </div>
  );
};

export default LoginPage;