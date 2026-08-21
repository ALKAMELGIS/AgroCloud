FROM python:3.11-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

# Service modules (app + FoW / Delineate / AFD helpers)
COPY *.py ./
COPY engines ./engines
COPY services ./services
COPY models/AgriculturalFieldDelineation ./models/AgriculturalFieldDelineation

ENV PORT=8092
EXPOSE 8092
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8092}"]
