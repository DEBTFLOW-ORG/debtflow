# ============================================
# Dockerfile - Agente de Voz IA
# ============================================

FROM python:3.11-slim

# Instalar dependencias del sistema para procesamiento de audio
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Directorio de trabajo
WORKDIR /app

# Copiar e instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código fuente
COPY . .

# Puerto expuesto
EXPOSE 8000

# Comando de inicio
CMD ["python", "main.py"]
