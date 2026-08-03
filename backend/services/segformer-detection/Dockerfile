# SegFormer ADE20K GIS detection service (default: B5 640).
#
# Zero-config: transformers auto-downloads nvidia/segformer-b5-finetuned-ade-640-640
# on first run (or at image build if the RUN step succeeds).
# Override with SEGFORMER_MODEL_ID=nvidia/segformer-b0-finetuned-ade-512-512 for CPU/light hosts.
#   docker build -t ai-segformer-detection .
#   docker run -p 8095:8095 ai-segformer-detection
# Then on the AgroCloud backend: SEGFORMER_DETECTION_URL=http://<host>:8095
#
# A GPU is recommended (B5 + tiling). For CUDA, use an nvidia/cuda base image and run with
# `--gpus all`; this slim image runs on CPU out of the box (slow for B5).
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

# Warm the HuggingFace cache so the container starts ready when network allows.
ENV SEGFORMER_MODEL_ID=nvidia/segformer-b5-finetuned-ade-640-640
RUN python -c "from transformers import AutoImageProcessor, SegformerForSemanticSegmentation; \
AutoImageProcessor.from_pretrained('${SEGFORMER_MODEL_ID}'); \
SegformerForSemanticSegmentation.from_pretrained('${SEGFORMER_MODEL_ID}')" \
    || echo "SegFormer weights will download on first request."

EXPOSE 8095
# Honor a platform-provided $PORT (Railway, Render, Cloud Run, etc.) and fall
# back to 8095 for local Docker runs / docker-compose.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8095}"]
