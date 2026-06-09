"""
Configuración centralizada del Agente de Voz IA.
Carga todas las variables de entorno con valores por defecto.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Cargar variables de entorno del archivo .env si existe
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)


class Config:
    """Configuración global del agente."""

    # Servidor
    PORT: int = int(os.getenv("PORT", "8000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    PUBLIC_URL: str = os.getenv("PUBLIC_URL", "")

    # OpenAI
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "whisper-1")

    # ElevenLabs
    ELEVENLABS_API_KEY: str = os.getenv("ELEVENLABS_API_KEY", "")
    ELEVENLABS_VOICE_ID: str = os.getenv(
        "ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL"
    )
    ELEVENLABS_MODEL: str = os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2")

    # Twilio
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_PHONE_NUMBER: str = os.getenv("TWILIO_PHONE_NUMBER", "")

    # Agente
    AGENT_NAME: str = os.getenv("AGENT_NAME", "Asistente")
    AGENT_LANGUAGE: str = os.getenv("AGENT_LANGUAGE", "es")
    SYSTEM_PROMPT: str = os.getenv(
        "SYSTEM_PROMPT",
        (
            "Eres un asistente virtual amable y profesional. "
            "Respondes en español de manera clara y concisa. "
            "Tu objetivo es ayudar al usuario con sus consultas de la mejor manera posible. "
            "Mantén respuestas cortas y naturales para una conversación por voz. "
            "No uses listas numeradas ni formatos complejos. "
            "Responde como en una conversación telefónica natural."
        ),
    )

    # Logs
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    @classmethod
    def validate(cls) -> list[str]:
        """Valida que todas las variables críticas estén configuradas."""
        errors = []
        if not cls.OPENAI_API_KEY:
            errors.append("OPENAI_API_KEY no está configurada")
        if not cls.ELEVENLABS_API_KEY:
            errors.append("ELEVENLABS_API_KEY no está configurada")
        if not cls.TWILIO_ACCOUNT_SID:
            errors.append("TWILIO_ACCOUNT_SID no está configurada")
        if not cls.TWILIO_AUTH_TOKEN:
            errors.append("TWILIO_AUTH_TOKEN no está configurada")
        if not cls.TWILIO_PHONE_NUMBER:
            errors.append("TWILIO_PHONE_NUMBER no está configurada")
        return errors

    @classmethod
    def is_configured(cls) -> bool:
        """Verifica si la configuración es válida."""
        return len(cls.validate()) == 0
