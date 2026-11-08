import { useMemo, useState } from 'react';
import './SignupPage.css';
import { supabase } from '../supabaseClient';
import { countryOptions } from '../lib/countries';

const KINDS = [
  { value: 'person', label: 'Individual' },
  { value: 'dojo', label: 'Dojo (club)' },
  { value: 'federation', label: 'Federation' },
];

/**
 * Create an account: individual (no verification), dojo or federation
 * (verified by the app admins before they can publish a signup or start a
 * tournament). Organizations log in with their official email.
 */
const SignupPage = () => {
  const [kind, setKind] = useState('person');
  const [fedLevel, setFedLevel] = useState('regional');
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '', city: '', country: '',
    website: '', contact_name: '', contact_email: '',
  });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const countries = useMemo(() => countryOptions(), []);
  const org = kind !== 'person';
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); setMessageType('');
    if (form.password !== form.confirmPassword) {
      setMessage('Passwords do not match.'); setMessageType('error'); return;
    }
    const role = kind === 'federation' ? fedLevel : kind;
    const { error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: {
          role,
          name: form.name.trim(),
          city: form.city.trim(),
          country: form.country,
          ...(org ? {
            website: form.website.trim(),
            contact_name: form.contact_name.trim(),
            contact_email: form.contact_email.trim(),
          } : {}),
        },
      },
    });
    if (error) { setMessage(`Signup failed: ${error.message}`); setMessageType('error'); return; }
    setMessage(org
      ? 'Account created — please confirm your email. The app admins will verify your organization; until then you can set up tournaments, but not publish the signup or start them.'
      : 'Account created — please check your email to confirm it.');
    setMessageType('success');
  };

  return (
    <div className="signup-page">
      <h2>Create your account</h2>
      <form onSubmit={handleSubmit}>
        <div className="signup-kinds">
          {KINDS.map((k) => (
            <label key={k.value} className={`signup-kind ${kind === k.value ? 'active' : ''}`}>
              <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} />
              {k.label}
            </label>
          ))}
        </div>
        {kind === 'federation' && (
          <select value={fedLevel} onChange={(e) => setFedLevel(e.target.value)}>
            <option value="regional">National / regional federation</option>
            <option value="continental">Continental federation</option>
          </select>
        )}

        <input type="text" placeholder={org ? (kind === 'dojo' ? 'Dojo name' : 'Federation name') : 'Full name'} required value={form.name} onChange={set('name')} />
        <input type="email" placeholder={org ? 'Official email of the organization (login)' : 'Email'} required value={form.email} onChange={set('email')} />
        <input type="password" placeholder="Password" required value={form.password} onChange={set('password')} />
        <input type="password" placeholder="Confirm password" required value={form.confirmPassword} onChange={set('confirmPassword')} />
        <input type="text" placeholder="City" required={org} value={form.city} onChange={set('city')} />
        <select required value={form.country} onChange={set('country')}>
          <option value="">Country</option>
          {countries.map((c) => <option key={c.code} value={c.value}>{c.label}</option>)}
        </select>

        {org && (
          <>
            <input type="url" placeholder="Website (https://…)" required value={form.website} onChange={set('website')} />
            <input type="text" placeholder="Responsible person (name)" required value={form.contact_name} onChange={set('contact_name')} />
            <input type="email" placeholder="Responsible person email (optional, if different)" value={form.contact_email} onChange={set('contact_email')} />
            <p className="email-note">
              The app admins check that the organization is real and that the email and data match its website.
              Until the account is verified you can set up tournaments, but not publish the signup or start them.
            </p>
          </>
        )}

        <button type="submit">Sign up</button>
        {message && <div className={`popup-message ${messageType}`}>{message}</div>}
      </form>
    </div>
  );
};

export default SignupPage;
