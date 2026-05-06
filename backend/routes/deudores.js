const router          = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { supabase }    = require('../services/supabase');

router.use(requireAuth);

const ALLOWED = [
  'nombre','tel','monto','acreedor','estado',
  'llamar_auto','frecuencia','hora','dias_semana','max_intentos','notas',
];

// GET /api/deudores
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('deudores')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

// POST /api/deudores
router.post('/', async (req, res, next) => {
  try {
    const body = pick(req.body, ALLOWED);
    if (!body.nombre || !body.tel || !body.monto)
      return res.status(400).json({ error: 'nombre, tel y monto son requeridos' });

    const { data, error } = await supabase
      .from('deudores')
      .insert({ ...body, user_id: req.user.id })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { next(e); }
});

// PUT /api/deudores/:id
router.put('/:id', async (req, res, next) => {
  try {
    const body = pick(req.body, ALLOWED);
    const { data, error } = await supabase
      .from('deudores')
      .update(body)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'No encontrado' });
    res.json(data);
  } catch (e) { next(e); }
});

// DELETE /api/deudores/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await supabase.from('deudores')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    res.status(204).end();
  } catch (e) { next(e); }
});

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]));

module.exports = router;
