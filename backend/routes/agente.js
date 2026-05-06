const router          = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { supabase }    = require('../services/supabase');
const vapiSvc         = require('../services/vapi');

router.use(requireAuth);

const ALLOWED = [
  'nombre','tono','voz','idioma','modelo',
  'personalidad','saludo','objecion','cierre',
];

// GET /api/agente
router.get('/', async (req, res, next) => {
  try {
    const { data } = await supabase
      .from('users')
      .select('agente_config, vapi_assistant_id, twilio_phone_number')
      .eq('id', req.user.id)
      .single();
    res.json(data);
  } catch (e) { next(e); }
});

// PUT /api/agente
router.put('/', async (req, res, next) => {
  try {
    const config = Object.fromEntries(
      ALLOWED.filter(k => k in req.body).map(k => [k, req.body[k]])
    );

    const { data: user } = await supabase
      .from('users')
      .update({ agente_config: config })
      .eq('id', req.user.id)
      .select('vapi_assistant_id')
      .single();

    // Sincronizar con Vapi (best-effort, no falla si Vapi falla)
    if (user?.vapi_assistant_id) {
      vapiSvc.updateAssistant(user.vapi_assistant_id, config).catch(() => {});
    }

    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
