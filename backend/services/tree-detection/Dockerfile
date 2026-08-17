# AI Tree Detection inference service — Ultralytics YOLO Detection (class: tree).
#
#   docker build -t ai-tree-detection .
#   docker run -p 8080:8080 ai-tree-detection
#
# Optional custom weights:
#   docker run -p 8080:8080 -v /path/tree.pt:/app/models/tree.pt \
#     -e MODEL_PATH=/app/models/tree.pt ai-tree-detection
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

# Pre-download Ultralytics YOLO-World so first predict is not a stall.
ENV TREE_DETECTION_ENGINE=yolo
ENV TREE_DETECTION_YOLO_WEIGHTS=yolov8s-worldv2.pt
RUN python -c "from ultralytics import YOLO; YOLO('yolov8s-worldv2.pt')" \
    || echo "YOLO-World weights will download on first request."

EXPOSE 8080
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}"]
