"""
AgroCloud GeoAI Chat — FastAPI spatial intelligence API.

  POST /geoai/chat  { message, context }
  GET  /health
  GET  /

Run:
  cd backend/services/geoai-chat
  python -m venv .venv
  .venv\\Scripts\\activate   # Windows
  pip install -r requirements.txt
  uvicorn app:app --reload --port 8099
"""

from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

from agent.geo_agent import run_geo_agent

PORT = int(os.environ.get("PORT", "8099"))

app = FastAPI(title="GeoAI Spatial Intelligence API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class GeoAIRequest(BaseModel):
    message: str
    context: dict[str, Any] = Field(default_factory=dict)


class GeoAIResponse(BaseModel):
    answer: str
    context: dict[str, Any] = Field(default_factory=dict)
    action: dict[str, Any] | None = None
    statistics: dict[str, Any] = Field(default_factory=dict)
    geojson: dict[str, Any] | None = None


@app.get("/")
def root():
    return {
        "status": "running",
        "service": "GeoAI Spatial Intelligence",
        "port": PORT,
        "openai": bool(os.environ.get("OPENAI_API_KEY", "").strip()),
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "geoai-chat",
        "openai": bool(os.environ.get("OPENAI_API_KEY", "").strip()),
    }


@app.post("/geoai/chat", response_model=GeoAIResponse)
async def geoai_chat(request: GeoAIRequest):
    result = run_geo_agent(request.message.strip(), request.context or {})
    return GeoAIResponse(
        answer=str(result.get("answer") or ""),
        context=result.get("context") or request.context,
        action=result.get("action"),
        statistics=result.get("statistics") or {},
        geojson=result.get("geojson"),
    )
