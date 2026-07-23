# AI SAM Detection inference service (segment-geospatial / samgeo).
#
# Zero-config: samgeo auto-downloads the SAM checkpoint on first run.
#   docker build -t ai-sam-detection .
#   docker run -p 8090:8090 ai-sam-detection
# Then on the AgroCloud backend: SAM_DETECTION_URL=http://<host>:8090/segment
#
# A GPU is strongly recommended. For CUDA, use an nvidia/cuda base image and run with
# `--gpus all`; this slim image runs on CPU (slow) out of the box.
FROM python:3.11-slim

# rasterio / OpenCV / torch runtime libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libexpat1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

# Pre-download the SAM checkpoint into the image so the container starts ready
# (samgeo caches it under ~/.cache). Falls back to first-request download.
ENV SAM_MODEL_TYPE=vit_h
RUN python -c "from samgeo import SamGeo; SamGeo(model_type='${SAM_MODEL_TYPE}', automatic=False)" \
    || echo "SAM checkpoint will download on first request."

EXPOSE 8090
# Honor a platform-provided $PORT (Railway, Render, Cloud Run, etc.) and fall
# back to 8090 for local Docker runs / docker-compose.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8090}"]
