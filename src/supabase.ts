import { createClient } from '@supabase/supabase-js';
import type { Database } from './datenbank.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL oder VITE_SUPABASE_KEY fehlt. Siehe .env.beispiel.');
}

export const supabase = createClient<Database>(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
