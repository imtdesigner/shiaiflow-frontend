import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './SignupPage.css'; // Reuse the nice form style

const ProfilePage = () => {
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    role: '',
    country: '',
    dojo_name: '',
    dojo_city: '',
    federation_name: '',
    federation_type: '',
    avatar_url: '',
    logo_url: ''
  });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      console.log('Auth User:', user, 'Auth Error:', authError);
  
      if (user) {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();
  
        console.log('User Table Data:', data, 'User Table Error:', error);
  
        if (data) {
            const safeData = {
              ...data,
              name: data.name || '',
              email: data.email || '',
              role: data.role || '',
              country: data.country || '',
              dojo_name: data.dojo_name || '',
              dojo_city: data.dojo_city || '',
              federation_name: data.federation_name || '',
              federation_type: data.federation_type || '',
              avatar_url: data.avatar_url || '',
              logo_url: data.logo_url || ''
            };
            setProfile(safeData);
          }
      }
    };
  
    fetchProfile();
  }, []);

  const handleChange = (e) => {
    setProfile({
      ...profile,
      [e.target.name]: e.target.value
    });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const filePath = `${profile.id}/${Date.now()}-${file.name}`;

    const { data, error } = await supabase
      .storage
      .from('avatars') // Make sure you created a 'avatars' bucket!
      .upload(filePath, file);

    if (error) {
      setMessage("File upload failed: " + error.message);
      setMessageType("error");
    } else {
      const publicURL = supabase.storage.from('avatars').getPublicUrl(filePath).data.publicUrl;
      if (profile.role === 'person') {
        setProfile({ ...profile, avatar_url: publicURL });
      } else {
        setProfile({ ...profile, logo_url: publicURL });
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setMessageType('');

    const { error } = await supabase
      .from('users')
      .update(profile)
      .eq('id', profile.id);

    if (error) {
      setMessage('Profile update failed: ' + error.message);
      setMessageType('error');
      return;
    }

    setMessage('Profile updated successfully!');
    setMessageType('success');

    setTimeout(() => {
      navigate('/dashboard');
    }, 1500);
  };

  return (
    <div className="signup-page">
      <h2>Complete Your Profile</h2>

      {message && (
        <div className={`popup-message ${messageType}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <input type="text" name="name" value={profile.name} placeholder="Full Name" onChange={handleChange} required />
        <input type="email" name="email" value={profile.email} placeholder="Email" disabled />
        
        <select name="role" value={profile.role} onChange={handleChange} disabled>
          <option value="person">Individual</option>
          <option value="dojo">Dojo</option>
          <option value="regional">Regional/National Federation</option>
          <option value="continental">Continental Federation</option>
        </select>

        <input type="text" name="country" value={profile.country} placeholder="Country" onChange={handleChange} required />

        {profile.role === 'person' && (
          <>
            <input type="text" name="dojo_name" value={profile.dojo_name} placeholder="Dojo Name (optional)" onChange={handleChange} />
            <input type="text" name="dojo_city" value={profile.dojo_city} placeholder="Dojo City (optional)" onChange={handleChange} />
            <label>Upload Avatar:</label>
            <input type="file" onChange={handleFileChange} accept="image/*" />
          </>
        )}

        {(profile.role === 'dojo' || profile.role === 'regional' || profile.role === 'continental') && (
          <>
            <input type="text" name="federation_name" value={profile.federation_name} placeholder="Federation/Dojo Name" onChange={handleChange} required />
            <input type="text" name="federation_type" value={profile.federation_type} placeholder="Federation Type (optional)" onChange={handleChange} />
            <label>Upload Logo:</label>
            <input type="file" onChange={handleFileChange} accept="image/*" />

            <p className="email-note">
              If not filled by correct data, profile type will be changed to Individual.
            </p>
          </>
        )}

        <button type="submit">Save Profile</button>
      </form>
    </div>
  );
};

export default ProfilePage;