FROM python:3.11-slim

# Bust Docker layer cache on redeploy so GitHub context changes always rebuild.
ARG CACHE_BUST=2026-09-01-ftw-gpu-fix
RUN echo "afb build ${CACHE_BUST}"

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    libgl1 \
    libglib2.0-0 \
    gdal-bin \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir "ftw-tools==2.0.0b5" "geopandas>=0.14"

# Service modules (app + FoW / Delineate / AFD helpers)
COPY *.py ./
COPY engines ./engines
COPY services ./services
COPY models/AgriculturalFieldDelineation ./models/AgriculturalFieldDelineation

RUN mkdir -p /app/models \
    && curl -fsSL \
      "https://github.com/fieldsoftheworld/ftw-baselines/releases/download/v3/prue_efnet7_checkpoint.ckpt" \
      -o /app/models/prue_efnetb7_ccby_checkpoint.ckpt

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV PORT=8092
ENV FTW_INFER_ENABLED=1
ENV FTW_INFER_MODEL=FTW_PRUE_EFNET_B7
ENV FTW_CHECKPOINT_PATH=/app/models/prue_efnetb7_ccby_checkpoint.ckpt

EXPOSE 8092
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8092}"]
