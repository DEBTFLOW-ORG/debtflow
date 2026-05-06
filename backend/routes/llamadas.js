const router          = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { supabase }    = require('../services/supabase');

router.use(requireAuth);

// GET /api/llamadas
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('llamadas')
      .select(`
        id, resultado, sentimiento, duracion_seg,
        transcripcion, nota, iniciada_at, finalizada_at,
        deudores ( nombre, tel )
      `)
      .eq('user_id', req.user.id)
      .order('iniciada_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    // Formatear para que coincida con la estructura del frontend
    const formatted = data.map(l => ({
      id:           l.id,
      deudor:       l.deudores?.nombre || '—',
      tel:          l.deudores?.tel    || '—',
      fecha:        l.iniciada_at ? new Date(l.iniciada_at).toLocaleString('es-AR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—',
      dur:          l.duracion_seg ? `${Math.floor(l.duracion_seg/60)}m ${l.duracion_seg%60}s` : '—',
      resultado:    l.resultado    || 'no_contesta',
      sentimiento:  l.sentimiento  || 'neutro',
      nota:         l.nota         || '',
      transcripcion: l.transcripcion || [],
    }));

    res.json(formatted);
  } catch (e) { next(e); }
});

module.exports = router;
