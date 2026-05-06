const twilio = require('twilio');
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

// ── Master client (de Debtflow, no del usuario) ──────────────────
const master = twilio(
  process.env.TWILIO_MASTER_ACCOUNT_SID,
  process.env.TWILIO_MASTER_AUTH_TOKEN
);

// ── Encriptación del authToken antes de guardar en DB ────────────
function encrypt(text) {
  const key    = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const iv     = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc    = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(blob) {
  const [ivHex, tagHex, encHex] = blob.split(':');
  const key     = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

// ── Crear sub-cuenta para un usuario nuevo ───────────────────────
async function createSubAccount(email) {
  const sub = await master.api.accounts.create({
    friendlyName: `Debtflow — ${email}`,
  });
  return { sid: sub.sid, authToken: sub.authToken };
}

// ── Comprar número de teléfono en la sub-cuenta ──────────────────
async function buyPhoneNumber(subSid, encryptedToken) {
  const authToken = decrypt(encryptedToken);
  const client    = twilio(subSid, authToken);

  const areaCode = process.env.TWILIO_PHONE_AREA_CODE || '1';
  const available = await client.availablePhoneNumbers('US')
    .local.list({ areaCode, limit: 1 });

  if (!available.length) {
    // Fallback: any US number
    const any = await client.availablePhoneNumbers('US')
      .local.list({ limit: 1 });
    if (!any.length) throw new Error('No hay números disponibles');
    const p = await client.incomingPhoneNumbers.create({ phoneNumber: any[0].phoneNumber });
    return p.phoneNumber;
  }

  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber: available[0].phoneNumber,
  });
  return purchased.phoneNumber;
}

module.exports = { createSubAccount, buyPhoneNumber, encrypt, decrypt };
