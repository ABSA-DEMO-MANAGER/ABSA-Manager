import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

if (!url || !key) {
  console.error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_KEY. ' +
    'Copia .env.example a .env y llena los valores de tu proyecto Supabase.'
  );
}

export const supabase = createClient(url ?? '', key ?? '', {
  auth: { persistSession: true, autoRefreshToken: true },
});
