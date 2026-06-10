const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { supabase } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const twilioSvc = require('../services/twilio');

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error || !user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = issueToken(user);
    delete user.password_hash; // Removemos el hash antes de enviarlo
    res.json({ token, user });
  } catch (err) { next(err); }
});

router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || password?.length < 8) {
      return res.status(400).json({ error: 'Datos inválidos (password min 8 caracteres)' });
    }

    const { data: existente } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existente) return res.status(400).json({ error: 'El email ya está registrado' });

    const hash = await bcrypt.hash(password, 10);

    // 1. Dejamos que Supabase genere el 'id' automáticamente y creamos el usuario
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([{ email, password_hash: hash }])
      .select('id, email, role, plan, twilio_phone_number')
      .single();
      
    if (error) throw error;

    // 2. Usamos directamente TUS credenciales maestras (sin crear subcuentas)
    try {
      const masterSid = process.env.TWILIO_MASTER_ACCOUNT_SID;
      const masterToken = process.env.TWILIO_MASTER_AUTH_TOKEN;
      const masterPhone = process.env.TWILIO_PHONE_NUMBER;

      // Encriptamos el token para guardarlo seguro
      const encToken = twilioSvc.encrypt(masterToken);

      // Guardamos tus datos maestros en el usuario
      const { data: updatedUser } = await supabase
        .from('users')
        .update({
          twilio_account_sid: masterSid,
          twilio_auth_token: encToken,
          twilio_phone_number: masterPhone
        })
        .eq('id', newUser.id)
        .select('id, email, role, plan, twilio_phone_number')
        .single();

      if (updatedUser) {
        newUser.twilio_phone_number = updatedUser.twilio_phone_number;
      }
    } catch (twilioErr) {
      console.error("Error asignando Twilio:", twilioErr);
    }

    const token = issueToken(newUser);
    res.status(201).json({ token, user: newUser });
  } catch (err) { next(err); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, role, plan, twilio_phone_number')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;
    res.json(user);
  } catch (err) { next(err); }
});

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET || 'clave_desarrollo_local', { expiresIn: '7d' });
}

module.exports = router;