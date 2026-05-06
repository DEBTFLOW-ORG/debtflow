const cron     = require('node-cron');
const { supabase } = require('./supabase');
const vapiSvc  = require('./vapi');
const logger   = require('../utils/logger');

// Frecuencia → minutos mínimos entre intentos
const FREQ_MIN = {
  diaria:    1440,
  cada2dias: 2880,
  cada3dias: 4320,
  semanal:   10080,
  quincenal: 21600,
  mensual:   43200,
};

// Nombre del día → número JS (0=domingo)
const DIA_NUM = { dom:0, lun:1, mar:2, 'mié':3, jue:4, vie:5, sáb:6 };

function init() {
  // Corre cada minuto
  cron.schedule('* * * * *', async () => {
    const now    = new Date();
    const hhmm   = now.toTimeString().slice(0, 5);   // "10:00"
    const dowNum = now.getDay();
    const dowKey = Object.keys(DIA_NUM).find(k => DIA_NUM[k] === dowNum);

    try {
      // Traer deudores con llamarAuto activo y su usuario
      const { data: deudores, error } = await supabase
        .from('deudores')
        .select(`
          id, nombre, tel, monto, acreedor,
          frecuencia, hora, dias_semana,
          intentos, max_intentos, ultimo_intento, user_id,
          users!inner (
            twilio_phone_number,
            vapi_assistant_id,
            agente_config,
            plan
          )
        `)
        .eq('llamar_auto', true)
        .neq('estado', 'cancelado');

      if (error) { logger.error('Scheduler DB error: ' + error.message); return; }
      if (!deudores?.length) return;

      for (const d of deudores) {
        try {
          if (!shouldCall(d, hhmm, dowKey, now)) continue;

          // Verificar límite de intentos
          const maxIntentos = d.max_intentos ?? 3;
          if (d.intentos >= maxIntentos) {
            logger.info(`Deudor ${d.id} alcanzó el límite de ${maxIntentos} intentos, desactivando auto-llamada`);
            await supabase.from('deudores').update({ llamar_auto: false }).eq('id', d.id);
            continue;
          }

          const user = d.users;
          if (!user.vapi_assistant_id || !user.twilio_phone_number) {
            logger.warn(`Usuario sin Twilio/Vapi configurado: ${d.user_id}`);
            continue;
          }

          logger.info(`Llamando a ${d.nombre} (${d.tel})`);

          const call = await vapiSvc.makeCall({
            assistantId: user.vapi_assistant_id,
            toNumber:    d.tel,
            fromNumber:  user.twilio_phone_number,
            metadata: {
              nombre_deudor: d.nombre,
              acreedor:      d.acreedor || '',
              monto:         d.monto,
              deudor_id:     d.id,
              user_id:       d.user_id,
            },
          });

          // Registrar la llamada en la DB (pendiente hasta que llegue el webhook)
          await supabase.from('llamadas').insert({
            user_id:      d.user_id,
            deudor_id:    d.id,
            vapi_call_id: call.id,
          });

          // Actualizar intentos
          await supabase.from('deudores').update({
            intentos:      d.intentos + 1,
            ultimo_intento: now.toISOString(),
          }).eq('id', d.id);

        } catch (callErr) {
          logger.error(`Error al llamar a deudor ${d.id}: ${callErr.message}`);
        }
      }
    } catch (err) {
      logger.error('Scheduler error general: ' + err.message);
    }
  });

  logger.info('Scheduler iniciado');
}

function shouldCall(d, hhmm, dowKey, now) {
  if (!d.hora) return false;
  // Hora exacta
  const deudorHora = d.hora.slice(0, 5);
  if (deudorHora !== hhmm) return false;
  // Día habilitado
  if (!d.dias_semana?.includes(dowKey)) return false;
  // Cooldown según frecuencia
  if (d.ultimo_intento) {
    const minsSince   = (now - new Date(d.ultimo_intento)) / 60000;
    const minRequired = FREQ_MIN[d.frecuencia] || 1440;
    if (minsSince < minRequired) return false;
  }
  return true;
}

module.exports = { init };
