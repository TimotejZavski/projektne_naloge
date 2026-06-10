FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    ORV_HOST=0.0.0.0 \
    ORV_PORT=8000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/service/requirements.txt
RUN python -m pip install --upgrade pip \
    && python -m pip install -r /app/service/requirements.txt

COPY . /app/service

RUN mkdir -p /app/service/media /app/dataset/valid/videos

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${ORV_PORT}/health" || exit 1

CMD ["sh", "-c", "uvicorn service.orv.main:app --host ${ORV_HOST} --port ${ORV_PORT}"]
