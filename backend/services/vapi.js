const axios = require('axios');

const vapi = axios.create({
  baseURL: 'https://api.vapi.ai',
  headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
  timeout: 15000,
});

// ── Crear asistente para un usuario nuevo ────────────────────────
async function createAssistant(userId, { nombre = 'Valentina' } = {}) {
  const { data } = await vapi.post('/assistant', {
    name: `Debtflow-${userId.slice(0, 8)}`,
    voice: { provider: 'openai', voiceId: 'nova' },
    model: {
      provider: 'openai',
      model:    'gpt-4o',
      messages: [{ role: 'system', content: buildSystemPrompt({ nombre, tono: 'profesional' }) }],
    },
    firstMessage: 'Buenos días, ¿hablo con usted? Le llamo de parte de su acreedor.',
    serverUrl:       `${process.env.BACKEND_URL}/webhooks/vapi`,
    serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
  });
  return data;
}

// ── Actualizar asistente cuando el usuario cambia la config ──────
async function updateAssistant(assistantId, config) {
  const { data } = await vapi.patch(`/assistant/${assistantId}`, {
    voice: { provider: 'openai', voiceId: config.voz || 'nova' },
    model: {
      provider: 'openai',
      model:    config.modelo || 'gpt-4o',
      messages: [{ role: 'system', content: buildSystemPrompt(config) }],
    },
    firstMessage: config.saludo || 'Buenos días, ¿hablo con usted?',
  });
  return data;
}

// ── Disparar una llamada a través de Vapi ────────────────────────
async function makeCall({ assistantId, toNumber, fromNumber, metadata }) {
  const { data } = await vapi.post('/call/phone', {
    assistantId,
    customer:          { number: toNumber },
    phoneNumber:       { twilioPhoneNumber: fromNumber },
    assistantOverrides: {
      variableValues: metadata,  // { nombre_deudor, acreedor, monto, deudor_id, user_id }
    },
  });
  return data;  // { id: vapi_call_id, ... }
}

// ── Construir el system prompt del agente ────────────────────────
function buildSystemPrompt(cfg) {
  return [
    cfg.personalidad || 'Sos un agente de cobranzas profesional y empático.',
    `Tono: ${cfg.tono || 'profesional'}.`,
    `Idioma: ${cfg.idioma || 'es-AR'}. Habla siempre en ese idioma.`,
    'Mencioná el nombre del deudor y el monto cuando sea relevante.',
    'Ante objeciones: ' + (cfg.objecion || 'proponé un plan de pagos flexible.'),
    'Para cerrar: ' + (cfg.cierre || 'confirmá la fecha de pago y despedite amablemente.'),
  ].join(' ');
}

module.exports = { createAssistant, updateAssistant, makeCall };
