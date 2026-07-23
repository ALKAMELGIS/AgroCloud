# Image Classification Wizard — ML microservice.
#
# Owns segmentation/training/classification/accuracy logic only. Rasters are
# uploaded, converted to COG and tiled by the existing Node /api/raster stack;
# this service reads raster windows from the shared uploads volume.
FROM python:3.11-slim

# System libraries for GDAL / rasterio and scikit-image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgdal-dev \
    gdal-bin \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal
ENV PYTHONUNBUFFERED=1

WORKDIR /code

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY ./app /code/app

EXPOSE 8000
# Honor a platform-provided $PORT (Railway/Render/Cloud Run) and default to 8000.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
