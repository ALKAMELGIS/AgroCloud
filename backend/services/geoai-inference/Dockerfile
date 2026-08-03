# opengeos/geoai (geoai-py) Mask R-CNN extractors for AgroCloud.
#
#   docker build -t ai-geoai-inference .
#   docker run -p 8098:8098 ai-geoai-inference
# Then: GEOAI_INFERENCE_URL=http://<host>:8098
#
# First request per task downloads HuggingFace weights from giswqs/geoai.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libgomp1 gdal-bin libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

EXPOSE 8098
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8098}"]
