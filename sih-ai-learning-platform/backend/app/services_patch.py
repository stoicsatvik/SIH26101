from __future__ import annotations

import json
import re
from typing import Any

from . import services as _services


def _collect_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        for key in ("text", "content", "value"):
            value = content.get(key)
            if isinstance(value, str):
                return value
        return json.dumps(content)
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content") or item.get("value")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts)
    return ""


def robust_extract_json_content(content: object) -> dict:
    if isinstance(content, dict):
        return content

    text = _collect_text(content).strip()
    if not text:
        raise RuntimeError("llm_invalid_response")

    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)

    try:
        value = json.loads(text)
        if isinstance(value, dict):
            return value
    except json.JSONDecodeError:
        pass

    # Free OpenRouter models occasionally wrap JSON with a short sentence or
    # markdown despite being asked for JSON-only output. Decode the first
    # complete JSON object instead of rejecting an otherwise usable response.
    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", text):
        try:
            value, _ = decoder.raw_decode(text[match.start():])
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value

    raise RuntimeError("llm_invalid_json")


# Patch the shared services module before the exported functions are used.
_services._extract_json_content = robust_extract_json_content

create_assessment = _services.create_assessment
get_assessment = _services.get_assessment
get_role = _services.get_role
list_roles = _services.list_roles
llm_live_configured = _services.llm_live_configured
score_assessment = _services.score_assessment
score_assessment_payload = _services.score_assessment_payload
