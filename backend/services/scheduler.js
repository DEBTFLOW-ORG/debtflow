const cron = require('node-cron');
const { supabase } = require('../db/database');
const twilioSvc = require('./twilio');
const logger = require('../utils/logger');

// Frecuencia → minutos mínimos entre intentos
const FREQ_MIN = {
  diaria: 1440,
  cada2dias: 2880,
  cada3dias: 4320,
  semanal: 10080,
  quincenal: 21600,
  mensual: 43200,
};

const DIA_NUM = { dom: 0, lun: 1, mar: 2, mié: 3, jue: 4, vie: 5, sáb: 6 };

function init() {
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    const dowNum = now.getDay();
    const dowKey = Object.keys(DIA_NUM).find(k => DIA_NUM[k] === dowNum);

    try {
      // 1. Consulta a Supabase reemplazando a SQLite
      const { data: deudores, error } = await supabase
        .from('deudores')
        .select(`
          *,
          users!inner (
            twilio_account_sid,
            twilio_auth_token,
            twilio_phone_number,
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
          // Adaptación: dias_semana puede venir como array directamente desde Postgres
          let diasSemana = typeof d.dias_semana === 'string' ? JSON.parse(d.dias_semana) : (d.dias_semana || []);

          if (!shouldCall(d, hhmm, dowKey, now, diasSemana)) continue;

          const maxIntentos = d.max_intentos ?? 3;
          if (d.intentos >= maxIntentos) {
            logger.info(`Deudor ${d.id} alcanzó el límite de intentos, desactivando auto-llamada`);
            await supabase.from('deudores').update({ llamar_auto: false }).eq('id', d.id);
            continue;
          }

          const userVars = d.users; // Relación anidada de Supabase

          const voiceAgentUrl = process.env.VOICE_AGENT_URL?.trim().replace(/\/+$/, '');
          if (!userVars?.twilio_phone_number || !voiceAgentUrl) {
            logger.warn(`Usuario sin servicio telefónico configurado: ${d.user_id}`);
            continue;
          }

          logger.info(`Llamando a ${d.nombre} (${d.tel})`);

          const agenteConfig = typeof userVars.agente_config === 'string'
            ? JSON.parse(userVars.agente_config || '{}')
            : (userVars.agente_config || {});
          const callConfig = {
            ...agenteConfig,
            nombre_deudor: d.nombre,
            acreedor: d.acreedor || '',
            monto: d.monto,
          };
          const configToken = Buffer
            .from(JSON.stringify(callConfig), 'utf8')
            .toString('base64url');
          const twimlUrl = `${voiceAgentUrl}/voice?config=${encodeURIComponent(configToken)}`;

          await twilioSvc.iniciarLlamada(
            userVars.twilio_account_sid,
            userVars.twilio_auth_token,
            userVars.twilio_phone_number,
            d.tel,
            twimlUrl
          );

          // Insertar llamada
          await supabase.from('llamadas').insert([{
            user_id: d.user_id,
            deudor_id: d.id,
            resultado: 'contactado'
          }]);

          // Actualizar intentos
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

function shouldCall(d, hhmm, dowKey, now, diasSemana) {
  if (!d.hora) return false;
  const deudorHora = d.hora.slice(0, 5);
  if (deudorHora !== hhmm) return false;
  if (!Array.isArray(diasSemana) || !diasSemana.includes(dowKey)) return false;
  
  if (d.ultimo_intento) {
    const minsSince = (now - new Date(d.ultimo_intento)) / 60000;
    const minRequired = FREQ_MIN[d.frecuencia] || 1440;
    if (minsSince < minRequired) return false;
  }
  return true;
}

module.exports = { init };
