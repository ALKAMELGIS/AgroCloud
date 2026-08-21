# Agricultural Field Delineation

Bundled Esri Deep Learning Package for AgroCloud Field Boundaries.

| Item | Value |
|------|-------|
| Model ID | `eb5f896bf88b46af8252e17fa404a73d` |
| Architecture | Mask R-CNN (ResNet50 backbone) |
| Backend | PyTorch |
| Classes | `field` (value 1) |
| Input | 12-band Sentinel-2 L2A, 224×224 tiles, 10 m |
| EMD version | 2024.01.24 |
| Documented AP (field) | 0.6429 |

## Files

| File | Role |
|------|------|
| `AgriculturalFieldDelineation.dlpk` | Original Esri package (ZIP) |
| `AgricultureFieldDelination.emd` | Model definition (source of truth) |
| `AgricultureFieldDelination.pth` | PyTorch weights |

Filenames keep the original Esri spelling (`Delination`).

## Band order (model channels 0–11)

```
B01, B02, B03, B04, B05, B06, B07, B08, B8A, B09, B11, B12
```

## Path resolution

Project-relative (no developer Desktop/Downloads paths):

```text
backend/services/agri-field-boundary/models/AgriculturalFieldDelineation/
```

Override with:

```text
AGRICULTURAL_FIELD_DELINEATION_MODEL_PATH
AGRICULTURAL_FIELD_DELINEATION_EMD_PATH
```

## Git LFS

Large `.pth` / `.dlpk` files are tracked with Git LFS. After clone:

```bash
git lfs install
git lfs pull
```
