# Temporal Transformer crop typing (Prithvi / S2 multi-date stack).
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py ./

EXPOSE 8097
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8097}"]
