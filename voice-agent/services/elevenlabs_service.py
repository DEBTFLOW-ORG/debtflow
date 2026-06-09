"""
Servicio de ElevenLabs para Text-to-Speech (TTS).
Convierte texto del LLM a audio realista para Twilio.
"""

import io
import logging
from typing import Optional

import httpx
from config import Config

logger = logging.getLogger(__name__)


class ElevenLabsService:
    """Cliente de ElevenLabs para generación de voz."""

    API_BASE = "https://api.elevenlabs.io/v1"

    def __init__(self):
        self.api_key = Config.ELEVENLABS_API_KEY
        self.voice_id = Config.ELEVENLABS_VOICE_ID
        self.model = Config.ELEVENLABS_MODEL
        self.headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json",
        }

    async def text_to_speech(
        self, text: str, voice_id: Optional[str] = None
    ) -> bytes:
        """
        Convierte texto a audio (bytes) usando ElevenLabs.

        Args:
            text: Texto a convertir a voz
            voice_id: ID de voz opcional (usa el default si no se especifica)

        Returns:
            Audio en formato bytes (MP3)
        """
        voice = voice_id or self.voice_id

        payload = {
            "text": text,
            "model_id": self.model,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
                "style": 0.3,
                "use_speaker_boost": True,
            },
        }

        url = f"{self.API_BASE}/text-to-speech/{voice}"

        try:
            logger.info(f"Generando TTS para: '{text[:80]}...' (voz: {voice})")

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    url, headers=self.headers, json=payload
                )
                response.raise_for_status()

                audio_bytes = response.content
                logger.info(f"Audio generado: {len(audio_bytes)} bytes")
                return audio_bytes

        except httpx.HTTPStatusError as e:
            logger.error(f"Error HTTP de ElevenLabs: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Error en TTS: {e}")
            raise

    async def text_to_speech_stream(
        self, text: str, voice_id: Optional[str] = None
    ) -> io.BytesIO:
        """
        Convierte texto a audio y retorna un buffer.

        Args:
            text: Texto a convertir
            voice_id: ID de voz opcional

        Returns:
            BytesIO con el audio en formato MP3
        """
        audio_bytes = await self.text_to_speech(text, voice_id)
        return io.BytesIO(audio_bytes)

    async def get_available_voices(self) -> list[dict]:
        """
        Obtiene la lista de voces disponibles en la cuenta.

        Returns:
            Lista de diccionarios con información de cada voz
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.API_BASE}/voices",
                    headers={"xi-api-key": self.api_key},
                )
                response.raise_for_status()
                data = response.json()

                voices = []
                for voice in data.get("voices", []):
                    voices.append({
                        "voice_id": voice["voice_id"],
                        "name": voice["name"],
                        "preview_url": voice.get("preview_url", ""),
                        "labels": voice.get("labels", {}),
                    })

                logger.info(f"Voces disponibles: {len(voices)}")
                return voices

        except Exception as e:
            logger.error(f"Error obteniendo voces: {e}")
            return []

    async def text_to_speech_with_timestamps(
        self, text: str, voice_id: Optional[str] = None
    ) -> tuple[bytes, dict]:
        """
        Genera audio con timestamps de alineación de caracteres.

        Args:
            text: Texto a convertir
            voice_id: ID de voz opcional

        Returns:
            Tupla de (audio_bytes, alignment_data)
        """
        voice = voice_id or self.voice_id

        payload = {
            "text": text,
            "model_id": self.model,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
            },
            "output_format": "mp3_44100_128",
        }

        url = f"{self.API_BASE}/text-to-speech/{voice}/with-timestamps"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    url, headers=self.headers, json=payload
                )
                response.raise_for_status()

                # La respuesta incluye audio_base64 y alineación
                data = response.json()
                import base64

                audio_bytes = base64.b64decode(data["audio_base64"])
                alignment = data.get("alignment", {})

                logger.info(f"Audio con timestamps generado: {len(audio_bytes)} bytes")
                return audio_bytes, alignment

        except Exception as e:
            logger.error(f"Error en TTS con timestamps: {e}")
            raise
