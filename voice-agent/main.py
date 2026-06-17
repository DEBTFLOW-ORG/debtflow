"""
Agente de Voz IA - Servidor Principal (FastAPI)

Integra:
  - Twilio (llamadas telefónicas + Media Streams WebSocket)
  - OpenAI Whisper (Speech-to-Text)
  - OpenAI GPT-4 (LLM / procesamiento de lenguaje)
  - ElevenLabs (Text-to-Speech con voz natural)

Flujo de una llamada:
  1. Twilio hace POST a /voice → servidor responde TwiML con URL del WebSocket
  2. Twilio conecta al WebSocket /stream
  3. Audio del usuario llega por WebSocket (formato mulaw 8kHz)
  4. Servidor acumula audio, detecta silencio (fin de utterancia)
  5. Audio se convierte a WAV 16kHz → Whisper lo transcribe
  6. Texto transcrito → GPT-4 genera respuesta
  7. Respuesta → ElevenLabs genera audio (MP3)
  8. Audio MP3 se convierte a mulaw 8kHz → se envía por WebSocket a Twilio
  9. Se repite desde el paso 3

Endpoints:
  POST /voice         - Webhook para llamadas entrantes
  WS  /stream         - Media Stream WebSocket (audio bidireccional)
  GET  /health        - Health check
  GET  /voices        - Lista voces disponibles ElevenLabs
"""

import asyncio
import base64
import json
import logging
import re
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from typing import Dict

import httpx
import uvicorn
from fastapi import FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import PlainTextResponse, JSONResponse
from twilio.rest import Client

from config import Config
from services.elevenlabs_service import ElevenLabsService
from services.openai_service import OpenAIService
from services.twilio_service import AudioBuffer, TwilioService

# ============================================================================
# CONFIGURACIÓN DE LOGS
# ============================================================================

logging.basicConfig(
    level=getattr(logging, Config.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-7s | %(name)-20s | %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("voice-agent.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("voice-agent")

# ============================================================================
# INICIALIZACIÓN
# ============================================================================

app = FastAPI(
    title="Agente de Voz IA",
    description="Integración OpenAI + ElevenLabs + Twilio para conversaciones por voz",
    version="1.0.0",
)

# Validar configuración al inicio
config_errors = Config.validate()
if config_errors:
    for error in config_errors:
        logger.error(f"CONFIG ERROR: {error}")
    logger.warning("Algunas variables de entorno no están configuradas. Revisa tu archivo .env")

# Servicios compartidos (singletons)
openai_service = OpenAIService()
elevenlabs_service = ElevenLabsService()
twilio_service = TwilioService()

# Conversaciones activas (call_sid → historial)
conversations: Dict[str, list] = {}


# ============================================================================
# MODELOS DE ESTADO
# ============================================================================

class CallState:
    """Estado de una llamada activa."""

    def __init__(self, call_sid: str, config: dict | None = None):
        self.call_sid = call_sid
        self.audio_buffer = AudioBuffer()
        self.history: list = []
        self.processing = False
        self.connected_at = time.time()
        self.last_activity = time.time()
        self.message_count = 0
        self.config = config or {}
        self.playing_audio = False
        self.listen_after = 0.0
        self.pending_hangup = False

    def add_to_history(self, role: str, content: str):
        """Agrega un mensaje al historial de la conversación."""
        self.history.append({"role": role, "content": content})
        # Mantener historial manejable (últimos 20 mensajes)
        if len(self.history) > 20:
            self.history = self.history[-20:]


# Estado de las llamadas activas
call_states: Dict[str, CallState] = {}


def decode_call_config(token: str) -> dict:
    if not token:
        return {}
    try:
        padding = "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(token + padding)
        value = json.loads(raw.decode("utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception as exc:
        logger.warning(f"No se pudo leer la configuración de la llamada: {exc}")
        return {}


def render_template(text: str, config: dict) -> str:
    values = {
        "nombre": config.get("nombre") or Config.AGENT_NAME,
        "nombre_deudor": config.get("nombre_deudor") or "usted",
        "acreedor": config.get("acreedor") or "su acreedor",
        "monto": config.get("monto") or "el monto pendiente",
        "fecha": config.get("fecha") or "la fecha acordada",
    }
    rendered = text
    for key, value in values.items():
        rendered = rendered.replace(f"{{{key}}}", str(value))
    return rendered


def build_call_prompt(config: dict) -> str:
    nombre_deudor = config.get("nombre_deudor") or "la persona contactada"
    acreedor = config.get("acreedor") or "el acreedor"
    monto = config.get("monto") or "un monto pendiente no especificado"
    nombre_agente = config.get("nombre") or Config.AGENT_NAME

    return " ".join([
        config.get("personalidad") or Config.SYSTEM_PROMPT,
        (
            f"Vos sos quien está hablando y tu nombre como agente es {nombre_agente}. "
            f"El acreedor es {acreedor}. Son identidades distintas."
        ),
        f"Usá un tono {config.get('tono') or 'profesional'}.",
        f"Respondé siempre en {config.get('idioma') or 'español de Argentina'}.",
        (
            f"Datos confirmados: el deudor es {nombre_deudor}, el acreedor es "
            f"{acreedor} y el saldo pendiente es {monto} pesos."
        ),
        (
            "Usá exactamente esos datos. Nunca reemplaces el monto por "
            "'X cantidad' y no inventes importes."
        ),
        (
            f"Nunca presentes a {nombre_agente} como acreedor ni le digas al deudor "
            f"que debe comunicarse con {nombre_agente}. {nombre_agente} sos vos."
        ),
        "Mantené respuestas de una o dos frases breves y naturales.",
        (
            "Cuando la persona se despida, pida terminar la llamada o ya haya "
            "confirmado claramente un acuerdo final, despedite brevemente y agregá "
            "al final el marcador exacto <FIN_LLAMADA>."
        ),
        "Ante objeciones: "
        + render_template(
            config.get("objecion") or "Proponé un acuerdo de pago posible.",
            config,
        ),
        "Para cerrar: "
        + render_template(
            config.get("cierre") or "Confirmá el acuerdo y despedite amablemente.",
            config,
        ),
    ])


def user_wants_to_end_call(text: str) -> bool:
    normalized = text.lower()
    phrases = (
        "chau",
        "chao",
        "adiós",
        "adios",
        "hasta luego",
        "hasta la próxima",
        "hasta la proxima",
        "cortá",
        "corta la llamada",
        "terminá la llamada",
        "termina la llamada",
        "no me llames",
    )
    return any(phrase in normalized for phrase in phrases)


def transcript_payload(call_state: CallState) -> list[dict]:
    return [
        {
            "quien": "agente" if item["role"] == "assistant" else "deudor",
            "texto": item["content"],
        }
        for item in call_state.history
        if item.get("content")
    ]


def extract_payment_date(text: str, now: datetime | None = None) -> str | None:
    argentina_tz = timezone(timedelta(hours=-3))
    current = now or datetime.now(argentina_tz)

    if "pasado mañana" in text:
        return (current + timedelta(days=2)).strftime("%d/%m/%Y")
    if "mañana" in text:
        return (current + timedelta(days=1)).strftime("%d/%m/%Y")
    if re.search(r"\bhoy\b", text):
        return current.strftime("%d/%m/%Y")

    numeric_date = re.search(
        r"\b(?:el\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b",
        text,
    )
    if numeric_date:
        day, month, year = numeric_date.groups()
        resolved_year = int(year) if year else current.year
        if resolved_year < 100:
            resolved_year += 2000
        try:
            return datetime(
                resolved_year,
                int(month),
                int(day),
                tzinfo=current.tzinfo,
            ).strftime("%d/%m/%Y")
        except ValueError:
            pass

    weekdays = {
        "lunes": 0,
        "martes": 1,
        "miércoles": 2,
        "miercoles": 2,
        "jueves": 3,
        "viernes": 4,
        "sábado": 5,
        "sabado": 5,
        "domingo": 6,
    }
    for label, weekday in weekdays.items():
        if re.search(rf"\b(?:el\s+)?{label}\b", text):
            days_ahead = (weekday - current.weekday()) % 7 or 7
            return (current + timedelta(days=days_ahead)).strftime("%d/%m/%Y")

    return None


def infer_call_summary(call_state: CallState) -> tuple[str, str, str]:
    debtor_text = " ".join(
        item["content"]
        for item in call_state.history
        if item["role"] == "user"
    ).lower()

    negative_payment = re.search(
        r"\b(no puedo|no voy a|no quiero|no pienso|no lo voy a|"
        r"no se lo voy a|no se lo puedo)"
        r".{0,20}\b(pagar|pago|abonar)\b",
        debtor_text,
    )
    payment_promise = re.search(
        r"\b(voy a pagar(?:la|lo)?|lo pago|la pago|te pago|se lo pago|"
        r"pagaré|pagare|pagarla|pagarlo|voy a abonar|abono el|pago el|"
        r"plan es pagar(?:la|lo)?|pienso pagar(?:la|lo)?)\b",
        debtor_text,
    )

    if negative_payment:
        resultado = "contactado"
        sentimiento = "negativo"
        nota = "El deudor fue contactado, pero indicó que no puede o no quiere pagar."
    elif payment_promise:
        resultado = "promesa_pago"
        sentimiento = "positivo"
        payment_date = extract_payment_date(debtor_text)
        nota = "El deudor manifestó una intención concreta de pago."
        if payment_date:
            nota += f" Fecha prometida: {payment_date}."
    elif any(word in debtor_text for word in ("no voy", "no quiero", "molesta", "enoj")):
        resultado = "contactado"
        sentimiento = "negativo"
        nota = "El deudor fue contactado, pero rechazó o mostró resistencia."
    else:
        resultado = "contactado"
        sentimiento = "neutro"
        nota = "El deudor fue contactado."

    return resultado, sentimiento, nota


async def sync_call_record(call_state: CallState, final: bool = False):
    config = call_state.config
    llamada_id = config.get("llamada_id")
    callback_token = config.get("callback_token")
    backend_url = str(config.get("backend_url") or "").rstrip("/")

    if not llamada_id or not callback_token or not backend_url:
        return

    payload = {
        "transcripcion": transcript_payload(call_state),
        "resultado": "contactado",
    }
    if final:
        resultado, sentimiento, nota = infer_call_summary(call_state)
        payload.update({
            "resultado": resultado,
            "sentimiento": sentimiento,
            "nota": nota,
            "duracion_seg": round(time.time() - call_state.connected_at),
            "finalizada_at": time.strftime(
                "%Y-%m-%dT%H:%M:%SZ",
                time.gmtime(),
            ),
        })

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                f"{backend_url}/api/llamadas/internal/{llamada_id}/transcript",
                headers={"x-agent-token": callback_token},
                json=payload,
            )
            response.raise_for_status()
    except Exception as exc:
        logger.error(f"No se pudo guardar la transcripción: {exc}")


# ============================================================================
# ENDPOINTS HTTP
# ============================================================================

@app.get("/")
async def root():
    """Endpoint raíz - información del servicio."""
    return {
        "service": "Agente de Voz IA",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "voice": "POST /voice (webhook Twilio)",
            "stream": "WS /stream (Media Stream)",
            "health": "GET /health",
            "voices": "GET /voices",
        },
    }


@app.get("/health")
async def health_check():
    """Health check - verifica que todo esté funcionando."""
    status = {
        "status": "ok",
        "timestamp": time.time(),
        "active_calls": len(call_states),
        "config_valid": Config.is_configured(),
    }

    if not Config.is_configured():
        status["status"] = "degraded"
        status["config_errors"] = Config.validate()

    return status


@app.get("/voices")
async def list_voices():
    """Lista las voces disponibles en ElevenLabs."""
    try:
        voices = await elevenlabs_service.get_available_voices()
        return {"voices": voices, "count": len(voices)}
    except Exception as e:
        logger.error(f"Error listando voces: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/voice")
async def incoming_call(request: Request):
    """
    Webhook para llamadas entrantes de Twilio.

    Twilio envía un POST a este endpoint cuando alguien llama
    al número configurado. Respondemos con TwiML que conecta
    al WebSocket de Media Streams.
    """
    try:
        form_data = await request.form()
        call_sid = form_data.get("CallSid", "unknown")
        from_number = form_data.get("From", "unknown")
        to_number = form_data.get("To", "unknown")

        logger.info(f"Llamada entrante: SID={call_sid}, De={from_number}, Para={to_number}")

        config_token = request.query_params.get("config", "")
        call_config = decode_call_config(config_token)
        call_states[call_sid] = CallState(call_sid, call_config)

        # Generar URL pública para el WebSocket
        public_url = Config.PUBLIC_URL
        if not public_url:
            # Fallback: usar la URL del request
            host = request.headers.get("host", "localhost:8000")
            scheme = "https" if request.headers.get("x-forwarded-proto") == "https" else "http"
            public_url = f"{scheme}://{host}"

        logger.info(
            "Configuración recibida: token=%s, campos=%s",
            bool(config_token),
            sorted(call_config.keys()),
        )

        default_welcome = (
            "Hola {nombre_deudor}, soy {nombre}, asistente de cobranzas de "
            "{acreedor}. Te llamo por {monto} pesos. "
            "¿Podemos conversar un momento?"
        )
        welcome_msg = render_template(
            call_config.get("saludo") or default_welcome,
            call_config,
        )
        twiml = twilio_service.generate_voice_response(
            public_url,
            welcome_msg,
            config_token,
        )

        logger.info(f"Respondiendo TwiML con WebSocket: {public_url}/stream")
        return PlainTextResponse(content=twiml, media_type="application/xml")

    except Exception as e:
        logger.error(f"Error en webhook /voice: {e}")
        error_twiml = twilio_service.generate_say_response(
            "Lo siento, hubo un error iniciando la llamada. Por favor intenta más tarde."
        )
        return PlainTextResponse(content=error_twiml, media_type="application/xml")


# ============================================================================
# WEBSOCKET - MEDIA STREAM (Audio Bidireccional)
# ============================================================================

@app.websocket("/stream")
async def media_stream(websocket: WebSocket):
    """
    WebSocket para Media Streams de Twilio.

    Este endpoint maneja la comunicación de audio en tiempo real:
    - Recibe audio del usuario (mulaw 8kHz, base64)
    - Envía audio de respuesta (mulaw 8kHz, base64)

    Formato de mensajes de Twilio:
      {"event": "start", ...}    - Inicio de la llamada
      {"event": "media", "media": {"payload": "..."}} - Audio del usuario
      {"event": "stop", ...}     - Fin de la llamada
      {"event": "mark", ...}     - Confirmación de audio reproducido
    """
    await websocket.accept()

    call_sid = None
    call_state = None

    try:
        while True:
            message = await websocket.receive_text()
            data = json.loads(message)
            event_type = data.get("event")

            # -----------------------------------------------------------------
            # EVENTO: START (inicio de llamada)
            # -----------------------------------------------------------------
            if event_type == "start":
                start_data = data.get("start", {})
                call_sid = start_data.get("callSid", "unknown")
                stream_sid = start_data.get("streamSid")
                custom_params = start_data.get("customParameters", {})
                welcome_message = custom_params.get("welcome", "Hola")
                call_config = decode_call_config(custom_params.get("config", ""))

                logger.info(f"Stream iniciado: call_sid={call_sid}, stream_sid={stream_sid}")

                # Recuperar o crear estado
                if call_sid not in call_states:
                    call_states[call_sid] = CallState(call_sid, call_config)
                call_state = call_states[call_sid]
                if call_config:
                    call_state.config = call_config

                # Enviar mensaje de bienvenida
                if welcome_message:
                    await process_and_respond(
                        websocket,
                        call_sid,
                        stream_sid,
                        welcome_message,
                        is_welcome=True,
                    )

            # -----------------------------------------------------------------
            # EVENTO: MEDIA (audio del usuario)
            # -----------------------------------------------------------------
            elif event_type == "media":
                if not call_sid or call_sid not in call_states:
                    continue

                call_state = call_states[call_sid]

                # Evitar procesamiento concurrente
                if (
                    call_state.processing
                    or call_state.playing_audio
                    or time.time() < call_state.listen_after
                ):
                    continue

                # Decodificar audio
                media_data = data.get("media", {})
                payload = media_data.get("payload", "")
                track = media_data.get("track", "inbound")  # inbound = usuario

                if track != "inbound" or not payload:
                    continue

                pcm_bytes = twilio_service.decode_mulaw(payload)
                if not pcm_bytes:
                    continue

                # Acumular audio y detectar fin de utterancia
                was_recording = call_state.audio_buffer.is_recording
                end_of_utterance = call_state.audio_buffer.add_chunk(pcm_bytes)
                if not was_recording and call_state.audio_buffer.is_recording:
                    logger.info(f"Voz detectada: call_sid={call_sid}")

                if end_of_utterance:
                    audio = call_state.audio_buffer.get_audio()
                    logger.info(
                        f"Procesando frase: call_sid={call_sid}, bytes={len(audio)}"
                    )

                    # Ignorar utterancias muy cortas
                    if len(audio) < 3200:  # < 200ms
                        logger.debug("Utterancia muy corta, ignorando")
                        continue

                    call_state.processing = True
                    call_state.last_activity = time.time()

                    # Procesar en background para no bloquear el WebSocket
                    asyncio.create_task(
                        process_user_audio(websocket, call_sid, stream_sid, audio)
                    )

            # -----------------------------------------------------------------
            # EVENTO: STOP (fin de llamada)
            # -----------------------------------------------------------------
            elif event_type == "stop":
                stop_data = data.get("stop", {})
                call_sid = stop_data.get("callSid", call_sid)
                logger.info(f"Stream finalizado: call_sid={call_sid}")

                # Limpiar estado
                if call_sid and call_sid in call_states:
                    final_state = call_states[call_sid]
                    duration = time.time() - final_state.connected_at
                    msg_count = final_state.message_count
                    await sync_call_record(final_state, final=True)
                    logger.info(
                        f"Llamada {call_sid} finalizada: "
                        f"duración={duration:.1f}s, mensajes={msg_count}"
                    )
                    del call_states[call_sid]

                break

            # -----------------------------------------------------------------
            # EVENTO: MARK (confirmación de audio reproducido)
            # -----------------------------------------------------------------
            elif event_type == "mark":
                mark_name = data.get("mark", {}).get("name", "")
                logger.debug(f"Mark recibido: {mark_name}")
                if call_sid and call_sid in call_states:
                    call_state = call_states[call_sid]
                    call_state.playing_audio = False
                    call_state.listen_after = time.time() + 0.35
                    call_state.audio_buffer.clear()
                    logger.info(
                        f"Audio finalizado; escuchando en 0.35s: call_sid={call_sid}"
                    )
                    if call_state.pending_hangup:
                        asyncio.create_task(hangup_call(call_sid))

    except WebSocketDisconnect:
        logger.info(f"WebSocket desconectado: {call_sid}")
    except Exception as e:
        logger.error(f"Error en WebSocket: {e}")
    finally:
        if call_sid and call_sid in call_states:
            await sync_call_record(call_states[call_sid], final=True)
            del call_states[call_sid]
        try:
            await websocket.close()
        except Exception:
            pass


# ============================================================================
# PROCESAMIENTO DE AUDIO
# ============================================================================

async def process_user_audio(
    websocket: WebSocket,
    call_sid: str,
    stream_sid: str,
    pcm_bytes: bytes,
):
    """
    Procesa el audio del usuario: STT → LLM → TTS → Enviar a Twilio.

    Args:
        websocket: Conexión WebSocket activa
        call_sid: ID de la llamada
        pcm_bytes: Audio PCM del usuario
    """
    if call_sid not in call_states:
        return

    call_state = call_states[call_sid]

    try:
        # 1. Convertir PCM 8kHz → WAV 16kHz (para Whisper)
        wav_8k = twilio_service.pcm_to_wav(pcm_bytes, sample_rate=8000)
        pcm_16k = twilio_service.resample_audio(pcm_bytes, 8000, 16000)
        wav_16k = twilio_service.pcm_to_wav(pcm_16k, sample_rate=16000)

        # Guardar temporalmente para Whisper
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(wav_16k)
            tmp_path = tmp.name

        # 2. Speech-to-Text (Whisper)
        with open(tmp_path, "rb") as audio_file:
            audio_data = audio_file.read()

        if len(audio_data) < 100:
            logger.warning("Audio demasiado corto para transcribir")
            call_state.processing = False
            return

        transcription = await openai_service.transcribe_audio(audio_data)

        if not transcription:
            logger.info("No se detectó texto en el audio")
            call_state.processing = False
            return

        logger.info(f"Usuario dijo: '{transcription}'")

        # 3. LLM - Generar respuesta
        response_text = await openai_service.get_chat_response(
            transcription,
            call_state.history,
            build_call_prompt(call_state.config),
        )
        should_hangup = (
            "<FIN_LLAMADA>" in response_text
            or user_wants_to_end_call(transcription)
        )
        response_text = response_text.replace("<FIN_LLAMADA>", "").strip()

        # Actualizar historial
        call_state.add_to_history("user", transcription)
        call_state.add_to_history("assistant", response_text)
        call_state.message_count += 1
        call_state.pending_hangup = should_hangup
        asyncio.create_task(sync_call_record(call_state))

        # 4. Text-to-Speech en μ-law 8 kHz, listo para Twilio
        mulaw_audio = await elevenlabs_service.text_to_speech(
            response_text,
            call_state.config.get("voice_id"),
        )

        if not mulaw_audio:
            logger.error("ElevenLabs no devolvió audio para Twilio")
            call_state.processing = False
            return

        # 5. Enviar audio a Twilio por WebSocket
        await send_audio_to_twilio(
            websocket,
            call_sid,
            stream_sid,
            mulaw_audio,
        )

        logger.info(f"Respuesta enviada: '{response_text[:80]}...'")

    except Exception as e:
        logger.error(f"Error procesando audio: {e}")
    finally:
        call_state.processing = False


async def process_and_respond(
    websocket: WebSocket,
    call_sid: str,
    stream_sid: str,
    message: str,
    is_welcome: bool = False,
):
    """
    Procesa un mensaje (de bienvenida o respuesta) y envía el audio.

    Args:
        websocket: Conexión WebSocket
        call_sid: ID de la llamada
        message: Texto a convertir a voz
        is_welcome: Si es True, no guarda en historial
    """
    try:
        if call_sid not in call_states:
            return
        call_state = call_states[call_sid]
        if not is_welcome:
            call_state.add_to_history("assistant", message)

        # Generar TTS
        voice_id = (
            call_states.get(call_sid).config.get("voice_id")
            if call_sid in call_states
            else None
        )
        mulaw_audio = await elevenlabs_service.text_to_speech(
            message,
            voice_id,
        )

        if mulaw_audio:
            if is_welcome:
                call_state.add_to_history("assistant", message)
                asyncio.create_task(sync_call_record(call_state))
            await send_audio_to_twilio(
                websocket,
                call_sid,
                stream_sid,
                mulaw_audio,
            )

    except Exception as e:
        logger.error(f"Error en process_and_respond: {e}")


# ============================================================================
# UTILIDADES DE AUDIO
# ============================================================================

async def send_audio_to_twilio(
    websocket: WebSocket,
    call_sid: str,
    stream_sid: str,
    mulaw_bytes: bytes,
):
    """
    Envía audio al WebSocket de Twilio en el formato correcto.

    Twilio espera mensajes JSON con el audio en base64.
    Cada chunk debe ser 320 bytes de mulaw (20ms @ 8kHz), codificado en base64.

    Args:
        websocket: Conexión WebSocket
        mulaw_bytes: Audio en formato mulaw
    """
    try:
        if call_sid in call_states:
            call_states[call_sid].playing_audio = True
            call_states[call_sid].audio_buffer.clear()

        # Twilio Media Streams: cada chunk = 320 bytes de mulaw = 20ms @ 8kHz
        chunk_size = 320  # bytes de mulaw crudos

        for i in range(0, len(mulaw_bytes), chunk_size):
            chunk = mulaw_bytes[i : i + chunk_size]
            payload = base64.b64encode(chunk).decode("utf-8")

            message = {
                "event": "media",
                "streamSid": stream_sid,
                "media": {"payload": payload},
            }
            await websocket.send_text(json.dumps(message))

        # Enviar mark para sincronización (Twilio confirma cuando terminó de reproducir)
        mark_message = {
            "event": "mark",
            "streamSid": stream_sid,
            "mark": {"name": f"response_{int(time.time())}"},
        }
        await websocket.send_text(json.dumps(mark_message))

    except Exception as e:
        logger.error(f"Error enviando audio a Twilio: {e}")


async def hangup_call(call_sid: str):
    """Finaliza la llamada después de que Twilio reproduce la despedida."""
    try:
        client = Client(
            Config.TWILIO_ACCOUNT_SID,
            Config.TWILIO_AUTH_TOKEN,
        )
        await asyncio.to_thread(
            client.calls(call_sid).update,
            status="completed",
        )
        logger.info(f"Llamada finalizada por el agente: call_sid={call_sid}")
    except Exception as e:
        logger.error(f"No se pudo finalizar la llamada {call_sid}: {e}")


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    # Validar configuración
    if not Config.is_configured():
        logger.warning("=" * 60)
        logger.warning("CONFIGURACIÓN INCOMPLETA")
        logger.warning("=" * 60)
        for error in Config.validate():
            logger.warning(f"  - {error}")
        logger.warning("Copia .env.example a .env y configura tus API keys")
        logger.warning("=" * 60)

    logger.info(f"Iniciando Agente de Voz IA en http://{Config.HOST}:{Config.PORT}")
    logger.info(f"Modelo LLM: {Config.OPENAI_MODEL}")
    logger.info(f"Voz ElevenLabs: {Config.ELEVENLABS_VOICE_ID}")
    logger.info(f"Número Twilio: {Config.TWILIO_PHONE_NUMBER}")

    uvicorn.run(
        "main:app",
        host=Config.HOST,
        port=Config.PORT,
        reload=Config.DEBUG,
        log_level=Config.LOG_LEVEL.lower(),
    )
