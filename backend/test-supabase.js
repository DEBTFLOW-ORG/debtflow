const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testConnection() {
  try {
    // Intentamos hacer una consulta simple a una tabla que sepas que existe
    const { error } = await supabase.from('users').select('count', { count: 'exact', head: true });
    
    if (error) {
      console.error("❌ Error de conexión:", error.message);
    } else {
      console.log("✅ ¡Conexión exitosa! El proyecto está activo.");
    }
  } catch (err) {
    console.error("❌ Error inesperado:", err);
  }
}

testConnection();
