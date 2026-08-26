"""GeoAI agent — intent routing + optional OpenAI explanation."""

from __future__ import annotations

import json
import os
from typing import Any

from agent.prompts import EXPLAIN_PROMPT, SYSTEM_PROMPT
from services.gis_service import execute

_openai_client = None


def _openai():
    global _openai_client
    if _openai_client is not None:
        return _openai_client
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        from openai import OpenAI

        _openai_client = OpenAI(api_key=api_key)
        return _openai_client
    except Exception:
        return None


def _explain_with_llm(message: str, result: dict[str, Any]) -> str | None:
    client = _openai()
    if client is None:
        return None
    stats = json.dumps(result.get("statistics") or {}, default=str)[:4000]
    try:
        resp = client.chat.completions.create(
            model=os.environ.get("GEOAI_CHAT_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT + "\n" + EXPLAIN_PROMPT},
                {
                    "role": "user",
                    "content": f"User question: {message}\n\nGIS result:\n{result.get('answer', '')}\n\nStatistics JSON:\n{stats}",
                },
            ],
            max_tokens=512,
            temperature=0.3,
        )
        text = resp.choices[0].message.content
        return text.strip() if text else None
    except Exception:
        return None


def run_geo_agent(message: str, context: dict[str, Any]) -> dict[str, Any]:
    """Execute GIS tools, optionally refine answer with OpenAI."""
    result = execute(message, context)
    explained = _explain_with_llm(message, result)
    if explained:
        result = {**result, "answer": explained}
    return result
