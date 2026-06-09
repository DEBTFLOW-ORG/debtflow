"""
Servicio de OpenAI para el Agente de Voz.
Maneja:
  - Speech-to-Text (STT) vía Whisper
  - Chat completions vía GPT-4/GPT-3.5
  - Streaming de respuestas del LLM
"""

import io
import logging
from typing import AsyncGenerator

from openai import AsyncOpenAI
from config import Config

logger = logging.getLogger(__name__)


class OpenAIService:
    """Cliente asíncrono de OpenAI para STT + LLM."""

    def __init__(self):
        self.client = AsyncOpenAI(api_key=Config.OPENAI_API_KEY)
        self.model = Config.OPENAI_MODEL
        self.system_prompt = Config.SYSTEM_PROMPT

    async def transcribe_audio(self, audio_bytes: bytes, filename: str = "audio.wav") -> str:
        """
        Transcribe audio a texto usando Whisper.

        Args:
            audio_bytes: Audio en formato bytes (WAV, MP3, etc.)
            filename: Nombre del archivo para identificación

        Returns:
            Texto transcrito
        """
        try:
            buffer = io.BytesIO(audio_bytes)
            buffer.name = filename

            logger.info(f"Transcribiendo audio ({len(audio_bytes)} bytes)...")

            transcript = await self.client.audio.transcriptions.create(
                model=Config.WHISPER_MODEL,
                file=buffer,
                language=Config.AGENT_LANGUAGE,
                response_format="text",
            )

            text = transcript.strip() if isinstance(transcript, str) else transcript.text.strip()
            logger.info(f"Transcripción: '{text}'")
            return text

        except Exception as e:
            logger.error(f"Error en transcripción: {e}")
            return ""

    async def get_chat_response(self, user_message: str, conversation_history: list = None) -> str:
        """
        Obtiene respuesta del LLM para un mensaje de usuario.

        Args:
            user_message: Mensaje del usuario
            conversation_history: Lista de mensajes previos (alternando user/assistant)

        Returns:
            Respuesta del asistente en texto plano
        """
        messages = [{"role": "system", "content": self.system_prompt}]

        if conversation_history:
            messages.extend(conversation_history)

        messages.append({"role": "user", "content": user_message})

        try:
            logger.info(f"Enviando a GPT ({self.model}): '{user_message[:100]}...'")

            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                max_tokens=300,
            )

            content = response.choices[0].message.content.strip()
            logger.info(f"Respuesta GPT: '{content[:100]}...'")
            return content

        except Exception as e:
            logger.error(f"Error en chat completion: {e}")
            return "Lo siento, hubo un error procesando tu mensaje. ¿Podrías repetirlo?"

    async def stream_chat_response(
        self, user_message: str, conversation_history: list = None
    ) -> AsyncGenerator[str, None]:
        """
        Obtiene respuesta del LLM en streaming (token por token).
        Útil para mostrar progreso o acumular antes de TTS.

        Args:
            user_message: Mensaje del usuario
            conversation_history: Lista de mensajes previos

        Yields:
            Tokens de texto (chunks) de la respuesta
        """
        messages = [{"role": "system", "content": self.system_prompt}]

        if conversation_history:
            messages.extend(conversation_history)

        messages.append({"role": "user", "content": user_message})

        try:
            logger.info(f"Streaming GPT ({self.model}): '{user_message[:100]}...'")

            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                max_tokens=300,
                stream=True,
            )

            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except Exception as e:
            logger.error(f"Error en streaming: {e}")
            yield "Lo siento, hubo un error. ¿Podrías repetirlo?"

    def create_memory_message(self, role: str, content: str) -> dict:
        """Crea un mensaje formateado para el historial de conversación."""
        return {"role": role, "content": content}
