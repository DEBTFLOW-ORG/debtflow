"""
Script de configuración de Twilio.
Configura automáticamente el webhook de voz para tu número.

Uso:
    python setup_twilio.py

Requiere:
    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER en .env
    PUBLIC_URL configurada
"""

import asyncio
import sys

import httpx
from config import Config


async def get_phone_numbers(client: httpx.AsyncClient, account_sid: str, auth_token: str):
    """Obtiene los números de teléfono de la cuenta."""
    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/IncomingPhoneNumbers.json"

    response = await client.get(url, auth=(account_sid, auth_token))
    response.raise_for_status()

    data = response.json()
    return data.get("incoming_phone_numbers", [])


async def update_phone_number(
    client: httpx.AsyncClient,
    account_sid: str,
    auth_token: str,
    number_sid: str,
    voice_url: str,
):
    """Actualiza el webhook de voz de un número."""
    url = (
        f"https://api.twilio.com/2010-04-01/Accounts/"
        f"{account_sid}/IncomingPhoneNumbers/{number_sid}.json"
    )

    data = {
        "VoiceUrl": voice_url,
        "VoiceMethod": "POST",
        "VoiceFallbackUrl": f"{Config.PUBLIC_URL}/voice",
        "VoiceFallbackMethod": "POST",
    }

    response = await client.post(url, data=data, auth=(account_sid, auth_token))
    response.raise_for_status()

    return response.json()


async def main():
    print("=" * 60)
    print("CONFIGURACIÓN DE TWILIO")
    print("=" * 60)

    # Validar configuración
    errors = Config.validate()
    if errors:
        print("\nErrores de configuración:")
        for e in errors:
            print(f"  - {e}")
        print("\nConfigura tu archivo .env primero.")
        return 1

    if not Config.PUBLIC_URL:
        print("\nERROR: PUBLIC_URL no está configurada en .env")
        print("Ejemplo: PUBLIC_URL=https://abc123.ngrok.io")
        return 1

    voice_url = f"{Config.PUBLIC_URL}/voice"

    print(f"\nCuenta SID: {Config.TWILIO_ACCOUNT_SID[:20]}...")
    print(f"URL del webhook: {voice_url}")

    async with httpx.AsyncClient() as client:
        # Obtener números
        print("\nObteniendo números de teléfono...")
        try:
            numbers = await get_phone_numbers(
                client, Config.TWILIO_ACCOUNT_SID, Config.TWILIO_AUTH_TOKEN
            )
        except Exception as e:
            print(f"Error: {e}")
            return 1

        if not numbers:
            print("\nNo se encontraron números de teléfono en esta cuenta.")
            print("Compra uno en: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming")
            return 1

        print(f"\nNúmeros encontrados: {len(numbers)}")

        # Si hay un número configurado en .env, buscarlo
        target_number = Config.TWILIO_PHONE_NUMBER
        selected = None

        for num in numbers:
            phone = num.get("phone_number", "")
            sid = num.get("sid", "")
            friendly = num.get("friendly_name", "")
            current_url = num.get("voice_url", "N/A")

            print(f"\n  {phone} ({friendly})")
            print(f"    SID: {sid}")
            print(f"    Webhook actual: {current_url}")

            if phone == target_number:
                selected = num

        # Si hay múltiples números y el configurado no coincide, preguntar
        if not selected and len(numbers) > 1:
            print(f"\nEl número configurado ({target_number}) no coincide con ninguno.")
            print("Usando el primer número disponible.")
            selected = numbers[0]
        elif not selected:
            selected = numbers[0]

        print(f"\nNúmero seleccionado: {selected['phone_number']}")

        # Confirmar
        confirm = input(f"\nConfigurar webhook a {voice_url}? [s/N]: ").lower().strip()
        if confirm not in ("s", "si", "yes", "y"):
            print("Cancelado.")
            return 0

        # Actualizar
        print("\nActualizando configuración...")
        try:
            result = await update_phone_number(
                client,
                Config.TWILIO_ACCOUNT_SID,
                Config.TWILIO_AUTH_TOKEN,
                selected["sid"],
                voice_url,
            )
            print(f"OK! Webhook configurado: {result.get('voice_url')}")
            print(f"\nAhora puedes llamar a {selected['phone_number']} para probar el agente!")

        except Exception as e:
            print(f"Error actualizando: {e}")
            return 1

    return 0


if __name__ == "__main__":
    try:
        exit_code = asyncio.run(main())
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\nCancelado.")
        sys.exit(1)
