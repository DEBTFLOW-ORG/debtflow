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
import audioop
import base64
import io
import json
import logging
import sys
import tempfile
import time
from typing import Dict

import httpx
import uvicorn
from fastapi import FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import PlainTextResponse, JSONResponse
from pydub import AudioSegment

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
    handlers=[logging.StreamHandler(sys.stdout)],
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

    def __init__(self, call_sid: str):
        self.call_sid = call_sid
        self.audio_buffer = AudioBuffer()
        self.history: list = []
        self.processing = False
        self.connected_at = time.time()
        self.last_activity = time.time()
        self.message_count = 0

    def add_to_history(self, role: str, content: str):
        """Agrega un mensaje al historial de la conversación."""
        self.history.append({"role": role, "content": content})
        # Mantener historial manejable (últimos 20 mensajes)
        if len(self.history) > 20:
            self.history = self.history[-20:]


# Estado de las llamadas activas
call_states: Dict[str, CallState] = {}


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

        # Crear estado de la llamada
        call_states[call_sid] = CallState(call_sid)

        # Generar URL pública para el WebSocket
        public_url = Config.PUBLIC_URL
        if not public_url:
            # Fallback: usar la URL del request
            host = request.headers.get("host", "localhost:8000")
            scheme = "https" if request.headers.get("x-forwarded-proto") == "https" else "http"
            public_url = f"{scheme}://{host}"

        # Generar respuesta TwiML
        welcome_msg = f"Hola, soy {Config.AGENT_NAME}. ¿En qué puedo ayudarte?"
        twiml = twilio_service.generate_voice_response(public_url, welcome_msg)

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

                logger.info(f"Stream iniciado: call_sid={call_sid}, stream_sid={stream_sid}")

                # Recuperar o crear estado
                if call_sid not in call_states:
                    call_states[call_sid] = CallState(call_sid)
                call_state = call_states[call_sid]

                # Enviar mensaje de bienvenida
                if welcome_message:
                    await process_and_respond(
                        websocket, call_sid, welcome_message, is_welcome=True
                    )

            # -----------------------------------------------------------------
            # EVENTO: MEDIA (audio del usuario)
            # -----------------------------------------------------------------
            elif event_type == "media":
                if not call_sid or call_sid not in call_states:
                    continue

                call_state = call_states[call_sid]

                # Evitar procesamiento concurrente
                if call_state.processing:
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
                end_of_utterance = call_state.audio_buffer.add_chunk(pcm_bytes)

                if end_of_utterance:
                    audio = call_state.audio_buffer.get_audio()

                    # Ignorar utterancias muy cortas
                    duration_ms = AudioBuffer().duration_ms
                    if len(audio) < 3200:  # < 200ms
                        logger.debug("Utterancia muy corta, ignorando")
                        continue

                    call_state.processing = True
                    call_state.last_activity = time.time()

                    # Procesar en background para no bloquear el WebSocket
                    asyncio.create_task(
                        process_user_audio(websocket, call_sid, audio)
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
                    duration = time.time() - call_states[call_sid].connected_at
                    msg_count = call_states[call_sid].message_count
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

    except WebSocketDisconnect:
        logger.info(f"WebSocket desconectado: {call_sid}")
    except Exception as e:
        logger.error(f"Error en WebSocket: {e}")
    finally:
        if call_sid and call_sid in call_states:
            del call_states[call_sid]
        try:
            await websocket.close()
        except Exception:
            pass


# ============================================================================
# PROCESAMIENTO DE AUDIO
# ============================================================================

async def process_user_audio(
    websocket: WebSocket, call_sid: str, pcm_bytes: bytes
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
            transcription, call_state.history
        )

        # Actualizar historial
        call_state.add_to_history("user", transcription)
        call_state.add_to_history("assistant", response_text)
        call_state.message_count += 1

        # 4. Text-to-Speech (ElevenLabs)
        audio_response = await elevenlabs_service.text_to_speech(response_text)

        # 5. Convertir MP3 → mulaw 8kHz (formato de Twilio)
        mulaw_audio = await convert_mp3_to_mulaw(audio_response)

        if not mulaw_audio:
            logger.error("Error convirtiendo audio para Twilio")
            call_state.processing = False
            return

        # 6. Enviar audio a Twilio por WebSocket
        await send_audio_to_twilio(websocket, mulaw_audio)

        logger.info(f"Respuesta enviada: '{response_text[:80]}...'")

    except Exception as e:
        logger.error(f"Error procesando audio: {e}")
    finally:
        call_state.processing = False


async def process_and_respond(
    websocket: WebSocket,
    call_sid: str,
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
        if not is_welcome:
            if call_sid not in call_states:
                return
            call_state = call_states[call_sid]
            call_state.add_to_history("assistant", message)

        # Generar TTS
        audio_response = await elevenlabs_service.text_to_speech(message)
        mulaw_audio = await convert_mp3_to_mulaw(audio_response)

        if mulaw_audio:
            await send_audio_to_twilio(websocket, mulaw_audio)

    except Exception as e:
        logger.error(f"Error en process_and_respond: {e}")


# ============================================================================
# UTILIDADES DE AUDIO
# ============================================================================

async def convert_mp3_to_mulaw(mp3_bytes: bytes) -> bytes:
    """
    Convierte audio MP3 a mulaw 8kHz (formato requerido por Twilio).

    Pipeline:
      MP3 → PCM 16-bit → Resample 8kHz → mulaw

    Args:
        mp3_bytes: Audio en formato MP3

    Returns:
        Audio en formato mulaw 8kHz
    """
    try:
        # Cargar MP3 con pydub
        audio = AudioSegment.from_mp3(io.BytesIO(mp3_bytes))

        # Convertir a mono si es estéreo
        if audio.channels > 1:
            audio = audio.set_channels(1)

        # Resamplear a 8kHz
        audio = audio.set_frame_rate(8000)

        # Asegurar 16-bit
        audio = audio.set_sample_width(2)

        # Exportar como PCM WAV
        pcm_buffer = io.BytesIO()
        audio.export(pcm_buffer, format="wav")
        pcm_buffer.seek(0)

        # Leer datos PCM
        import wave
        with wave.open(pcm_buffer, "rb") as wav_file:
            pcm_bytes = wav_file.readframes(wav_file.getnframes())

        # Convertir PCM a mulaw
        mulaw_bytes = audioop.lin2ulaw(pcm_bytes, 2)
        return mulaw_bytes

    except Exception as e:
        logger.error(f"Error convirtiendo MP3 a mulaw: {e}")
        return b""


async def send_audio_to_twilio(websocket: WebSocket, mulaw_bytes: bytes):
    """
    Envía audio al WebSocket de Twilio en el formato correcto.

    Twilio espera mensajes JSON con el audio en base64.
    Cada chunk debe ser 320 bytes de mulaw (20ms @ 8kHz), codificado en base64.

    Args:
        websocket: Conexión WebSocket
        mulaw_bytes: Audio en formato mulaw
    """
    try:
        # Twilio Media Streams: cada chunk = 320 bytes de mulaw = 20ms @ 8kHz
        chunk_size = 320  # bytes de mulaw crudos

        for i in range(0, len(mulaw_bytes), chunk_size):
            chunk = mulaw_bytes[i : i + chunk_size]
            payload = base64.b64encode(chunk).decode("utf-8")

            message = {
                "event": "media",
                "media": {"payload": payload},
            }
            await websocket.send_text(json.dumps(message))

        # Enviar mark para sincronización (Twilio confirma cuando terminó de reproducir)
        mark_message = {
            "event": "mark",
            "mark": {"name": f"response_{int(time.time())}"},
        }
        await websocket.send_text(json.dumps(mark_message))

    except Exception as e:
        logger.error(f"Error enviando audio a Twilio: {e}")


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
