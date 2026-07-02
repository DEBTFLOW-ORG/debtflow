require('dotenv').config();

const axios = require('axios');

const SENSITIVE_KEY = /key|token|secret|credential|auth|password/i;

function maskPhone(value) {
  return String(value).replace(/(\+?\d{2,4})\d+(\d{2})$/, '$1...$2');
}

function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (SENSITIVE_KEY.test(key)) return [key, item ? '[set]' : item];
    if (['number', 'phoneNumber', 'sipUri'].includes(key)) return [key, item ? maskPhone(item) : item];
    return [key, scrub(item)];
  }));
}

async function main() {
  const apiKey = process.env.VAPI_API_KEY;
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

  if (!apiKey || !phoneNumberId) {
    throw new Error('Faltan VAPI_API_KEY o VAPI_PHONE_NUMBER_ID en backend/.env');
  }

  const client = axios.create({
    baseURL: 'https://api.vapi.ai',
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 15000,
  });

  const [{ data: selected }, { data: list }, { data: credentials }] = await Promise.all([
    client.get(`/phone-number/${phoneNumberId}`),
    client.get('/phone-number'),
    client.get('/credential').catch(() => ({ data: [] })),
  ]);

  const phoneNumbers = Array.isArray(list) ? list : (list.items || []);
  const providerCounts = phoneNumbers.reduce((counts, phone) => {
    counts[phone.provider || 'unknown'] = (counts[phone.provider || 'unknown'] || 0) + 1;
    return counts;
  }, {});

  console.log(JSON.stringify({
    selected: scrub(selected),
    phoneNumberCount: phoneNumbers.length,
    providerCounts,
    credentials: scrub(credentials),
  }, null, 2));
}

main().catch((error) => {
  const status = error.response?.status;
  const body = error.response?.data;
  console.error(JSON.stringify({
    ok: false,
    status,
    error: body?.message || body || error.message,
  }, null, 2));
  process.exit(1);
});
