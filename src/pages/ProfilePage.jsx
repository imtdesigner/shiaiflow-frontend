import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { countryOptions } from '../lib/countries';
import { changeAccountKind } from '../lib/api';
import './SignupPage.css';

const ORG = ['dojo', 'regional', 'continental'];
const KIND_LABEL = {
  person: 'Individual',
  dojo: 'Dojo (club)',
  regional: 'National / regional federation',
  continental: 'Continental federation',
};

/** Verification status of the account, in words. */
function accountStatus(p) {
  if (p.verified_at) return { cls: 'success', text: `Verified by the app admins on ${new Date(p.verified_at).toLocaleDateString()}.` };
  if (ORG.includes(p.role)) {
    return { cls: 'info', text: 'Waiting for verification by the app admins. Until then you can set up tournaments, but not publish the signup or start them.' };
  }
  if (p.needs_review) {
    return { cls: 'info', text: 'Former dojo / federation account, now individual: the app admins approve it again before you can publish the signup or start a tournament.' };
  }
  return { cls: 'info', text: 'Individual account — no verification needed. Your tournaments show as personal tournaments.' };
}

/**
 * Profile: account data, verification status and changing the account kind.
 * Kind changes go through the change_account_kind RPC — individual → dojo /
 * federation needs the same verification as a new organization; dojo /
 * federation → individual needs the admins' approval again, and its
 * tournaments then show as personal.
 */
const ProfilePage = () => {
  const [profile, setProfile] = useState(null);
  const [kindForm, setKindForm] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);
  const countries = useMemo(() => countryOptions(), []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    if (data) setProfile(data);
  };
  useEffect(() => { load(); }, []);

  if (!profile) return <div className="signup-page"><h2>Your profile</h2><p>Loading…</p></div>;

  const org = ORG.includes(profile.role);
  const lockedIdentity = org && !!profile.verified_at;
  const status = accountStatus(profile);
  const set = (k) => (e) => setProfile({ ...profile, [k]: e.target.value });
  const setK = (k) => (e) => setKindForm({ ...kindForm, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg({ type: '', text: '' });
    const fields = {
      name: profile.name, country: profile.country, city: profile.city,
      dojo_name: profile.dojo_name,
      avatar_url: profile.avatar_url, logo_url: profile.logo_url,
      ...(org ? { website: profile.website, contact_name: profile.contact_name, contact_email: profile.contact_email } : {}),
    };
    if (lockedIdentity) { delete fields.name; delete fields.website; }
    const { error } = await supabase.from('users').update(fields).eq('id', profile.id);
    setBusy(false);
    setMsg(error ? { type: 'error', text: `Saving failed: ${error.message}` } : { type: 'success', text: 'Profile saved.' });
  };

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const path = `${profile.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file);
    if (error) { setMsg({ type: 'error', text: `Upload failed: ${error.message}` }); return; }
    const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    setProfile({ ...profile, [org ? 'logo_url' : 'avatar_url']: url });
  };

  const openKindForm = () => setKindForm({
    role: org ? 'person' : 'dojo',
    name: '', website: '', contact_name: org ? '' : (profile.name || ''), contact_email: '',
  });

  const submitKind = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg({ type: '', text: '' });
    try {
      await changeAccountKind({
        role: kindForm.role, name: kindForm.name, website: kindForm.website,
        contactName: kindForm.contact_name, contactEmail: kindForm.contact_email,
      });
      setKindForm(null);
      await load();
      setMsg({ type: 'success', text: `Account changed to ${KIND_LABEL[kindForm.role]}.` });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  };

  const toOrg = kindForm && ORG.includes(kindForm.role);

  return (
    <div className="signup-page">
      <h2>Your profile</h2>
      <p><strong>{KIND_LABEL[profile.role] ?? profile.role}</strong></p>
      <div className={`popup-message ${status.cls}`}>{status.text}</div>
      {msg.text && <div className={`popup-message ${msg.type}`}>{msg.text}</div>}

      <form onSubmit={save}>
        <input type="text" placeholder={org ? 'Organization name' : 'Full name'} required value={profile.name ?? ''} onChange={set('name')} disabled={lockedIdentity} />
        <input type="email" value={profile.email ?? ''} placeholder="Email" disabled />
        <input type="text" placeholder="City" required={org} value={profile.city ?? ''} onChange={set('city')} />
        <select required value={profile.country ?? ''} onChange={set('country')}>
          <option value="">Country</option>
          {profile.country && !countries.some((c) => c.value === profile.country) && <option value={profile.country}>{profile.country}</option>}
          {countries.map((c) => <option key={c.code} value={c.value}>{c.label}</option>)}
        </select>
        {org ? (
          <>
            <input type="url" placeholder="Website (https://…)" required value={profile.website ?? ''} onChange={set('website')} disabled={lockedIdentity} />
            <input type="text" placeholder="Responsible person (name)" required value={profile.contact_name ?? ''} onChange={set('contact_name')} />
            <input type="email" placeholder="Responsible person email (optional)" value={profile.contact_email ?? ''} onChange={set('contact_email')} />
            {lockedIdentity && <p className="email-note">The name and website of a verified organization are changed by the app admins.</p>}
            <label>Logo:</label>
          </>
        ) : (
          <>
            <input type="text" placeholder="Your dojo (optional)" value={profile.dojo_name ?? ''} onChange={set('dojo_name')} />
            <label>Avatar:</label>
          </>
        )}
        <input type="file" onChange={upload} accept="image/*" />
        <button type="submit" disabled={busy}>Save profile</button>
      </form>

      <h3>Account kind</h3>
      {!kindForm ? (
        <>
          <p className="email-note">
            {org
              ? 'You can change this account to an individual one. Its tournaments then show as personal tournaments, without the organization name, and the app admins approve the account again before you can publish a signup or start a tournament.'
              : 'You can change this account to a dojo or federation. It is then verified by the app admins like a new organization — until then you can set up tournaments, but not publish the signup or start them.'}
          </p>
          <button type="button" disabled={busy} onClick={openKindForm}>Change account kind…</button>
        </>
      ) : (
        <form onSubmit={submitKind}>
          <select value={kindForm.role} onChange={setK('role')}>
            {Object.entries(KIND_LABEL).filter(([k]) => k !== profile.role).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input type="text" required placeholder={toOrg ? (kindForm.role === 'dojo' ? 'Dojo name' : 'Federation name') : 'Your full name'} value={kindForm.name} onChange={setK('name')} />
          {toOrg && (
            <>
              <input type="url" required placeholder="Website (https://…)" value={kindForm.website} onChange={setK('website')} />
              <input type="text" required placeholder="Responsible person (name)" value={kindForm.contact_name} onChange={setK('contact_name')} />
              <input type="email" placeholder="Responsible person email (optional)" value={kindForm.contact_email} onChange={setK('contact_email')} />
              <p className="email-note">The login email stays {profile.email}; an organization should log in with its official email.</p>
            </>
          )}
          <p className="email-note">
            {toOrg
              ? 'The verification starts again: publishing the signup and starting tournaments wait for the app admins.'
              : org
                ? 'Your tournaments will show as personal tournaments. Publishing the signup and starting tournaments wait for the app admins’ approval.'
                : 'The verification starts again.'}
          </p>
          <button type="submit" disabled={busy}>Change to {KIND_LABEL[kindForm.role]}</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => setKindForm(null)}>Cancel</button>
        </form>
      )}
    </div>
  );
};

export default ProfilePage;
