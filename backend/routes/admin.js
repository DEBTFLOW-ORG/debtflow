const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { supabase } = require('../db/database');

router.use(requireAuth, requireAdmin);

router.get('/users', async (req, res, next) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, role, plan, twilio_phone_number, vapi_assistant_id, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(users);
  } catch (e) { next(e); }
});

router.get('/stats', async (req, res, next) => {
  try {
    // Para contar rápido en Supabase usamos 'exact' en head mode
    const { count: usersCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { count: deudoresCount } = await supabase.from('deudores').select('*', { count: 'exact', head: true });
    const { count: llamadasCount } = await supabase.from('llamadas').select('*', { count: 'exact', head: true });

    res.json({
      totalUsuarios: usersCount || 0,
      totalDeudores: deudoresCount || 0,
      totalLlamadas: llamadasCount || 0,
    });
  } catch (e) { next(e); }
});

router.get('/llamadas', async (req, res, next) => {
  try {
    const { data: rows, error } = await supabase
      .from('llamadas')
      .select(`
        id, resultado, sentimiento, duracion_seg, nota, iniciada_at,
        deudores (nombre, tel),
        users (email)
      `)
      .order('iniciada_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    const formatted = rows.map(r => ({
      id: r.id,
      resultado: r.resultado,
      sentimiento: r.sentimiento,
      duracion_seg: r.duracion_seg,
      nota: r.nota,
      iniciada_at: r.iniciada_at,
      deudores: {
        nombre: r.deudores?.nombre,
        tel: r.deudores?.tel
      },
      users: {
        email: r.users?.email
      }
    }));
    res.json(formatted);
  } catch (e) { next(e); }
});

router.put('/users/:id/plan', async (req, res, next) => {
  try {
    const { plan } = req.body;
    const valid = ['trial','silver','gold','enterprise'];
    if (!valid.includes(plan)) return res.status(400).json({ error: 'Plan inválido' });

    const { data: updated, error } = await supabase
      .from('users')
      .update({ plan })
      .eq('id', req.params.id)
      .select('id, email, role, plan, twilio_phone_number, vapi_assistant_id, created_at')
      .single();

    if (error) throw error;
    res.json(updated);
  } catch (e) { next(e); }
});

router.put('/users/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['user','admin'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });

    const { data: updated, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', req.params.id)
      .select('id, email, role, plan, twilio_phone_number, vapi_assistant_id, created_at')
      .single();

    if (error) throw error;
    res.json(updated);
  } catch (e) { next(e); }
});

module.exports = router;