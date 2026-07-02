const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../db/database');
const vapiSvc = require('../services/vapi');

router.use(requireAuth);

const ALLOWED = [
  'nombre','voice_id','tono','idioma',
  'personalidad','saludo','objecion','cierre',
];

router.get('/', async (req, res, next) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('agente_config, vapi_assistant_id, twilio_phone_number')
      .eq('id', req.user.id)
      .single();

    if (error || !user) return res.status(404).json({ error: 'Usuario no encontrado' });

    let agente_config = {};
    try {
      agente_config = user.agente_config ? (typeof user.agente_config === 'string' ? JSON.parse(user.agente_config) : user.agente_config) : {};
    } catch {
      agente_config = {};
    }

    res.json({
      agente_config,
      vapi_assistant_id: user.vapi_assistant_id,
      twilio_phone_number: user.twilio_phone_number
    });
  } catch (e) { next(e); }
});

router.put('/', async (req, res, next) => {
  try {
    const config = Object.fromEntries(
      ALLOWED.filter(k => k in req.body).map(k => [k, req.body[k]])
    );

    const configStr = JSON.stringify(config);

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('vapi_assistant_id')
      .eq('id', req.user.id)
      .single();

    if (userError) throw userError;

    let vapiAssistantId = user?.vapi_assistant_id || null;
    if (vapiSvc.isConfigured()) {
      if (vapiAssistantId) {
        await vapiSvc.updateAssistant(vapiAssistantId, config);
      } else {
        const assistant = await vapiSvc.createAssistant(req.user.id, config);
        vapiAssistantId = assistant.id;
      }
    }

    const updatePayload = { agente_config: configStr };
    if (vapiAssistantId) updatePayload.vapi_assistant_id = vapiAssistantId;

    const { error: updateError } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', req.user.id);

    if (updateError) throw updateError;

    res.json({ ok: true, vapi_assistant_id: vapiAssistantId });
  } catch (e) { next(e); }
});

module.exports = router;
