const router = require('express').Router();
const crypto = require('crypto');
const { supabase } = require('../db/database');
const logger = require('../utils/logger');

router.use(require('express').raw({ type: 'application/json' }));

router.post('/vapi', async (req, res) => {
  if (!verifyVapiRequest(req)) {
    logger.warn('Webhook Vapi: autenticacion invalida');
    return res.status(401).json({ error: 'Autenticacion invalida' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ error: 'JSON invalido' });
  }

  const { message } = payload;
  if (message?.type !== 'end-of-call-report') {
    return res.status(200).json({ received: true });
  }

  try {
    const vapiCallId = message.call?.id;
    if (!vapiCallId) return res.status(200).json({ received: true });

    const transcript = parseTranscript(message.artifact?.transcript || message.call?.transcript);
    const summary = message.analysis?.summary || '';
    const sentimiento = inferSentimiento(summary, transcript);
    const resultado = inferResultado(message.analysis?.successEvaluation, message.endedReason, summary, transcript);
    const duracion = Math.round(message.durationSeconds || 0);

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
        nota: summary,
        finalizada_at: new Date().toISOString(),
      }).eq('id', llamada.id);

      if (llamada.deudor_id && resultado && resultado !== 'error') {
        await supabase.from('deudores').update({
          estado: resultado,
          ultimo_intento: new Date().toISOString(),
        }).eq('id', llamada.deudor_id);
      }
    }

    logger.info(`Webhook Vapi OK: ${vapiCallId} -> ${resultado} / ${sentimiento}`);
    res.status(200).json({ received: true });
  } catch (err) {
    logger.error('Webhook Vapi error: ' + err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

function verifyVapiRequest(req) {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';

  const directSecret = req.headers['x-vapi-secret'];
  if (directSecret && safeEqual(String(directSecret), secret)) return true;

  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ') && safeEqual(auth.slice(7), secret)) return true;

  const signature = req.headers['x-vapi-signature'] || req.headers['x-signature'];
  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(req.body)
    .digest('hex');

  return safeEqual(String(signature).replace(/^sha256=/, ''), expected);
}

function safeEqual(a, b) {
  try {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function parseTranscript(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map(t => ({
        quien: t.role === 'assistant' ? 'agente' : 'deudor',
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

function inferSentimiento(summary = '', transcript = []) {
  const s = `${summary} ${transcript.map(t => t.texto).join(' ')}`.toLowerCase();
  if (/positiv|paga|pago|acepta|acuerdo|conform|promesa|link|whatsapp/.test(s)) return 'positivo';
  if (/negativ|enojad|rechaz|no quiere|molest|imposible|no puedo/.test(s)) return 'negativo';
  return 'neutro';
}

function inferResultado(evaluation = '', endedReason = '', summary = '', transcript = []) {
  const e = String(evaluation).toLowerCase();
  const r = String(endedReason).toLowerCase();
  const s = String(summary).toLowerCase();
  const t = transcript.map(item => `${item.quien}: ${item.texto}`).join(' ').toLowerCase();
  const hay = `${e} ${r} ${s} ${t}`;
  const userSpoke = transcript.some(item => item.quien === 'deudor' && String(item.texto || '').trim());

  if (/failed-to-connect|call\.start\.error|error-sip|error/.test(hay)) return 'error';
  if (!userSpoke && /no.answer|voicemail|busy|no.contesta|did-not-answer/.test(hay)) return 'no_contesta';
  if (/paid|pagado|cancelado|deuda saldada/.test(hay)) return 'cancelado';
  if (/promesa|pagara|pagar[a\u00e1]|plan|acuerdo|fecha de pago|lo pago|pago total|link de pago|link.*whatsapp|whatsapp/.test(hay)) return 'promesa_pago';
  if (userSpoke || /success|true|contact|atendio|atendi[o\u00f3]|hablo|habl[o\u00f3]|convers/.test(hay)) return 'contactado';
  return 'no_contesta';
}

module.exports = router;
