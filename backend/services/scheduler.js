const cron = require('node-cron');
const jwt = require('jsonwebtoken');
const { supabase } = require('../db/database');
const twilioSvc = require('./twilio');
const vapiSvc = require('./vapi');
const elevenlabsSvc = require('./elevenlabs');
const logger = require('../utils/logger');

const FREQ_MIN = {
  diaria: 1440,
  cada2dias: 2880,
  cada3dias: 4320,
  semanal: 10080,
  quincenal: 21600,
  mensual: 43200,
};

const DIA_KEYS = {
  0: ['dom'],
  1: ['lun'],
  2: ['mar'],
  3: ['mie', 'mi\u00e9'],
  4: ['jue'],
  5: ['vie'],
  6: ['sab', 's\u00e1b'],
};

function init() {
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    const dowNum = now.getDay();
    const dowKeys = DIA_KEYS[dowNum] || [];

    try {
      const { data: deudores, error } = await supabase
        .from('deudores')
        .select(`
          *,
          users!inner (
            twilio_account_sid,
            twilio_auth_token,
            twilio_phone_number,
            vapi_assistant_id,
            agente_config,
            plan
          )
        `)
        .eq('llamar_auto', true)
        .neq('estado', 'cancelado');

      if (error) throw error;
      if (!deudores?.length) return;

      for (const d of deudores) {
        try {
          const diasSemana = typeof d.dias_semana === 'string'
            ? JSON.parse(d.dias_semana)
            : (d.dias_semana || []);

          if (!shouldCall(d, hhmm, dowKeys, now, diasSemana)) continue;

          const maxIntentos = d.max_intentos ?? 3;
          if (d.intentos >= maxIntentos) {
            logger.info(`Deudor ${d.id} alcanzo el limite de intentos, desactivando auto-llamada`);
            await supabase.from('deudores').update({ llamar_auto: false }).eq('id', d.id);
            continue;
          }

          const userVars = d.users;
          const provider = String(process.env.CALL_PROVIDER || 'auto').trim().toLowerCase();
          const useElevenLabs = provider === 'elevenlabs'
            || (provider === 'auto' && elevenlabsSvc.isConfigured());
          const useVapi = !useElevenLabs && provider !== 'twilio' && vapiSvc.isConfigured();
          const voiceAgentUrl = process.env.VOICE_AGENT_URL?.trim().replace(/\/+$/, '');
          if (!useElevenLabs && !useVapi && (!userVars?.twilio_phone_number || !voiceAgentUrl)) {
            logger.warn(`Usuario sin servicio telefonico configurado: ${d.user_id}`);
            continue;
          }

          const agenteConfig = typeof userVars.agente_config === 'string'
            ? JSON.parse(userVars.agente_config || '{}')
            : (userVars.agente_config || {});

          const { data: llamada, error: llamadaError } = await supabase
            .from('llamadas')
            .insert([{
              user_id: d.user_id,
              deudor_id: d.id,
              resultado: 'no_contesta',
              sentimiento: 'neutro',
              transcripcion: [],
            }])
            .select('id')
            .single();

          if (llamadaError) throw llamadaError;

          const backendUrl = (process.env.BACKEND_URL || 'http://127.0.0.1:3001')
            .split('#')[0]
            .trim()
            .replace(/\/+$/, '');

          const callbackToken = jwt.sign(
            { type: 'voice-agent', llamada_id: llamada.id },
            process.env.JWT_SECRET || 'clave_desarrollo_local',
            { expiresIn: '6h' }
          );

          const callConfig = {
            nombre: 'Valentina',
            voice_id: process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL',
            tono: 'cercano, calmo y profesional',
            idioma: 'espanol de Argentina',
            personalidad: 'Sos Valentina, una agente argentina de cobranzas. Hablas natural, corto y con tono humano por telefono.',
            saludo: 'Hola {nombre_deudor}, soy {nombre}, de Debtflow. Te llamo por {acreedor}, por un saldo pendiente de {monto} pesos. Me escuchas bien?',
            ...agenteConfig,
            nombre_deudor: d.nombre,
            acreedor: d.acreedor || '',
            monto: d.monto,
            llamada_id: llamada.id,
            callback_token: callbackToken,
            backend_url: backendUrl,
          };

          logger.info(`Llamando a ${d.nombre} (${d.tel}) via ${useElevenLabs ? 'ElevenLabs' : (useVapi ? 'Vapi' : 'voice-agent')}`);

          let call;
          if (useElevenLabs) {
            call = await elevenlabsSvc.makeOutboundCall({
              toNumber: d.tel,
              dynamicVariables: {
                user_id: d.user_id,
                llamada_id: llamada.id,
                deudor_id: d.id,
                nombre_deudor: d.nombre,
                acreedor: d.acreedor || '',
                monto: String(d.monto || ''),
                telefono_original: d.tel,
                callback_token: callbackToken,
                backend_url: backendUrl,
              },
            });
          } else if (useVapi) {
            const vapiToNumber = normalizePhoneForVapi(d.tel);
            call = await vapiSvc.makeCall({
              assistantId: userVars.vapi_assistant_id,
              toNumber: vapiToNumber,
              config: callConfig,
              metadata: {
                user_id: d.user_id,
                llamada_id: llamada.id,
                deudor_id: d.id,
                nombre_deudor: d.nombre,
                acreedor: d.acreedor || '',
                monto: d.monto,
                telefono_original: d.tel,
                telefono_vapi: vapiToNumber,
              },
            });
            call = await hydrateVapiCallIfSettled(call);
          } else {
            const configToken = Buffer
              .from(JSON.stringify(callConfig), 'utf8')
              .toString('base64url');
            const twimlUrl = `${voiceAgentUrl}/voice?config=${encodeURIComponent(configToken)}`;

            call = await twilioSvc.iniciarLlamada(
              userVars.twilio_account_sid,
              userVars.twilio_auth_token,
              userVars.twilio_phone_number,
              d.tel,
              twimlUrl
            );
          }

          await supabase
            .from('llamadas')
            .update({
              vapi_call_id: call.conversation_id || call.call_sid || call.id || call.sid,
              ...(useVapi && call.status === 'ended' && String(call.endedReason || '').startsWith('call.start.error')
                ? {
                    resultado: 'error',
                    nota: `Vapi no pudo iniciar la llamada: ${call.endedReason}`,
                    finalizada_at: new Date().toISOString(),
                  }
                : {}),
            })
            .eq('id', llamada.id);

          await supabase.from('deudores')
            .update({ intentos: d.intentos + 1, ultimo_intento: now.toISOString() })
            .eq('id', d.id);
        } catch (callErr) {
          logger.error(`Error al llamar a deudor ${d.id}: ${callErr.message}`);
        }
      }
    } catch (err) {
      logger.error('Scheduler error general: ' + err.message);
    }
  });

  logger.info('Scheduler local iniciado exitosamente');
}

function shouldCall(d, hhmm, dowKeys, now, diasSemana) {
  if (!d.hora) return false;
  const deudorHora = d.hora.slice(0, 5);
  if (deudorHora !== hhmm) return false;
  if (!Array.isArray(diasSemana) || !dowKeys.some(key => diasSemana.includes(key))) return false;

  if (d.ultimo_intento) {
    const minsSince = (now - new Date(d.ultimo_intento)) / 60000;
    const minRequired = FREQ_MIN[d.frecuencia] || 1440;
    if (minsSince < minRequired) return false;
  }
  return true;
}

module.exports = { init };

function normalizePhoneForVapi(phone) {
  const value = String(phone || '').trim().replace(/[^\d+]/g, '');
  return value;
}

async function hydrateVapiCallIfSettled(call) {
  if (!call?.id) return call;
  await new Promise(resolve => setTimeout(resolve, 2500));
  try {
    return await vapiSvc.getCall(call.id);
  } catch {
    return call;
  }
}
