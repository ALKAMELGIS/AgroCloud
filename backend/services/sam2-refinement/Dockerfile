# SAM2 boundary refinement (Meta Segment Anything 2).
#
# GPU recommended. CPU works but is slow for hiera-large.
# For lower RAM: SAM2_MODEL_ID=facebook/sam2-hiera-base-plus
#
#   docker build -t ai-sam2-refinement .
#   docker run -p 8096:8096 ai-sam2-refinement
# Then: SAM2_REFINEMENT_URL=http://<host>:8096/refine
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

ENV SAM2_MODEL_ID=facebook/sam2-hiera-large
EXPOSE 8096
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8096}"]
