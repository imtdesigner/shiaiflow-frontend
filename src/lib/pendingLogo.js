// Club / federation logo chosen at signup (owner, 2026-11-21): the account
// cannot upload before the email is confirmed (no session yet), so the logo
// is shrunk, kept on this device and uploaded at the first login here.
import { supabase } from '../supabaseClient';

const KEY = (email) => `sf-pending-logo-${email.trim().toLowerCase()}`;

/** Shrink an image file to at most `max` px (PNG data URL); SVG kept as is. */
export function shrinkImage(file, max = 400) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Cannot read the image.'));
    reader.onload = () => {
      if (file.type === 'image/svg+xml') { resolve(reader.result); return; }
      const img = new Image();
      img.onerror = () => reject(new Error('Cannot read the image.'));
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function savePendingLogo(email, dataUrl) {
  try { localStorage.setItem(KEY(email), dataUrl); } catch { /* full or private mode: add it in Profile */ }
}

/** After a login: upload a logo kept from the signup on this device (once, only if the account has none). */
export async function flushPendingLogo(session) {
  const email = session?.user?.email;
  if (!email) return;
  let dataUrl = null;
  try { dataUrl = localStorage.getItem(KEY(email)); } catch { return; }
  if (!dataUrl) return;
  try {
    const uid = session.user.id;
    const { data: me } = await supabase.from('users').select('logo_url').eq('id', uid).maybeSingle();
    if (!me) return; // profile row not there yet — try at the next login
    if (!me.logo_url) {
      const blob = await (await fetch(dataUrl)).blob();
      const ext = blob.type === 'image/svg+xml' ? 'svg' : 'png';
      const path = `${uid}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: blob.type });
      if (error) return;
      const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      await supabase.from('users').update({ logo_url: url }).eq('id', uid);
    }
    localStorage.removeItem(KEY(email));
  } catch { /* try again at the next login */ }
}
