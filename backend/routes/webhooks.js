const router = require('express').Router();
const crypto = require('crypto');
const { supabase } = require('../db/database');
const logger = require('../utils/logger');

router.use(require('express').raw({ type: 'application/json' }));

router.post('/vapi', async (req, res) => {
  const sig = req.headers['x-vapi-signature'];
  if (!verifySignature(req.body, sig)) {
    logger.warn('Webhook: firma inválida');
    return res.status(401).json({ error: 'Firma inválida' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ error: 'JSON inválido' });
  }

  const { message } = payload;

  if (message?.type !== 'end-of-call-report') {
    return res.status(200).json({ received: true });
  }

  try {
    const vapiCallId = message.call?.id;
    if (!vapiCallId) return res.status(200).json({ received: true });

    const transcript = parseTranscript(message.artifact?.transcript);
    const sentimiento = inferSentimiento(message.analysis?.summary);
    const resultado = inferResultado(message.analysis?.successEvaluation, message.endedReason);
    const duracion = Math.round(message.durationSeconds || 0);
    const nota = message.analysis?.summary || '';

    // Buscar llamada en Supabase
    const { data: llamada } = await supabase
      .from('llamadas')
      .select('id, deudor_id')
      .eq('vapi_call_id', vapiCallId)
      .maybeSingle();

    if (llamada) {
      await supabase.from('llamadas').update({
        resultado,
        sentimiento,
        duracion_seg: duracion,
        transcripcion: transcript, 
        nota,
        finalizada_at: new Date().toISOString()
      }).eq('id', llamada.id);

      if (llamada.deudor_id && resultado && resultado !== 'error') {
        await supabase.from('deudores').update({ estado: resultado }).eq('id', llamada.deudor_id);
      }
    }

    logger.info(`Webhook OK: ${vapiCallId} → ${resultado} / ${sentimiento}`);
    res.status(200).json({ received: true });
  } catch (err) {
    logger.error('Webhook error: ' + err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Helpers se mantienen igual
function verifySignature(rawBody, sig) {
  if (!sig || !process.env.VAPI_WEBHOOK_SECRET) return false;
  const expected = crypto.createHmac('sha256', process.env.VAPI_WEBHOOK_SECRET).update(rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex')); } catch { return false; }
}
function parseTranscript(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(t => ({ quien: t.role === 'assistant' ? 'agente' : 'deudor', texto: t.transcript || t.message || '' })).filter(t => t.texto);
}
function inferSentimiento(summary = '') {
  const s = summary.toLowerCase();
  if (/positiv|pagará|acepta|acuerdo|conform/.test(s)) return 'positivo';
  if (/negativ|enojad|rechaz|no quiere|molest/.test(s)) return 'negativo';
  return 'neutro';
}
function inferResultado(evaluation = '', endedReason = '') {
  const e = String(evaluation).toLowerCase();
  const r = String(endedReason).toLowerCase();
  if (/no.answer|voicemail|busy|no.contesta/.test(r)) return 'no_contesta';
  if (/paid|pagado|cancelado/.test(e)) return 'cancelado';
  if (/promesa|pagará|plan/.test(e)) return 'promesa_pago';
  if (/success|contact/.test(e)) return 'contactado';
  return 'no_contesta';
}

module.exports = router;