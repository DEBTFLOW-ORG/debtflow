const jwt              = require('jsonwebtoken');
const { supabase }     = require('../services/supabase');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'No autenticado' });

  try {
    const token   = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Re-fetch del usuario para tener el rol actualizado
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, role, plan')
      .eq('id', payload.sub)
      .single();

    if (error || !user) return res.status(401).json({ error: 'Usuario no encontrado' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ error: 'Acceso solo para administradores' });
  next();
}

module.exports = { requireAuth, requireAdmin };
