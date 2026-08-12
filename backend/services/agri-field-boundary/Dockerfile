FROM python:3.11-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# CPU torch first so ftw-tools / requirements cannot pull a CUDA torch build.
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

# Service modules (app + FoW / Delineate / FTW infer helpers)
COPY *.py ./

ENV PORT=8092
ENV FTW_INFER_ENABLED=1
EXPOSE 8092
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8092"]
