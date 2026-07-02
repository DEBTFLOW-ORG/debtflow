const axios = require('axios');

const elevenlabs = axios.create({
  baseURL: 'https://api.elevenlabs.io/v1',
  timeout: 60000,
});

function headers() {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error('Falta configurar ELEVENLABS_API_KEY');
  return { 'xi-api-key': apiKey };
}

function isConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID);
}

async function makeOutboundCall({ toNumber, dynamicVariables = {}, agentId } = {}) {
  const resolvedAgentId = agentId || process.env.ELEVENLABS_AGENT_ID?.trim();
  if (!resolvedAgentId) throw new Error('Falta configurar ELEVENLABS_AGENT_ID');

  const phoneNumberId = await resolvePhoneNumberId();
  const endpoint = shouldUseSipTrunk()
    ? '/convai/sip-trunk/outbound-call'
    : '/convai/twilio/outbound-call';
  const payload = {
    agent_id: resolvedAgentId,
    agent_phone_number_id: phoneNumberId,
    to_number: normalizePhone(toNumber),
    conversation_initiation_client_data: {
      dynamic_variables: dynamicVariables,
    },
  };

  const { data } = await elevenlabs.post(endpoint, payload, {
    headers: headers(),
  });
  return data;
}

async function resolvePhoneNumberId() {
  const explicit = process.env.ELEVENLABS_PHONE_NUMBER_ID?.trim();
  if (explicit && !shouldUseSipTrunk()) return explicit;

  if (shouldUseSipTrunk()) {
    const phoneNumber = normalizePhone(
      process.env.ELEVENLABS_PHONE_NUMBER || process.env.TELNYX_PHONE_NUMBER
    );
    if (!phoneNumber) throw new Error('Falta configurar ELEVENLABS_PHONE_NUMBER o TELNYX_PHONE_NUMBER');

    const existing = await findPhoneNumber(phoneNumber, 'sip_trunk');
    if (existing?.phone_number_id) return existing.phone_number_id;

    return importSipTrunkPhoneNumber(phoneNumber);
  }

  const phoneNumber = process.env.TWILIO_PHONE_NUMBER?.trim();
  if (!phoneNumber) throw new Error('Falta configurar TWILIO_PHONE_NUMBER');

  const existing = await findPhoneNumber(phoneNumber, 'twilio');
  if (existing?.phone_number_id) return existing.phone_number_id;

  return importTwilioPhoneNumber(phoneNumber);
}

async function findPhoneNumber(phoneNumber, provider) {
  const { data } = await elevenlabs.get('/convai/phone-numbers', {
    headers: headers(),
    params: { provider },
  });
  const list = Array.isArray(data) ? data : (data.phone_numbers || data.items || []);
  const wanted = normalizePhone(phoneNumber);
  return list.find(item => normalizePhone(item.phone_number) === wanted);
}

async function importSipTrunkPhoneNumber(phoneNumber) {
  const username = process.env.TELNYX_SIP_USERNAME?.trim();
  const password = process.env.TELNYX_SIP_PASSWORD?.trim();
  const address = (process.env.TELNYX_SIP_ADDRESS || 'sip.telnyx.com').trim();
  if (!username || !password) {
    throw new Error('Faltan TELNYX_SIP_USERNAME o TELNYX_SIP_PASSWORD');
  }

  const { data } = await elevenlabs.post('/convai/phone-numbers', {
    provider: 'sip_trunk',
    label: process.env.ELEVENLABS_PHONE_LABEL || 'Debtflow Telnyx',
    phone_number: phoneNumber,
    agent_id: process.env.ELEVENLABS_AGENT_ID?.trim(),
    outbound_trunk_config: {
      address,
      transport: process.env.TELNYX_SIP_TRANSPORT || 'udp',
      media_encryption: process.env.TELNYX_SIP_MEDIA_ENCRYPTION || 'disabled',
      credentials: { username, password },
    },
  }, {
    headers: headers(),
  });

  if (!data?.phone_number_id) {
    throw new Error('ElevenLabs no devolvio phone_number_id al importar el SIP trunk');
  }
  return data.phone_number_id;
}

async function importTwilioPhoneNumber(phoneNumber) {
  const accountSid = process.env.TWILIO_MASTER_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_MASTER_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new Error('Faltan credenciales de Twilio para importar el numero en ElevenLabs');
  }

  const { data } = await elevenlabs.post('/convai/phone-numbers', {
    provider: 'twilio',
    label: 'Debtflow Twilio',
    phone_number: phoneNumber,
    sid: accountSid,
    token: authToken,
  }, {
    headers: headers(),
  });

  if (!data?.phone_number_id) {
    throw new Error('ElevenLabs no devolvio phone_number_id al importar el numero');
  }
  return data.phone_number_id;
}

function normalizePhone(phone) {
  return String(phone || '').trim().replace(/[^\d+]/g, '');
}

function shouldUseSipTrunk() {
  return ['sip', 'sip_trunk', 'telnyx'].includes(
    String(process.env.ELEVENLABS_PHONE_PROVIDER || '').trim().toLowerCase()
  );
}

module.exports = {
  isConfigured,
  makeOutboundCall,
  resolvePhoneNumberId,
  normalizePhone,
  findPhoneNumber,
};
