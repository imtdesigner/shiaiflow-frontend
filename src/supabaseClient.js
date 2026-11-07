import { createClient } from '@supabase/supabase-js';

// VITE_* is the new name; REACT_APP_* still works (envPrefix in vite.config.js)
// so existing .env.local and Netlify variables keep working.
const env = import.meta.env;
const supabaseUrl = env.VITE_SUPABASE_URL ?? env.REACT_APP_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.REACT_APP_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
