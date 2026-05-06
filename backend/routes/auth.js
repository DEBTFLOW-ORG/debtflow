const router         = require('express').Router();
const jwt            = require('jsonwebtoken');
const { supabase }   = require('../services/supabase');
const twilioSvc      = require('../services/twilio');
const vapiSvc        = require('../services/vapi');
const { requireAuth } = require('../middleware/auth');
const logger         = require('../utils/logger');

// ── POST /api/auth/register ───────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email y contraseña requeridos' });
    if (password.length < 8)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

    // 1. Crear usuario en Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authErr) return res.status(400).json({ error: authErr.message });

    // 2. Insertar en tabla users
    const { data: user, error: userErr } = await supabase
      .from('users')
      .insert({ id: authData.user.id, email })
      .select()
      .single();
    if (userErr) throw userErr;

    // 3. Provisionar Twilio + Vapi en background (no bloquea el registro)
    setImmediate(async () => {
      try {
        logger.info(`Provisionando Twilio+Vapi para ${email}`);

        const twilio = await twilioSvc.createSubAccount(email);
        const encToken = twilioSvc.encrypt(twilio.authToken);
        const phone  = await twilioSvc.buyPhoneNumber(twilio.sid, encToken);
        const vapi   = await vapiSvc.createAssistant(user.id);

        await supabase.from('users').update({
          twilio_account_sid:  twilio.sid,
          twilio_auth_token:   encToken,
          twilio_phone_number: phone,
          vapi_assistant_id:   vapi.id,
        }).eq('id', user.id);

        logger.info(`Provisioning OK para ${email} — número: ${phone}`);
      } catch (err) {
        logger.error(`Provisioning error para ${email}: ${err.message}`);
      }
    });

    // 4. Emitir JWT
    const token = issueToken(user);
    res.status(201).json({
      token,
      user: pick(user, ['id', 'email', 'role', 'plan']),
    });
  } catch (err) { next(err); }
});

// ── POST /api/auth/login ──────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email y contraseña requeridos' });

    // Supabase maneja la verificación del password
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: 'Credenciales inválidas' });

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, email, role, plan, twilio_phone_number, vapi_assistant_id')
      .eq('id', data.user.id)
      .single();
    if (userErr) throw userErr;

    const token = issueToken(user);
    res.json({ token, user });
  } catch (err) { next(err); }
});

// ── GET /api/auth/me ──────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { data } = await supabase
      .from('users')
      .select('id, email, role, plan, twilio_phone_number, vapi_assistant_id, agente_config')
      .eq('id', req.user.id)
      .single();
    res.json(data);
  } catch (err) { next(err); }
});

// ── Helpers ───────────────────────────────────────────────────────
function issueToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]));

module.exports = router;
