const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../db/database');

router.use(requireAuth);

const ALLOWED = ['nombre','tel','monto','acreedor','estado','llamar_auto','frecuencia','hora','dias_semana','max_intentos','notas'];

// Función de limpieza de datos
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]));

// GET - Listar todos los deudores
router.get('/', async (req, res, next) => {
  try {
    const { data: rows, error } = await supabase
      .from('deudores')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Supabase devuelve los booleanos y arrays tal cual son, no hace falta parsear nada
    res.json(rows);
  } catch (e) { next(e); }
});

// POST - Crear nuevo deudor
router.post('/', async (req, res, next) => {
  try {
    const body = pick(req.body, ALLOWED);
    if (!body.nombre || !body.tel || !body.monto) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const { data: nuevo, error } = await supabase
      .from('deudores')
      .insert([{
        user_id: req.user.id,
        nombre: body.nombre,
        tel: body.tel,
        monto: Number(body.monto),
        acreedor: body.acreedor,
        estado: body.estado || 'pendiente',
        llamar_auto: Boolean(body.llamar_auto), // Enviamos true/false
        frecuencia: body.frecuencia,
        hora: body.hora,
        dias_semana: body.dias_semana || []     // Enviamos el array nativo
      }])
      .select('*')
      .single();

    if (error) throw error;
    res.status(201).json(nuevo);
  } catch (e) { 
    console.error("Error en POST /deudores:", e);
    next(e); 
  }
});

// PUT - Editar un deudor existente
router.put('/:id', async (req, res, next) => {
  try {
    const body = pick(req.body, ALLOWED);
    
    // Nos aseguramos de formatear correctamente los números y booleanos
    const payload = { ...body };
    if (payload.monto !== undefined) payload.monto = Number(payload.monto);
    if (payload.llamar_auto !== undefined) payload.llamar_auto = Boolean(payload.llamar_auto);
    
    const { data: actualizado, error } = await supabase
      .from('deudores')
      .update(payload)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select('*')
      .single();

    if (error) throw error;
    res.json(actualizado);
  } catch (e) { 
    console.error("Error en PUT /deudores:", e);
    next(e); 
  }
});

// DELETE - Borrar deudor
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

module.exports = router;