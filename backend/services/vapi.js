const axios = require('axios');

const vapi = axios.create({
  baseURL: 'https://api.vapi.ai',
  headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
  timeout: 15000,
});

async function createAssistant(userId, { nombre = 'Valentina' } = {}) {
  ensureConfigured();
  const { data } = await vapi.post('/assistant', {
    name: `Debtflow-${userId.slice(0, 8)}`,
    ...buildAssistantConfig({ nombre, tono: 'profesional' }),
  });
  return data;
}

async function updateAssistant(assistantId, config) {
  ensureConfigured();
  const { data } = await vapi.patch(`/assistant/${assistantId}`, {
    ...buildAssistantConfig(config),
  });
  return data;
}

async function makeCall({ assistantId, toNumber, metadata = {}, config = {} }) {
  ensureConfigured();

  const payload = {
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
    customer: {
      number: toNumber,
      numberE164CheckEnabled: false,
    },
    assistantOverrides: {
      variableValues: metadata,
    },
  };

  if (assistantId) {
    payload.assistantId = assistantId;
    payload.assistantOverrides = {
      ...payload.assistantOverrides,
      ...buildAssistantOverrides(config),
    };
  } else {
    payload.assistant = buildAssistantConfig(config);
  }

  const { data } = await vapi.post('/call/phone', payload);
  return data;
}

async function getCall(callId) {
  ensureConfigured();
  const { data } = await vapi.get(`/call/${callId}`);
  return data;
}

async function listCalls(params = {}) {
  ensureConfigured();
  const { data } = await vapi.get('/call', { params });
  return Array.isArray(data) ? data : (data.items || data.results || data.data || []);
}

function ensureConfigured() {
  if (!process.env.VAPI_API_KEY) {
    throw new Error('Falta configurar VAPI_API_KEY');
  }
  if (!process.env.VAPI_PHONE_NUMBER_ID) {
    throw new Error('Falta configurar VAPI_PHONE_NUMBER_ID');
  }
}

function buildAssistantConfig(config = {}) {
  return {
    name: config.nombre ? `Debtflow-${config.nombre}` : 'Debtflow-Cobranzas',
    firstMessage: renderTemplate(
      config.saludo || 'Hola {{nombre_deudor}}, soy {{nombre}}, de Debtflow. Te llamo por {{acreedor}}, por un saldo pendiente de {{monto}} pesos. Me escuchas bien?',
      config,
    ),
    firstMessageMode: 'assistant-speaks-first',
    model: {
      provider: 'openai',
      model: process.env.VAPI_OPENAI_MODEL || config.modelo || 'gpt-4o-mini',
      temperature: Number(process.env.VAPI_MODEL_TEMPERATURE || 0.35),
      maxTokens: Number(process.env.VAPI_MODEL_MAX_TOKENS || 90),
      messages: [{ role: 'system', content: buildSystemPrompt(config) }],
    },
    voice: buildVoiceConfig(config),
    transcriber: {
      provider: 'deepgram',
      model: process.env.VAPI_TRANSCRIBER_MODEL || 'nova-3',
      language: process.env.VAPI_TRANSCRIBER_LANGUAGE || 'es',
    },
    server: buildServerConfig(),
    endCallMessage: config.cierre || 'Gracias por atender. Que tengas buen dia.',
    endCallFunctionEnabled: true,
    maxDurationSeconds: Number(process.env.VAPI_MAX_DURATION_SECONDS || 300),
    backgroundDenoisingEnabled: true,
  };
}

function buildAssistantOverrides(config = {}) {
  return {
    firstMessage: renderTemplate(
      config.saludo || 'Hola {{nombre_deudor}}, soy {{nombre}}, de Debtflow. Te llamo por {{acreedor}}, por un saldo pendiente de {{monto}} pesos. Me escuchas bien?',
      config,
    ),
    model: {
      provider: 'openai',
      model: process.env.VAPI_OPENAI_MODEL || config.modelo || 'gpt-4o-mini',
      temperature: Number(process.env.VAPI_MODEL_TEMPERATURE || 0.35),
      maxTokens: Number(process.env.VAPI_MODEL_MAX_TOKENS || 90),
      messages: [{ role: 'system', content: buildSystemPrompt(config) }],
    },
    voice: buildVoiceConfig(config),
    transcriber: {
      provider: 'deepgram',
      model: process.env.VAPI_TRANSCRIBER_MODEL || 'nova-3',
      language: process.env.VAPI_TRANSCRIBER_LANGUAGE || 'es',
    },
    server: buildServerConfig(),
    endCallFunctionEnabled: true,
  };
}

function buildVoiceConfig(config = {}) {
  return {
    provider: '11labs',
    voiceId: config.voice_id || process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL',
    model: process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5',
    stability: Number(process.env.ELEVENLABS_STABILITY || 0.28),
    similarityBoost: Number(process.env.ELEVENLABS_SIMILARITY_BOOST || 0.86),
    speed: Number(process.env.ELEVENLABS_SPEED || 1.08),
    style: Number(process.env.ELEVENLABS_STYLE || 0.35),
    useSpeakerBoost: String(process.env.ELEVENLABS_SPEAKER_BOOST || 'false').toLowerCase() === 'true',
  };
}

function buildServerConfig() {
  const backendUrl = (process.env.BACKEND_URL || '').split('#')[0].trim().replace(/\/+$/, '');
  if (!backendUrl) return undefined;

  const server = { url: `${backendUrl}/webhooks/vapi` };
  if (process.env.VAPI_SERVER_CREDENTIAL_ID) {
    server.credentialId = process.env.VAPI_SERVER_CREDENTIAL_ID;
  } else if (process.env.VAPI_WEBHOOK_SECRET) {
    server.secret = process.env.VAPI_WEBHOOK_SECRET;
  }
  return server;
}

function buildSystemPrompt(cfg = {}) {
  return [
    cfg.personalidad || 'Sos Valentina, una agente argentina de cobranzas de Debtflow. Sonas como una persona real hablando por telefono, no como locutora ni bot.',
    `Tu nombre como agente es ${cfg.nombre || 'Valentina'}.`,
    `Tono: ${cfg.tono || 'cercano, calmo y profesional'}.`,
    `Idioma: ${cfg.idioma || 'espanol de Argentina'}. Habla siempre en ese idioma.`,
    'Responde rapido, con una sola idea por turno. Usa frases de 6 a 14 palabras cuando puedas.',
    'Usa voseo argentino natural: "vos", "te puedo", "queres", "podes". Evita usted salvo que la persona hable muy formal.',
    'No repitas el nombre del deudor en cada respuesta. No digas "asistente virtual" despues del saludo inicial.',
    'Evita listas, tecnicismos, explicaciones largas y cualquier tono robotico.',
    'Si hay silencio o duda, hace una pregunta corta para destrabar.',
    'Tu objetivo es validar si la persona puede pagar y conseguir un compromiso claro: fecha, monto o plan posible.',
    'No amenaces, no uses lenguaje legal agresivo y no inventes consecuencias. Mantene siempre un trato respetuoso.',
    'Si la persona dice que no puede pagar, pregunta por una fecha alternativa o un monto parcial razonable, sin presionar.',
    'Si la persona pide datos, usa solo los datos disponibles: nombre del deudor, acreedor y monto. No inventes informacion.',
    'Si no es la persona buscada, pedi disculpas brevemente y termina la llamada.',
    'Antes de cerrar, confirma el acuerdo en una frase simple.',
    'Ante objeciones: ' + (cfg.objecion || 'escucha la situacion, valida brevemente y propone una fecha o plan de pago flexible.'),
    'Para cerrar: ' + (cfg.cierre || 'confirma fecha y monto acordado, agradece y despidete con amabilidad.'),
    'En cuanto ya tengas lo que necesitas (un compromiso de pago, o confirmacion de que no es la persona buscada, o que no puede pagar y ya definiste la alternativa), despedite y terminá la llamada de inmediato usando la funcion para cortar. No sigas conversando ni agregues charla extra despues de despedirte.',
  ].join(' ');
}

function renderTemplate(text, values = {}) {
  return String(text).replace(/\{\{?(\w+)\}?\}/g, (_, key) => {
    const defaults = {
      nombre: 'Valentina',
      nombre_deudor: 'usted',
      acreedor: 'su acreedor',
      monto: 'el monto pendiente',
    };
    return values[key] || defaults[key] || '';
  });
}

function isConfigured() {
  return Boolean(process.env.VAPI_API_KEY && process.env.VAPI_PHONE_NUMBER_ID);
}

module.exports = { createAssistant, updateAssistant, makeCall, getCall, listCalls, isConfigured };
