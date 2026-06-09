"""
Servicio de Twilio para el Agente de Voz.
Maneja:
  - Generación de TwiML (instrucciones XML para Twilio)
  - Conversión de audio (mulaw <-> PCM)
  - Helpers para webhooks
"""

import audioop
import base64
import io
import logging
import struct
import wave

from config import Config

logger = logging.getLogger(__name__)


class TwilioService:
    """Utilidades para interactuar con Twilio."""

    @staticmethod
    def generate_voice_response(
        public_url: str, welcome_message: str = "Bienvenido"
    ) -> str:
        """
        Genera TwiML para conectar una llamada al WebSocket de Media Streams.

        Args:
            public_url: URL pública del servidor (para el WebSocket)
            welcome_message: Mensaje de bienvenida (opcional)

        Returns:
            String XML con instrucciones TwiML
        """
        # Construir la URL del WebSocket
        ws_url = public_url.replace("https://", "wss://").replace("http://", "ws://")
        stream_url = f"{ws_url}/stream"

        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="{stream_url}">
            <Parameter name="welcome" value="{welcome_message}" />
        </Stream>
    </Connect>
</Response>"""

        return twiml

    @staticmethod
    def generate_hangup_response(message: str = None) -> str:
        """
        Genera TwiML para despedirse y colgar.

        Args:
            message: Mensaje final antes de colgar (opcional)

        Returns:
            String XML TwiML
        """
        twiml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<Response>"

        if message:
            twiml += f'\n    <Say voice="Polly.Conchita">{message}</Say>'

        twiml += "\n    <Hangup/>\n</Response>"
        return twiml

    @staticmethod
    def generate_say_response(message: str) -> str:
        """
        Genera TwiML para reproducir un mensaje con TTS nativo de Twilio.
        Útil como fallback si ElevenLabs falla.

        Args:
            message: Texto a reproducir

        Returns:
            String XML TwiML
        """
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Conchita" language="es-ES">{message}</Say>
    <Pause length="1"/>
</Response>"""

    @staticmethod
    def decode_mulaw(audio_data: str) -> bytes:
        """
        Decodifica audio mulaw (formato de Twilio) a PCM lineal.

        Twilio Media Streams envía audio en formato mulaw a 8kHz,
        codificado en base64 dentro de un frame JSON.

        Args:
            audio_data: String base64 con audio mulaw

        Returns:
            Bytes de audio PCM 16-bit little-endian
        """
        try:
            mulaw_bytes = base64.b64decode(audio_data)
            pcm_bytes = audioop.ulaw2lin(mulaw_bytes, 2)  # 16-bit
            return pcm_bytes
        except Exception as e:
            logger.error(f"Error decodificando mulaw: {e}")
            return b""

    @staticmethod
    def encode_mulaw(pcm_bytes: bytes) -> str:
        """
        Codifica audio PCM a mulaw y luego a base64 (para enviar a Twilio).

        Args:
            pcm_bytes: Audio PCM 16-bit little-endian

        Returns:
            String base64 con audio mulaw
        """
        try:
            mulaw_bytes = audioop.lin2ulaw(pcm_bytes, 2)
            return base64.b64encode(mulaw_bytes).decode("utf-8")
        except Exception as e:
            logger.error(f"Error codificando a mulaw: {e}")
            return ""

    @staticmethod
    def pcm_to_wav(pcm_bytes: bytes, sample_rate: int = 8000) -> bytes:
        """
        Convierte bytes PCM a un archivo WAV completo.

        Args:
            pcm_bytes: Audio PCM 16-bit little-endian
            sample_rate: Frecuencia de muestreo (default 8000)

        Returns:
            Bytes del archivo WAV
        """
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(pcm_bytes)

        buffer.seek(0)
        return buffer.read()

    @staticmethod
    def resample_audio(
        pcm_bytes: bytes, in_rate: int = 8000, out_rate: int = 16000
    ) -> bytes:
        """
        Cambia la frecuencia de muestreo del audio PCM.
        Whisper necesita 16kHz, Twilio usa 8kHz.

        Args:
            pcm_bytes: Audio PCM 16-bit
            in_rate: Frecuencia de entrada
            out_rate: Frecuencia de salida

        Returns:
            Audio PCM con la nueva frecuencia
        """
        if in_rate == out_rate:
            return pcm_bytes

        try:
            return audioop.ratecv(
                pcm_bytes,
                2,  # 16-bit
                1,  # Mono
                in_rate,
                out_rate,
                None,
            )[0]
        except Exception as e:
            logger.error(f"Error resampleando: {e}")
            return pcm_bytes

    @staticmethod
    def is_silence(pcm_bytes: bytes, threshold: int = 500) -> bool:
        """
        Detecta si un chunk de audio es silencio.

        Args:
            pcm_bytes: Audio PCM 16-bit
            threshold: Umbral de RMS por debajo del cual se considera silencio

        Returns:
            True si es silencio
        """
        if len(pcm_bytes) < 2:
            return True

        try:
            rms = audioop.rms(pcm_bytes, 2)
            return rms < threshold
        except Exception:
            return True

    @staticmethod
    def validate_twilio_request(
        url: str, post_vars: dict, signature: str
    ) -> bool:
        """
        Valida que un request de webhook venga realmente de Twilio.
        (Seguridad recomendada para producción)

        Args:
            url: URL completa del endpoint
            post_vars: Parámetros POST
            signature: Header X-Twilio-Signature

        Returns:
            True si la firma es válida
        """
        try:
            from twilio.request_validator import RequestValidator

            validator = RequestValidator(Config.TWILIO_AUTH_TOKEN)
            return validator.validate(url, post_vars, signature)
        except Exception as e:
            logger.error(f"Error validando request Twilio: {e}")
            return False


class AudioBuffer:
    """
    Buffer circular para acumular audio del usuario
    y detectar fin de utterancia (silencio).
    """

    def __init__(
        self,
        silence_threshold: int = 500,
        silence_duration_ms: int = 1200,
        sample_rate: int = 8000,
    ):
        self.buffer = bytearray()
        self.silence_threshold = silence_threshold
        self.silence_duration_ms = silence_duration_ms
        self.sample_rate = sample_rate
        self.silence_chunks = 0
        self.is_recording = False
        self.chunks_per_second = sample_rate / 160  # ~50 chunks/seg (320 bytes cada 20ms)
        self.silence_chunks_needed = int(
            (silence_duration_ms / 1000) * self.chunks_per_second
        )

    def add_chunk(self, pcm_bytes: bytes) -> bool:
        """
        Agrega un chunk de audio al buffer.

        Returns:
            True si se detectó fin de utterancia (silencio prolongado)
        """
        is_sil = TwilioService.is_silence(pcm_bytes, self.silence_threshold)

        if not is_sil:
            self.is_recording = True
            self.silence_chunks = 0
        elif self.is_recording:
            self.silence_chunks += 1

        if self.is_recording:
            self.buffer.extend(pcm_bytes)

        # Detectar fin de utterancia: silencio después de hablar
        if self.is_recording and self.silence_chunks >= self.silence_chunks_needed:
            return True

        return False

    def get_audio(self) -> bytes:
        """Obtiene el audio acumulado y limpia el buffer."""
        audio = bytes(self.buffer)
        self.clear()
        return audio

    def clear(self):
        """Limpia el buffer y reinicia el estado."""
        self.buffer = bytearray()
        self.silence_chunks = 0
        self.is_recording = False

    def is_empty(self) -> bool:
        """Verifica si el buffer está vacío."""
        return len(self.buffer) == 0

    def duration_ms(self) -> int:
        """Duración del audio en milisegundos."""
        bytes_per_sample = 2  # 16-bit
        channels = 1  # Mono
        total_samples = len(self.buffer) / (bytes_per_sample * channels)
        return int((total_samples / self.sample_rate) * 1000)
