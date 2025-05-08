import React, { useState } from 'react';
import './SignupPage.css';
import { supabase } from '../supabaseClient';

const SignupPage = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'person',
    dojo_name: '',
    country: ''
  });

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'

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

    if (formData.password !== formData.confirmPassword) {
        setMessage("Passwords do not match.");
        setMessageType("error");
        return;
      }
      
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      }, {
        emailRedirectTo: null   // <-- disables built-in browser redirects/popups
      });
      
      if (error) {
        setMessage("Signup failed: " + error.message);
        setMessageType("error");
        return;
      }
      
      setMessage("Signup successful! Please check your email to confirm.");
      setMessageType("success");

    alert('Signup successful! Please check your email to confirm your address.');
  };

  return (
    <div className="signup-page">
      <h2>Create Your Account</h2>
      <form onSubmit={handleSubmit}>
        <input type="text" name="name" placeholder="Full Name" required onChange={handleChange} />
        <input type="email" name="email" placeholder="Email" required onChange={handleChange} />
        <input type="password" name="password" placeholder="Password" required onChange={handleChange} />
        <input type="password" name="confirmPassword" placeholder="Confirm Password" required onChange={handleChange} />

        <select name="role" value={formData.role} onChange={handleChange}>
          <option value="person">Individual</option>
          <option value="dojo">Dojo</option>
          <option value="regional">Regional/National Federation</option>
          <option value="continental">Continental Federation</option>
        </select>

        <p className="email-note">
          If registering as a dojo or federation, you must use your official email address. This email cannot be used for personal accounts.
        </p>

        {(formData.role !== 'person') && (
          <input type="text" name="dojo_name" placeholder="Dojo/Federation Name" required onChange={handleChange} />
        )}

        <select name="country" value={formData.country} required onChange={handleChange}>
          <option value="">Select Country</option>
          <option value="Croatia">Croatia</option>
          <option value="Japan">Japan</option>
          <option value="United States">United States</option>
          {/* ... add full country list here as you had before */}
        </select>

        <button type="submit">Sign Up</button>
        {message && (
  <div className={`popup-message ${messageType}`}>
    {message}
  </div>
)}
      </form>
    </div>
  );
};

export default SignupPage;