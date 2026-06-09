"""
Script de prueba para verificar que todos los servicios funcionan.
Ejecutar: python test_services.py
"""

import asyncio
import sys

from config import Config
from services.elevenlabs_service import ElevenLabsService
from services.openai_service import OpenAIService
from services.twilio_service import TwilioService


async def test_openai():
    """Prueba OpenAI: Whisper + GPT."""
    print("\n" + "=" * 50)
    print("TEST 1: OpenAI Services")
    print("=" * 50)

    if not Config.OPENAI_API_KEY:
        print("SKIP: OPENAI_API_KEY no configurada")
        return False

    service = OpenAIService()

    # Test GPT
    print("\n[Test GPT-4]")
    try:
        response = await service.get_chat_response("Hola, responde en español: ¿qué eres?")
        print(f"  Respuesta: {response[:100]}...")
        print("  GPT: OK")
    except Exception as e:
        print(f"  GPT: ERROR - {e}")
        return False

    return True


async def test_elevenlabs():
    """Prueba ElevenLabs TTS."""
    print("\n" + "=" * 50)
    print("TEST 2: ElevenLabs TTS")
    print("=" * 50)

    if not Config.ELEVENLABS_API_KEY:
        print("SKIP: ELEVENLABS_API_KEY no configurada")
        return False

    service = ElevenLabsService()

    # Test TTS
    print("\n[Test Text-to-Speech]")
    try:
        audio = await service.text_to_speech("Hola, este es un test del agente de voz.")
        print(f"  Audio generado: {len(audio)} bytes")

        # Guardar para escuchar
        with open("test_output.mp3", "wb") as f:
            f.write(audio)
        print("  Audio guardado en: test_output.mp3")
        print("  TTS: OK")

    except Exception as e:
        print(f"  TTS: ERROR - {e}")
        return False

    # Test listar voces
    print("\n[Test Listar Voces]")
    try:
        voices = await service.get_available_voices()
        print(f"  Voces disponibles: {len(voices)}")
        for v in voices[:5]:
            print(f"    - {v['name']} (ID: {v['voice_id']})")
        print("  Voces: OK")
    except Exception as e:
        print(f"  Voces: ERROR - {e}")

    return True


async def test_twilio():
    """Prueba Twilio helpers."""
    print("\n" + "=" * 50)
    print("TEST 3: Twilio Utils")
    print("=" * 50)

    service = TwilioService()

    # Test generar TwiML
    print("\n[Test TwiML]")
    try:
        twiml = service.generate_voice_response("https://test.ngrok.io")
        assert "wss://test.ngrok.io/stream" in twiml
        print("  TwiML generado correctamente")
        print("  TwiML: OK")
    except Exception as e:
        print(f"  TwiML: ERROR - {e}")
        return False

    # Test conversión de audio
    print("\n[Test Conversión Audio]")
    try:
        import audioop
        import struct

        # Crear tono de prueba (PCM 16-bit)
        samples = [int(32767 * (i % 100 < 50)) for i in range(800)]  # 50ms @ 8kHz
        pcm = struct.pack("<" + "h" * len(samples), *samples)

        # PCM → mulaw → PCM
        mulaw = service.encode_mulaw(pcm)
        pcm_back = service.decode_mulaw(mulaw)

        assert len(pcm_back) == len(pcm), "Conversión no preserva longitud"
        print(f"  PCM: {len(pcm)} bytes → mulaw: {len(mulaw)} bytes → PCM: {len(pcm_back)} bytes")
        print("  Audio: OK")

    except Exception as e:
        print(f"  Audio: ERROR - {e}")
        return False

    # Test AudioBuffer
    print("\n[Test AudioBuffer]")
    try:
        buffer = TwilioService.AudioBuffer()
        assert buffer.is_empty()

        # Simular audio
        for _ in range(20):
            result = buffer.add_chunk(pcm)
        assert not buffer.is_empty()

        audio = buffer.get_audio()
        assert buffer.is_empty()
        print(f"  Buffer: {len(audio)} bytes acumulados")
        print("  Buffer: OK")

    except Exception as e:
        print(f"  Buffer: ERROR - {e}")
        return False

    return True


async def test_config():
    """Verifica configuración."""
    print("\n" + "=" * 50)
    print("TEST 0: Configuración")
    print("=" * 50)

    errors = Config.validate()
    if errors:
        print(f"  Errores encontrados ({len(errors)}):")
        for e in errors:
            print(f"    - {e}")
        print("\n  Copia .env.example a .env y configura tus credenciales")
        return False
    else:
        print("  Todas las variables configuradas correctamente")
        print("  Config: OK")
        return True


async def main():
    """Ejecuta todas las pruebas."""
    print("\n" + "=" * 60)
    print("AGENTE DE VOZ IA - Pruebas de Servicios")
    print("=" * 60)

    results = []

    # Test configuración
    results.append(("Config", await test_config()))

    # Test OpenAI
    results.append(("OpenAI", await test_openai()))

    # Test ElevenLabs
    results.append(("ElevenLabs", await test_elevenlabs()))

    # Test Twilio
    results.append(("Twilio", await test_twilio()))

    # Resumen
    print("\n" + "=" * 60)
    print("RESUMEN DE PRUEBAS")
    print("=" * 60)

    all_passed = True
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        icon = "  " if passed else "  "
        print(f"{icon} {name}: {status}")
        if not passed:
            all_passed = False

    if all_passed:
        print("\n  Todos los servicios funcionan correctamente!")
        print("  Ejecuta 'python main.py' para iniciar el agente.")
    else:
        print("\n  Algunos servicios fallaron. Revisa la configuración.")

    return all_passed


if __name__ == "__main__":
    try:
        success = asyncio.run(main())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nPruebas canceladas.")
        sys.exit(1)
