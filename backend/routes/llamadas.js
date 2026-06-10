const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../db/database'); // Importamos el nuevo cliente

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    // Supabase hace el JOIN automáticamente si las Foreign Keys están bien configuradas
    const { data: llamadas, error } = await supabase
      .from('llamadas')
      .select(`
        id,
        resultado,
        sentimiento,
        iniciada_at,
        duracion_seg,
        nota,
        transcripcion,
        deudores (nombre, tel)
      `)
      .eq('user_id', req.user.id)
      .order('iniciada_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    const formatted = llamadas.map(l => ({
      id: l.id,
      deudor: l.deudores?.nombre || '—',
      tel: l.deudores?.tel || '—',
      fecha: l.iniciada_at ? new Date(l.iniciada_at).toLocaleString('es-AR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—',
      dur: l.duracion_seg ? `${Math.floor(l.duracion_seg/60)}m ${l.duracion_seg%60}s` : '—',
      resultado: l.resultado || 'no_contesta',
      sentimiento: l.sentimiento || 'neutro',
      nota: l.nota || '',
      transcripcion: l.transcripcion ? (typeof l.transcripcion === 'string' ? JSON.parse(l.transcripcion) : l.transcripcion) : []
    }));

    res.json(formatted);
  } catch (e) { next(e); }
});

const twilioSvc = require('../services/twilio');

router.post('/test', async (req, res, next) => {
  try {
    const { telefono_destino, url_python_agent } = req.body;

    if (!telefono_destino || !url_python_agent) {
      return res.status(400).json({ error: 'Faltan parámetros: telefono_destino o url_python_agent' });
    }

    // 1. Buscamos las credenciales de Twilio del usuario logueado en Supabase
const { data: usuario, error } = await supabase
      .from('users')
      .select('twilio_account_sid, twilio_auth_token, twilio_phone_number') // <-- CORREGIDO AQUÍ
      .eq('id', req.user.id)
      .single();

    // 2. Iniciamos la llamada con la función correcta (iniciarLlamada)
    const call = await twilioSvc.iniciarLlamada(
      usuario.twilio_account_sid, // <-- CORREGIDO AQUÍ
      usuario.twilio_auth_token,
      usuario.twilio_phone_number,
      telefono_destino,
      'https://lorinda-nonevaporating-steven.ngrok-free.dev/'
    );

    res.json({ ok: true, mensaje: 'Llamada en curso', callSid: call.sid });
  } catch (e) { 
    next(e); 
  }
});

module.exports = router;