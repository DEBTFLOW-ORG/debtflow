const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
// Usamos estrictamente la clave de administrador para bypass de RLS
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️ Faltan las variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el .env");
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };