from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from app.timeseries import generate_timeseries
from app.mpc_planetary import router as mpc_router
import uvicorn

app = FastAPI(
    title="Agri-Analysis Engine",
    description="Remote Sensing Analysis Backend using Sentinel-2 and STAC",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(mpc_router, prefix="/mpc", tags=["mpc"])

class AnalysisRequest(BaseModel):
    aoi: Dict[str, Any] = Field(..., description="GeoJSON Polygon of the Area of Interest")
    start_date: str = Field(..., description="Start date (YYYY-MM-DD)")
    end_date: str = Field(..., description="End date (YYYY-MM-DD)")
    indices: List[str] = Field(default=["NDWI"], description="List of indices to calculate (NDWI, NDMI, SAVI, SOIL)")
    cloud_cover: Optional[float] = Field(20.0, description="Maximum cloud cover percentage")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "agri-analysis-engine"}

@app.post("/analyze")
async def analyze_aoi(request: AnalysisRequest):
    """
    Perform time-series analysis on the provided AOI.
    """
    try:
        # Basic validation of GeoJSON (simplified)
        if "type" not in request.aoi or "coordinates" not in request.aoi:
             raise HTTPException(status_code=400, detail="Invalid GeoJSON provided")

        result = await generate_timeseries(
            aoi_geojson=request.aoi,
            start_date=request.start_date,
            end_date=request.end_date,
            indices=request.indices,
            cloud_cover=request.cloud_cover
        )
        
        if "error" in result:
             raise HTTPException(status_code=404, detail=result["error"])
             
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
