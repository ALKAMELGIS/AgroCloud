# AI Tree Detection inference service.
#
# DEFAULT engine: DeepForest (auto-downloads a pretrained tree-crown model).
# No manual weights are required — build and run:
#   docker build -t ai-tree-detection .
#   docker run -p 8080:8080 ai-tree-detection
# Then on the AgroCloud backend: TREE_DETECTION_URL=http://<host>:8080/predict
#
# OPTIONAL YOLO engine: mount a weights file and point MODEL_PATH at it, e.g.
#   docker run -p 8080:8080 -v /path/best.pt:/app/best.pt \
#     -e MODEL_PATH=/app/best.pt -e TREE_DETECTION_ENGINE=yolo ai-tree-detection
FROM python:3.11-slim

# OpenCV / DeepForest / torch runtime libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

# Pre-download the pretrained DeepForest model into the image so the container
# starts instantly and works offline (no first-request download stall).
RUN python -c "from deepforest import main as m; d=m.deepforest(); \
(getattr(d,'use_release',None) and d.use_release()) or d.load_model('weecology/deepforest-tree')" \
    || echo "Model will download on first request."

EXPOSE 8080
# Honor a platform-provided $PORT (Railway, Render, Cloud Run, etc.) and fall
# back to 8080 for local Docker runs / docker-compose.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}"]
