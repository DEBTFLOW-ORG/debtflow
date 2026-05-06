const router                     = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { supabase }               = require('../services/supabase');

router.use(requireAuth, requireAdmin);

// GET /api/admin/users — todos los usuarios
router.get('/users', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, role, plan, twilio_phone_number, vapi_assistant_id, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

// GET /api/admin/stats — métricas globales
router.get('/stats', async (req, res, next) => {
  try {
    const [users, deudores, llamadas] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('deudores').select('id', { count: 'exact', head: true }),
      supabase.from('llamadas').select('id', { count: 'exact', head: true }),
    ]);
    res.json({
      totalUsuarios:  users.count   || 0,
      totalDeudores:  deudores.count || 0,
      totalLlamadas:  llamadas.count || 0,
    });
  } catch (e) { next(e); }
});

// GET /api/admin/llamadas — todas las llamadas
router.get('/llamadas', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('llamadas')
      .select(`id, resultado, sentimiento, duracion_seg, nota, iniciada_at,
               deudores(nombre, tel), users(email)`)
      .order('iniciada_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

// PUT /api/admin/users/:id/plan — cambiar plan de un usuario
router.put('/users/:id/plan', async (req, res, next) => {
  try {
    const { plan } = req.body;
    const valid = ['trial','silver','gold','enterprise'];
    if (!valid.includes(plan))
      return res.status(400).json({ error: 'Plan inválido' });

    const { data, error } = await supabase
      .from('users')
      .update({ plan })
      .eq('id', req.params.id)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

// PUT /api/admin/users/:id/role — promover/degradar usuario
router.put('/users/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['user','admin'].includes(role))
      return res.status(400).json({ error: 'Rol inválido' });

    const { data, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', req.params.id)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

module.exports = router;
