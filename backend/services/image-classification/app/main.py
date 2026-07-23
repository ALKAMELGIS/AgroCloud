"""
Image Classification Wizard — ML microservice (FastAPI).

A simplified, open-source ArcGIS-Pro-style image classification engine. This service
owns ONLY the machine-learning logic (segmentation, training, classification, accuracy).
Raster upload, COG conversion and XYZ tiling are handled by the existing Node
`/api/raster` stack, so this service is not a tiler.

Step 1 scaffold: `/health` + `/config` are live; the ML endpoints are defined with
their request/response contracts but return HTTP 501 until Steps 2-7 are implemented.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.segmentation import DEFAULT_MAX_PREVIEW_DIM as DEFAULT_PREVIEW_DIM, run_segmentation
from app.classification import assign_classes, classify_raster, train_classifier
from app.accuracy import assess_accuracy, generate_check_points
from app.convert import convert_to_web_geotiff

SERVICE_NAME = "image-classification"
SERVICE_VERSION = "0.5.0"

# Where labelled segment rasters are written. `/data` is read-only in docker, so
# outputs live in a writable dir (override with IC_OUTPUT_DIR).
IC_OUTPUT_DIR = os.environ.get("IC_OUTPUT_DIR", "/tmp/ic-segments")

app = FastAPI(
    title="Image Classification Wizard",
    description="Supervised/unsupervised, pixel/object-based land-cover classification.",
    version=SERVICE_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models (shared vocabulary across all steps) ──────────────────────
class ClassSchemaItem(BaseModel):
    class_name: str = Field(..., description="Human-readable class label, e.g. 'Water'")
    class_value: int = Field(..., description="Integer code written to the classified raster")
    color: Optional[str] = Field(None, description="Hex color for the legend, e.g. '#2b6cb0'")


class ClassSchema(BaseModel):
    name: str = Field(..., description="Schema name")
    classes: List[ClassSchemaItem] = Field(default_factory=list)


class Project(BaseModel):
    name: str
    raster_id: str = Field(..., description="Raster id from the /api/raster stack")
    method: str = Field("supervised", description="'supervised' | 'unsupervised'")
    classification_type: str = Field("pixel", description="'pixel' | 'object'")
    schema_: Optional[ClassSchema] = Field(None, alias="schema")


class TrainingSample(BaseModel):
    class_name: str
    class_value: int
    # GeoJSON geometry (Polygon/MultiPolygon) in WGS84.
    geometry: Dict[str, Any]


class SegmentationParams(BaseModel):
    algorithm: str = Field("slic", description="'slic' | 'felzenszwalb'")
    spectral_detail: float = Field(15.0, ge=1.0, le=20.0)
    spatial_detail: float = Field(15.0, ge=1.0, le=20.0)
    min_segment_size: int = Field(20, ge=1)


class SegmentRequest(SegmentationParams):
    """Segmentation request including how to locate the source raster."""
    raster_id: str = Field(..., description="Raster id from the /api/raster stack")
    # Path candidates resolved in order: docker shared volume, then absolute host path.
    path_candidates: List[str] = Field(default_factory=list)
    max_preview_dim: int = Field(DEFAULT_PREVIEW_DIM, ge=128, le=4096)


class ClassifierConfig(BaseModel):
    classifier: str = Field("random_forest", description="See /config for supported ids")
    n_estimators: Optional[int] = Field(200, description="Random Forest trees")
    n_clusters: Optional[int] = Field(8, description="KMeans cluster count (unsupervised)")
    max_samples_per_class: Optional[int] = Field(5000)


class TrainRequest(ClassifierConfig):
    """Fit a classifier from training-sample polygons (or cluster for KMeans)."""
    raster_id: str = Field(..., description="Raster id from the /api/raster stack")
    path_candidates: List[str] = Field(default_factory=list)
    samples: List[TrainingSample] = Field(default_factory=list)
    classes: List[ClassSchemaItem] = Field(default_factory=list)
    max_train_dim: int = Field(1024, ge=128, le=4096)


class ClassifyRequest(BaseModel):
    """Apply a previously-trained model to the full raster and return a colorized overlay."""
    raster_id: str = Field(..., description="Raster id from the /api/raster stack")
    path_candidates: List[str] = Field(default_factory=list)
    model_id: str = Field(..., description="Model id returned by /train")
    classes: List[ClassSchemaItem] = Field(default_factory=list)
    max_preview_dim: int = Field(1024, ge=128, le=4096)


class ConvertRequest(BaseModel):
    """Convert a GDAL-only raster (e.g. JPEG 2000) into a tiler-friendly web GeoTIFF."""
    raster_id: str = Field(..., description="Raster id from the /api/raster stack")
    source_candidates: List[str] = Field(
        default_factory=list, description="Readable source paths (docker /data or host abs path)"
    )
    dest_name: str = Field("cog.tif", description="Output filename written beside the source")


class ClassAssignment(BaseModel):
    from_value: int = Field(..., alias="from", description="Original cluster / class value")
    to_value: int = Field(..., alias="to", description="Target class value (shared = merge)")
    name: str = Field("", description="Target class name")
    color: Optional[str] = Field(None, description="Target class color (hex)")

    model_config = {"populate_by_name": True}


class AssignRequest(BaseModel):
    """Remap unsupervised cluster values into named schema classes (with optional merging)."""
    raster_id: str = Field(..., description="Raster id from the /api/raster stack")
    model_id: str = Field(..., description="Model id whose classified raster to remap")
    assignments: List[ClassAssignment] = Field(default_factory=list)


class AccuracyRequest(BaseModel):
    """Confusion matrix / kappa from ground-truth reference points vs the classified raster."""
    raster_id: str = Field(..., description="Raster id from the /api/raster stack")
    model_id: str = Field(..., description="Model id whose classified raster to assess")
    reference_points: List[Dict[str, Any]] = Field(
        default_factory=list, description="GeoJSON Point features with a numeric class_value property"
    )
    classes: List[ClassSchemaItem] = Field(default_factory=list)


class CheckPointsRequest(BaseModel):
    """Generate stratified/equalized random verification points over the classified raster."""
    raster_id: str = Field(..., description="Raster id from the /api/raster stack")
    model_id: str = Field(..., description="Model id whose classified raster to sample")
    method: str = Field("stratified", description="stratified | equalized")
    count: int = Field(100, ge=1, le=5000)
    classes: List[ClassSchemaItem] = Field(default_factory=list)


class ClassificationJob(BaseModel):
    job_id: str
    status: str = Field("queued", description="queued | running | done | failed")
    progress: float = 0.0
    message: Optional[str] = None
    output_raster_id: Optional[str] = None


class AccuracyReport(BaseModel):
    overall_accuracy: float
    kappa: float
    class_labels: List[str]
    confusion_matrix: List[List[int]]


# ── Capability catalog (returned by /config) ─────────────────────────────────
SUPPORTED_CLASSIFIERS = [
    {"id": "random_forest", "label": "Random Forest", "supervised": True},
    {"id": "knn", "label": "K-Nearest Neighbors", "supervised": True},
    {"id": "svm_rbf", "label": "SVM (RBF kernel)", "supervised": True},
    {"id": "gaussian_nb", "label": "Gaussian Naive Bayes (Max Likelihood)", "supervised": True},
    {"id": "kmeans", "label": "K-Means", "supervised": False},
]
SUPPORTED_SEGMENTERS = ["slic", "felzenszwalb"]


@app.get("/health")
async def health_check() -> Dict[str, str]:
    return {"status": "healthy", "service": SERVICE_NAME, "version": SERVICE_VERSION}


@app.get("/config")
async def get_config() -> Dict[str, Any]:
    """Capabilities advertised to the wizard UI."""
    return {
        "configured": True,
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "classifiers": SUPPORTED_CLASSIFIERS,
        "segmenters": SUPPORTED_SEGMENTERS,
        "hint": None,
    }


# ── ML endpoints (contracts defined; implemented in later steps) ──────────────
_NOT_READY = "Not implemented yet — arrives in a later step of the Image Classification Wizard build."


@app.post("/segment")
def segment(request: SegmentRequest) -> Dict[str, Any]:
    """Run object-based segmentation and return segment count + boundary preview (WGS84)."""
    try:
        return run_segmentation(
            raster_id=request.raster_id,
            path_candidates=list(request.path_candidates),
            algorithm=request.algorithm,
            spectral_detail=request.spectral_detail,
            spatial_detail=request.spatial_detail,
            min_segment_size=request.min_segment_size,
            max_preview_dim=request.max_preview_dim,
            output_dir=IC_OUTPUT_DIR,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:  # noqa: BLE001 — surface a clean error to the proxy
        raise HTTPException(status_code=500, detail=f"Segmentation failed: {exc}")


@app.post("/train")
def run_training(request: TrainRequest) -> Dict[str, Any]:
    """Fit a classifier from training samples and persist the model."""
    try:
        return train_classifier(
            raster_id=request.raster_id,
            path_candidates=list(request.path_candidates),
            classifier=request.classifier,
            samples=[s.model_dump() for s in request.samples],
            classes=[c.model_dump() for c in request.classes],
            n_estimators=request.n_estimators or 200,
            n_clusters=request.n_clusters or 8,
            max_samples_per_class=request.max_samples_per_class or 5000,
            max_train_dim=request.max_train_dim,
            output_dir=IC_OUTPUT_DIR,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Training failed: {exc}")


@app.post("/classify")
def run_classification(request: ClassifyRequest) -> Dict[str, Any]:
    """Apply a trained model to the raster; return a colorized RGBA PNG overlay + stats."""
    try:
        return classify_raster(
            raster_id=request.raster_id,
            path_candidates=list(request.path_candidates),
            model_id=request.model_id,
            classes=[c.model_dump() for c in request.classes],
            max_preview_dim=request.max_preview_dim,
            output_dir=IC_OUTPUT_DIR,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Classification failed: {exc}")


@app.post("/assign")
def run_assign(request: AssignRequest) -> Dict[str, Any]:
    """Remap cluster ids to named classes (merge = multiple clusters → one target value)."""
    try:
        return assign_classes(
            raster_id=request.raster_id,
            model_id=request.model_id,
            assignments=[
                {"from": a.from_value, "to": a.to_value, "name": a.name, "color": a.color}
                for a in request.assignments
            ],
            output_dir=IC_OUTPUT_DIR,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Class assignment failed: {exc}")


@app.post("/convert")
def run_convert(request: ConvertRequest) -> Dict[str, Any]:
    """Convert a GDAL-only raster (JPEG 2000, etc.) to a Web Mercator GeoTIFF for tiling."""
    try:
        return convert_to_web_geotiff(
            source_candidates=list(request.source_candidates),
            dest_name=request.dest_name or "cog.tif",
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Raster conversion failed: {exc}")


@app.post("/accuracy")
def run_accuracy(request: AccuracyRequest) -> Dict[str, Any]:
    """Compare ground-truth reference points against the classified raster."""
    try:
        return assess_accuracy(
            raster_id=request.raster_id,
            model_id=request.model_id,
            reference_points=request.reference_points,
            classes=[c.model_dump() for c in request.classes],
            output_dir=IC_OUTPUT_DIR,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Accuracy assessment failed: {exc}")


@app.post("/accuracy/points")
def run_check_points(request: CheckPointsRequest) -> Dict[str, Any]:
    """Generate stratified/equalized random verification points over the classified raster."""
    try:
        return generate_check_points(
            raster_id=request.raster_id,
            model_id=request.model_id,
            method=request.method,
            count=request.count,
            classes=[c.model_dump() for c in request.classes],
            output_dir=IC_OUTPUT_DIR,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Check-point generation failed: {exc}")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
