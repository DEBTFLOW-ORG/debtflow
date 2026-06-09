const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Faltan las variables de entorno de Supabase en el .env");
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };