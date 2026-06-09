# Agente de Voz IA - OpenAI + ElevenLabs + Twilio

Sistema de agente de inteligencia artificial por voz que integra tres servicios cloud para crear conversaciones telefónicas naturales y en tiempo real.

## Arquitectura

```
Usuario (Teléfono)
    ↕ (Llamada GSM/VoIP)
Twilio (Red Telefónica)
    ↕ (WebSocket Media Streams)
Servidor FastAPI (Python)
    ├── Whisper (STT) ← OpenAI
    ├── GPT-4o (LLM)  ← OpenAI
    └── ElevenLabs (TTS) → Voz natural
```

## Flujo de Conversación

```
1. Usuario llama al número de Twilio
2. Twilio abre WebSocket /stream con el servidor
3. Audio del usuario (mulaw 8kHz) → Servidor
4. Servidor acumula audio, detecta silencio (fin de frase)
5. Audio → WAV 16kHz → Whisper → Texto
6. Texto → GPT-4 → Respuesta inteligente
7. Respuesta → ElevenLabs → Audio MP3 (voz natural)
8. MP3 → mulaw 8kHz → Twilio → Oído del usuario
9. Repetir desde el paso 3
```

## Requisitos

- Python 3.10+
- Cuenta en [Twilio](https://www.twilio.com) (con número de teléfono)
- Cuenta en [OpenAI](https://platform.openai.com) (con créditos API)
- Cuenta en [ElevenLabs](https://elevenlabs.io) (con API key)
- URL pública para webhooks ([ngrok](https://ngrok.com) en desarrollo)

## Instalación

### 1. Clonar y entrar al proyecto

```bash
cd voice-agent
```

### 2. Crear entorno virtual

```bash
python -m venv venv

# Linux/Mac:
source venv/bin/activate

# Windows:
venv\Scripts\activate
```

### 3. Instalar dependencias

```bash
pip install -r requirements.txt
```

### 4. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus credenciales:

```env
# OpenAI (obtén en https://platform.openai.com/api-keys)
OPENAI_API_KEY=sk-proj-tu-key-aqui

# ElevenLabs (obtén en https://elevenlabs.io/app/settings/api-keys)
ELEVENLABS_API_KEY=tu-key-aqui

# Twilio (obtén en https://console.twilio.com)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890

# URL pública (usar ngrok en desarrollo)
PUBLIC_URL=https://tu-url.ngrok.io
```

## Ejecución

### Desarrollo local (con ngrok)

**Terminal 1 - ngrok (expone tu servidor local):**

```bash
# Descarga ngrok desde https://ngrok.com/download
# Conéctate (una sola vez):
ngrok authtoken TU_AUTHTOKEN

# Ejecuta:
ngrok http 8000
```

Copia la URL HTTPS que muestra ngrok (ej: `https://abc123.ngrok.io`) y ponla en tu `.env` como `PUBLIC_URL`.

**Terminal 2 - Servidor:**

```bash
# Asegúrate de que el entorno virtual esté activado
source venv/bin/activate  # Linux/Mac

# Ejecutar:
python main.py
```

El servidor arrancará en `http://0.0.0.0:8000`.

### Producción

Para producción, despliega en cualquier plataforma que soporte Python:
- [Railway](https://railway.app)
- [Render](https://render.com)
- [Heroku](https://heroku.com)
- [AWS EC2 / ECS](https://aws.amazon.com)
- [DigitalOcean](https://digitalocean.com)
- [Google Cloud Run](https://cloud.google.com/run)

Actualiza `PUBLIC_URL` con tu dominio real.

## Configuración de Twilio

### 1. Comprar un número de teléfono

Ve a [Twilio Console > Phone Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming) y compra un número con capacidad de voz.

### 2. Configurar el webhook de voz

En la configuración del número:
- **When a call comes in**: Webhook, POST
- **URL**: `https://tu-url-publica/voice`

También puedes hacerlo vía API:

```bash
curl -X POST https://api.twilio.com/2010-04-01/Accounts/ACxxxxx/IncomingPhoneNumbers/PNxxxxx.json \
  --data-urlencode "VoiceUrl=https://tu-url-publica/voice" \
  --data-urlencode "VoiceMethod=POST" \
  -u "ACxxxxx:auth_token"
```

### 3. Probar la llamada

Marca tu número de Twilio desde cualquier teléfono. El agente IA contestará con voz natural.

## API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET`  | `/`      | Info del servicio |
| `GET`  | `/health` | Health check + métricas |
| `GET`  | `/voices` | Lista voces disponibles en ElevenLabs |
| `POST` | `/voice` | Webhook de Twilio para llamadas entrantes |
| `WS`   | `/stream` | Media Stream WebSocket (audio bidireccional) |

## Estructura del Proyecto

```
voice-agent/
├── main.py                      # Servidor FastAPI principal
├── config.py                    # Configuración centralizada (.env)
├── requirements.txt             # Dependencias Python
├── .env.example                 # Template de variables de entorno
│
├── services/
│   ├── __init__.py
│   ├── openai_service.py        # OpenAI: Whisper (STT) + GPT (LLM)
│   ├── elevenlabs_service.py    # ElevenLabs: TTS (voz natural)
│   └── twilio_service.py        # Twilio: TwiML + conversión de audio
│
└── README.md                    # Esta documentación
```

## Servicios

### OpenAIService (`services/openai_service.py`)

```python
from services.openai_service import OpenAIService

openai = OpenAIService()

# Speech-to-Text (Whisper)
text = await openai.transcribe_audio(audio_bytes)

# Chat con GPT
response = await openai.get_chat_response("Hola, ¿cómo estás?")

# Streaming (token por token)
async for token in openai.stream_chat_response("Pregunta"):
    print(token, end="")
```

### ElevenLabsService (`services/elevenlabs_service.py`)

```python
from services.elevenlabs_service import ElevenLabsService

tts = ElevenLabsService()

# Text-to-Speech
audio_bytes = await tts.text_to_speech("Hola, ¿en qué puedo ayudarte?")

# Cambiar voz
audio = await tts.text_to_speech("Texto", voice_id="otra_voz_id")

# Listar voces disponibles
voices = await tts.get_available_voices()
```

### TwilioService (`services/twilio_service.py`)

```python
from services.twilio_service import TwilioService, AudioBuffer

twilio = TwilioService()

# Generar TwiML para conectar a WebSocket
twiml = twilio.generate_voice_response("https://tu-url.ngrok.io")

# Decodificar audio de Twilio (mulaw → PCM)
pcm = twilio.decode_mulaw(audio_base64)

# Buffer con detección de silencio
buffer = AudioBuffer()
end_of_speech = buffer.add_chunk(pcm_bytes)
if end_of_speech:
    audio = buffer.get_audio()  # Audio completo de la utterancia
```

## Personalización

### Cambiar el prompt del sistema

Edita en `.env`:

```env
SYSTEM_PROMPT=Eres un agente de ventas experto para una concesionaria de autos. Eres amable pero persuasivo. Intenta agendar citas de prueba manejo.
```

### Cambiar la voz

Obtén el ID de la voz deseada:

```bash
curl http://localhost:8000/voices
```

Luego configúrala en `.env`:

```env
ELEVENLABS_VOICE_ID= nuevo_voice_id
```

### Cambiar el modelo de LLM

```env
# Más rápido y económico:
OPENAI_MODEL=gpt-4o-mini

# Más potente:
OPENAI_MODEL=gpt-4o

# Legacy (más barato):
OPENAI_MODEL=gpt-3.5-turbo
```

## Costos Estimados (USD)

| Servicio | Costo aprox. por minuto de llamada |
|----------|-----------------------------------|
| Twilio | $0.0130/min (número US) + $0.0085/min (voz) |
| OpenAI Whisper | $0.006/min de audio |
| OpenAI GPT-4o-mini | ~$0.0005/min (varía según conversación) |
| ElevenLabs | ~$0.01/min de texto generado |
| **Total estimado** | **~$0.03-0.05/minuto** |

## Troubleshooting

### Twilio no conecta al WebSocket

1. Verifica que `PUBLIC_URL` sea correcta y accesible desde internet
2. Asegúrate que el endpoint `/voice` devuelva XML válido
3. Revisa los logs de Twilio en la consola

### No se escucha nada

1. Verifica la API key de ElevenLabs
2. Revisa que el audio se esté convirtiendo correctamente de MP3 a mulaw
3. Habilita logs debug: `LOG_LEVEL=DEBUG` en `.env`

### La transcripción es mala

1. Ajusta los parámetros de silencio en `AudioBuffer`
2. Asegúrate que el audio esté resampleado correctamente a 16kHz para Whisper
3. Prueba con otro modelo de Whisper

### Errores de CORS o conexión

1. Verifica que ngrok esté corriendo y la URL sea la correcta
2. Asegúrate que el puerto 8000 no esté bloqueado
3. Prueba acceder a `/health` desde el navegador

## Despliegue con Docker (Opcional)

```dockerfile
# Dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8000

CMD ["python", "main.py"]
```

```bash
docker build -t voice-agent .
docker run -p 8000:8000 --env-file .env voice-agent
```

## Licencia

MIT License - Libre para uso personal y comercial.
