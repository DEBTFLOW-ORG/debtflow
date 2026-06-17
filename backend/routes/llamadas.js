const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../db/database');
const twilioSvc = require('../services/twilio');

router.post('/internal/:id/transcript', async (req, res, next) => {
  try {
    const token = req.headers['x-agent-token'];
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || 'clave_desarrollo_local'
    );

    if (payload.type !== 'voice-agent' || payload.llamada_id !== req.params.id) {
      return res.status(403).json({ error: 'Token de agente inválido' });
    }

    const update = {};
    for (const key of [
      'transcripcion',
      'duracion_seg',
      'resultado',
      'sentimiento',
      'nota',
      'finalizada_at',
    ]) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const { data: llamada, error } = await supabase
      .from('llamadas')
      .update(update)
      .eq('id', req.params.id)
      .select('deudor_id')
      .single();

    if (error) throw error;

    const estadosDeudor = new Set([
      'contactado',
      'promesa_pago',
      'no_contesta',
      'cancelado',
    ]);
    if (
      llamada?.deudor_id
      && req.body.resultado
      && estadosDeudor.has(req.body.resultado)
    ) {
      await supabase
        .from('deudores')
        .update({
          estado: req.body.resultado,
          ultimo_intento: new Date().toISOString(),
        })
        .eq('id', llamada.deudor_id);
    }

    res.json({ ok: true });
  } catch (e) {
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token de agente inválido' });
    }
    next(e);
  }
});

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
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

    res.json(llamadas.map(l => ({
      id: l.id,
      deudor: l.deudores?.nombre || '-',
      tel: l.deudores?.tel || '-',
      fecha: l.iniciada_at
        ? new Date(l.iniciada_at).toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '-',
      dur: l.duracion_seg
        ? `${Math.floor(l.duracion_seg / 60)}m ${l.duracion_seg % 60}s`
        : '-',
      resultado: l.resultado || 'no_contesta',
      sentimiento: l.sentimiento || 'neutro',
      nota: l.nota || '',
      transcripcion: l.transcripcion
        ? (typeof l.transcripcion === 'string'
            ? JSON.parse(l.transcripcion)
            : l.transcripcion)
        : [],
    })));
  } catch (e) {
    next(e);
  }
});

router.post('/test', async (req, res, next) => {
  try {
    const { telefono_destino, deudor_id } = req.body;

    if (!telefono_destino) {
      return res.status(400).json({ error: 'Falta el teléfono de destino' });
    }

    const voiceAgentUrl = process.env.VOICE_AGENT_URL?.trim().replace(/\/+$/, '');
    if (!voiceAgentUrl) {
      return res.status(503).json({
        error: 'El asistente de voz no está configurado en el servidor',
      });
    }

    const { data: usuario, error } = await supabase
      .from('users')
      .select('twilio_account_sid, twilio_auth_token, twilio_phone_number, agente_config')
      .eq('id', req.user.id)
      .single();

    if (error || !usuario) {
      return res.status(404).json({
        error: 'No se encontró la configuración del usuario',
      });
    }

    let deudor = null;
    if (deudor_id) {
      const { data } = await supabase
        .from('deudores')
        .select('id, nombre, acreedor, monto')
        .eq('id', deudor_id)
        .eq('user_id', req.user.id)
        .maybeSingle();
      deudor = data;
    }

    const agenteConfig = typeof usuario.agente_config === 'string'
      ? JSON.parse(usuario.agente_config || '{}')
      : (usuario.agente_config || {});

    const { data: llamada, error: llamadaError } = await supabase
      .from('llamadas')
      .insert([{
        user_id: req.user.id,
        deudor_id: deudor?.id || null,
        resultado: 'no_contesta',
        sentimiento: 'neutro',
        transcripcion: [],
      }])
      .select('id')
      .single();

    if (llamadaError) throw llamadaError;

    const callbackToken = jwt.sign(
      { type: 'voice-agent', llamada_id: llamada.id },
      process.env.JWT_SECRET || 'clave_desarrollo_local',
      { expiresIn: '6h' }
    );

    const backendUrl = (process.env.BACKEND_URL || 'http://127.0.0.1:3001')
      .split('#')[0]
      .trim()
      .replace(/\/+$/, '');

    const callConfig = {
      nombre: 'Valentina',
      voice_id: 'EXAVITQu4vr4xnSDxMaL',
      tono: 'profesional y empático',
      idioma: 'español de Argentina',
      personalidad: (
        'Sos una asistente de cobranzas. Tu objetivo es conversar con el deudor '
        + 'sobre su saldo pendiente y ayudarlo a acordar una fecha o plan de pago.'
      ),
      saludo: (
        'Hola {nombre_deudor}, soy {nombre}, asistente de cobranzas de {acreedor}. '
        + 'Te llamo por un saldo pendiente de {monto} pesos. '
        + '¿Podemos conversar un momento?'
      ),
      objecion: 'Escuchá su situación y proponé una fecha o un plan de pago posible.',
      cierre: 'Confirmá claramente el compromiso acordado y despedite con amabilidad.',
      ...agenteConfig,
      nombre_deudor: deudor?.nombre || '',
      acreedor: deudor?.acreedor || '',
      monto: deudor?.monto || '',
      llamada_id: llamada.id,
      callback_token: callbackToken,
      backend_url: backendUrl,
    };

    const configToken = Buffer
      .from(JSON.stringify(callConfig), 'utf8')
      .toString('base64url');
    const twimlUrl = `${voiceAgentUrl}/voice?config=${encodeURIComponent(configToken)}`;

    let call;
    try {
      call = await twilioSvc.iniciarLlamada(
        usuario.twilio_account_sid,
        usuario.twilio_auth_token,
        usuario.twilio_phone_number,
        telefono_destino,
        twimlUrl
      );
    } catch (callError) {
      await supabase
        .from('llamadas')
        .update({
          resultado: 'error',
          nota: callError.message,
          finalizada_at: new Date().toISOString(),
        })
        .eq('id', llamada.id);
      throw callError;
    }

    await supabase
      .from('llamadas')
      .update({ vapi_call_id: call.sid })
      .eq('id', llamada.id);

    res.json({
      ok: true,
      mensaje: 'Llamada en curso',
      callSid: call.sid,
      llamadaId: llamada.id,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
