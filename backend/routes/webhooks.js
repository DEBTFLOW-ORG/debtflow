const router       = require('express').Router();
const crypto       = require('crypto');
const { supabase } = require('../services/supabase');
const logger       = require('../utils/logger');

// Raw body para verificar firma HMAC de Vapi
router.use(require('express').raw({ type: 'application/json' }));

// POST /webhooks/vapi
router.post('/vapi', async (req, res) => {
  // 1. Verificar firma
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

  // Vapi envía varios tipos de eventos; solo nos importa end-of-call-report
  if (message?.type !== 'end-of-call-report') {
    return res.status(200).json({ received: true });
  }

  try {
    const vapiCallId  = message.call?.id;
    if (!vapiCallId) return res.status(200).json({ received: true });

    const transcript  = parseTranscript(message.artifact?.transcript);
    const sentimiento = inferSentimiento(message.analysis?.summary);
    const resultado   = inferResultado(message.analysis?.successEvaluation, message.endedReason);
    const duracion    = Math.round(message.durationSeconds || 0);
    const nota        = message.analysis?.summary || '';

    // Actualizar la llamada que el scheduler creó
    const { data: llamada, error } = await supabase
      .from('llamadas')
      .update({
        resultado,
        sentimiento,
        duracion_seg:  duracion,
        transcripcion: transcript,
        nota,
        finalizada_at: new Date().toISOString(),
      })
      .eq('vapi_call_id', vapiCallId)
      .select('deudor_id')
      .single();

    if (error) logger.error(`Webhook: error actualizando llamada ${vapiCallId}: ${error.message}`);

    // Actualizar estado del deudor según resultado
    if (llamada?.deudor_id && resultado && resultado !== 'error') {
      await supabase.from('deudores')
        .update({ estado: resultado })
        .eq('id', llamada.deudor_id);
    }

    logger.info(`Webhook OK: ${vapiCallId} → ${resultado} / ${sentimiento}`);
    res.status(200).json({ received: true });
  } catch (err) {
    logger.error('Webhook error: ' + err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ── Helpers ───────────────────────────────────────────────────────
function verifySignature(rawBody, sig) {
  if (!sig || !process.env.VAPI_WEBHOOK_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', process.env.VAPI_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

function parseTranscript(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(turn => ({
    quien: turn.role === 'assistant' ? 'agente' : 'deudor',
    texto: turn.transcript || turn.message || '',
  })).filter(t => t.texto);
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
  if (/no.answer|voicemail|busy|no.contesta/.test(r))  return 'no_contesta';
  if (/paid|pagado|cancelado/.test(e))                  return 'cancelado';
  if (/promesa|pagará|plan/.test(e))                    return 'promesa_pago';
  if (/success|contact/.test(e))                        return 'contactado';
  return 'no_contesta';
}

module.exports = router;
