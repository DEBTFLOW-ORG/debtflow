const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../db/database');
const twilioSvc = require('../services/twilio');
const vapiSvc = require('../services/vapi');
const elevenlabsSvc = require('../services/elevenlabs');

router.post('/internal/:id/transcript', async (req, res, next) => {
  try {
    const token = req.headers['x-agent-token'];
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || 'clave_desarrollo_local'
    );

    if (payload.type !== 'voice-agent' || payload.llamada_id !== req.params.id) {
      return res.status(403).json({ error: 'Token de agente invalido' });
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
      return res.status(401).json({ error: 'Token de agente invalido' });
    }
    next(e);
  }
});

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    await reconcileRecentVapiCalls(req.user.id);

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
      return res.status(400).json({ error: 'Falta el telefono de destino' });
    }

    const provider = String(process.env.CALL_PROVIDER || 'auto').trim().toLowerCase();
    const useElevenLabs = provider === 'elevenlabs'
      || (provider === 'auto' && elevenlabsSvc.isConfigured());
    const useVapi = !useElevenLabs && provider !== 'twilio' && vapiSvc.isConfigured();
    const voiceAgentUrl = process.env.VOICE_AGENT_URL?.trim().replace(/\/+$/, '');
    if (!useElevenLabs && !useVapi && !voiceAgentUrl) {
      return res.status(503).json({
        error: 'El asistente de voz no esta configurado en el servidor',
      });
    }

    const { data: usuario, error } = await supabase
      .from('users')
      .select('twilio_account_sid, twilio_auth_token, twilio_phone_number, vapi_assistant_id, agente_config')
      .eq('id', req.user.id)
      .single();

    if (error || !usuario) {
      return res.status(404).json({
        error: 'No se encontro la configuracion del usuario',
      });
    }

    if (!useElevenLabs && !useVapi) {
      const twilioGate = await validateTwilioTrialDestination(telefono_destino);
      if (!twilioGate.ok) {
        return res.status(400).json({ error: twilioGate.error });
      }
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
      voice_id: process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL',
      tono: 'cercano, calmo y profesional',
      idioma: 'espanol de Argentina',
      personalidad: (
        'Sos Valentina, una agente argentina de cobranzas. Hablas natural, corto '
        + 'y con tono humano por telefono.'
      ),
      saludo: (
        'Hola {nombre_deudor}, soy {nombre}, de Debtflow. '
        + 'Te llamo por {acreedor}, por un saldo pendiente de {monto} pesos. '
        + 'Me escuchas bien?'
      ),
      objecion: 'Escucha, valida en una frase y propone una fecha o monto posible.',
      cierre: 'Confirma fecha y monto acordado en una frase simple.',
      ...agenteConfig,
      nombre_deudor: deudor?.nombre || '',
      acreedor: deudor?.acreedor || '',
      monto: deudor?.monto || '',
      llamada_id: llamada.id,
      callback_token: callbackToken,
      backend_url: backendUrl,
    };

    let call;
    try {
      if (useElevenLabs) {
        call = await elevenlabsSvc.makeOutboundCall({
          toNumber: telefono_destino,
          dynamicVariables: {
            user_id: req.user.id,
            llamada_id: llamada.id,
            deudor_id: deudor?.id || '',
            nombre_deudor: deudor?.nombre || '',
            acreedor: deudor?.acreedor || '',
            monto: String(deudor?.monto || ''),
            telefono_original: telefono_destino,
            callback_token: callbackToken,
            backend_url: backendUrl,
          },
        });
      } else if (useVapi) {
        const vapiToNumber = normalizePhoneForVapi(telefono_destino);
        call = await vapiSvc.makeCall({
          assistantId: usuario.vapi_assistant_id,
          toNumber: vapiToNumber,
          config: callConfig,
          metadata: {
            user_id: req.user.id,
            llamada_id: llamada.id,
            deudor_id: deudor?.id || '',
            nombre_deudor: deudor?.nombre || '',
            acreedor: deudor?.acreedor || '',
            monto: deudor?.monto || '',
            telefono_original: telefono_destino,
            telefono_vapi: vapiToNumber,
          },
        });
        call = await hydrateVapiCallIfSettled(call);
      } else {
        const configToken = Buffer
          .from(JSON.stringify(callConfig), 'utf8')
          .toString('base64url');
        const twimlUrl = `${voiceAgentUrl}/voice?config=${encodeURIComponent(configToken)}`;

        call = await twilioSvc.iniciarLlamada(
          usuario.twilio_account_sid,
          usuario.twilio_auth_token,
          usuario.twilio_phone_number,
          telefono_destino,
          twimlUrl
        );
      }
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

    const providerCallId = call.conversation_id || call.call_sid || call.id || call.sid;
    if (useVapi && call.status === 'ended' && String(call.endedReason || '').startsWith('call.start.error')) {
      await supabase
        .from('llamadas')
        .update({
          vapi_call_id: providerCallId,
          resultado: 'error',
          nota: `Vapi no pudo iniciar la llamada: ${call.endedReason}`,
          finalizada_at: new Date().toISOString(),
        })
        .eq('id', llamada.id);

      return res.status(502).json({
        error: `Vapi no pudo iniciar la llamada: ${call.endedReason}`,
        callSid: providerCallId,
      });
    }

    await supabase
      .from('llamadas')
      .update({ vapi_call_id: providerCallId })
      .eq('id', llamada.id);

    res.json({
      ok: true,
      mensaje: 'Llamada en curso',
      callSid: providerCallId,
      llamadaId: llamada.id,
      provider: useElevenLabs ? 'elevenlabs' : (useVapi ? 'vapi' : 'voice-agent'),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

async function reconcileRecentVapiCalls(userId) {
  if (!vapiSvc.isConfigured()) return;

  const { data: llamadas } = await supabase
    .from('llamadas')
    .select('id, deudor_id, vapi_call_id, resultado, finalizada_at')
    .eq('user_id', userId)
    .not('vapi_call_id', 'is', null)
    .order('iniciada_at', { ascending: false })
    .limit(20);

  const pending = (llamadas || []).filter(l =>
    !l.finalizada_at || l.resultado === 'no_contesta' || !l.resultado
  );
  if (!pending.length) return;

  await Promise.all(pending.map(async (llamada) => {
    try {
      const call = await vapiSvc.getCall(llamada.vapi_call_id);
      if (!call || call.status !== 'ended') return;

      const transcript = parseVapiTranscript(call.artifact?.transcript || call.transcript);
      const summary = call.analysis?.summary || call.summary || '';
      const resultado = inferVapiResultado({
        successEvaluation: call.analysis?.successEvaluation,
        endedReason: call.endedReason,
        summary,
        transcript,
      });
      const sentimiento = inferVapiSentimiento(summary, transcript);
      const duracion = Math.round(call.durationSeconds || call.duration || 0);

      await supabase
        .from('llamadas')
        .update({
          resultado,
          sentimiento,
          duracion_seg: duracion || null,
          transcripcion: transcript,
          nota: summary,
          finalizada_at: new Date().toISOString(),
        })
        .eq('id', llamada.id);

      if (llamada.deudor_id && resultado !== 'error') {
        await supabase
          .from('deudores')
          .update({ estado: resultado, ultimo_intento: new Date().toISOString() })
          .eq('id', llamada.deudor_id);
      }
    } catch {
      // Best-effort sync; the listing should not fail because Vapi is temporarily unavailable.
    }
  }));
}

function normalizePhoneForVapi(phone) {
  const value = String(phone || '').trim().replace(/[^\d+]/g, '');
  return value;
}

async function validateTwilioTrialDestination(phone) {
  const original = String(phone || '').trim().replace(/[^\d+]/g, '');
  try {
    const info = await twilioSvc.getAccountInfo();
    if (String(info.type).toLowerCase() !== 'trial') return { ok: true };

    const verified = new Set(info.verifiedNumbers.map(n => String(n).replace(/[^\d+]/g, '')));
    if (verified.has(original)) return { ok: true };

    return {
      ok: false,
      error: (
        'Twilio Trial solo permite llamar a numeros verificados. '
        + `Verifica ${original || phone} en Twilio o actualiza la cuenta a paga.`
      ),
    };
  } catch {
    return { ok: true };
  }
}

async function hydrateVapiCallIfSettled(call) {
  if (!call?.id) return call;
  await new Promise(resolve => setTimeout(resolve, 2500));
  try {
    return await vapiSvc.getCall(call.id);
  } catch {
    return call;
  }
}

function parseVapiTranscript(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map(t => ({
        quien: t.role === 'assistant' || t.role === 'ai' ? 'agente' : 'deudor',
        texto: t.transcript || t.message || t.text || '',
      }))
      .filter(t => t.texto);
  }

  if (typeof raw !== 'string') return [];

  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^(ai|assistant|user|agente|deudor)\s*:\s*(.+)$/i);
      if (!match) return { quien: 'deudor', texto: line };
      const role = match[1].toLowerCase();
      return {
        quien: role === 'ai' || role === 'assistant' || role === 'agente' ? 'agente' : 'deudor',
        texto: match[2],
      };
    });
}

function inferVapiSentimiento(summary = '', transcript = []) {
  const text = `${summary} ${transcript.map(t => t.texto).join(' ')}`.toLowerCase();
  if (/pago|pagar|pag[oó]|acepta|acuerdo|link|whatsapp|promesa|perfecto|excelente/.test(text)) return 'positivo';
  if (/rechaz|no quiero|no puedo|enojad|molest|corta|cort[oó]/.test(text)) return 'negativo';
  return 'neutro';
}

function inferVapiResultado({ successEvaluation = '', endedReason = '', summary = '', transcript = [] } = {}) {
  const transcriptText = transcript.map(t => `${t.quien}: ${t.texto}`).join(' ').toLowerCase();
  const hay = `${successEvaluation} ${endedReason} ${summary} ${transcriptText}`.toLowerCase();
  const userSpoke = transcript.some(t => t.quien === 'deudor' && String(t.texto || '').trim());

  if (/failed-to-connect|call\.start\.error|error-sip|error/.test(hay)) return 'error';
  if (!userSpoke && /no.answer|voicemail|busy|did-not-answer|no.contesta/.test(hay)) return 'no_contesta';
  if (/pagad|pago total|pagar todo|lo pago|link de pago|link.*whatsapp|whatsapp|promesa|pagara|pagar[aá]|plan|acuerdo|fecha de pago/.test(hay)) return 'promesa_pago';
  if (/paid|cancelado|deuda saldada/.test(hay)) return 'cancelado';
  if (userSpoke || /success|true|contact|atendi[oó]|habl[oó]|convers/.test(hay)) return 'contactado';
  return 'no_contesta';
}
