FROM python:3.12-slim

# Legacy .ppt / .pps / .odp support
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-impress-nogui \
    libreoffice-writer-nogui \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

COPY . .

WORKDIR /app/server

ENV PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:' + __import__('os').environ.get('PORT','8000') + '/api/health')" || exit 1

CMD sh -c "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"
