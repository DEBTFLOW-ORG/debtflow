const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../db/database');

router.use(requireAuth);

const ALLOWED = ['nombre','tel','monto','acreedor','estado','llamar_auto','frecuencia','hora','dias_semana','max_intentos','notas'];

router.get('/', async (req, res, next) => {
  try {
    const { data: rows, error } = await supabase
      .from('deudores')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const data = rows.map(r => ({
      ...r,
      llamar_auto: Boolean(r.llamar_auto),
      // Nos aseguramos de parsear si Supabase lo devuelve como string
      dias_semana: r.dias_semana ? (typeof r.dias_semana === 'string' ? JSON.parse(r.dias_semana) : r.dias_semana) : []
    }));
    res.json(data);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const body = pick(req.body, ALLOWED);
    if (!body.nombre || !body.tel || !body.monto) return res.status(400).json({ error: 'Faltan campos obligatorios' });

    // Dejamos que Supabase genere el 'id' automáticamente
    const diasStr = JSON.stringify(body.dias_semana || []);

    const { data: nuevo, error } = await supabase
      .from('deudores')
      .insert([{

      user_id: req.user.id,
      nombre: body.nombre,
      tel: body.tel,
      monto: Number(body.monto),
      acreedor: body.acreedor,
      estado: body.estado || 'pendiente',
      llamar_auto: body.llamar_auto ? 1 : 0,
      frecuencia: body.frecuencia,
      hora: body.hora,
      dias_semana: diasStr
    }])
    .select('*')
    .single();

    if (error) throw error;

    res.status(201).json({ 
      ...nuevo, 
      llamar_auto: Boolean(nuevo.llamar_auto), 
      dias_semana: typeof nuevo.dias_semana === 'string' ? JSON.parse(nuevo.dias_semana) : nuevo.dias_semana
    });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('deudores')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.status(204).end();
  } catch (e) { next(e); }
});

const pick = (obj, keys) => Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]));
module.exports = router;