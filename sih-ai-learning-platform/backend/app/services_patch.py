from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

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

    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", text):
        try:
            value, _ = decoder.raw_decode(text[match.start():])
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value

    raise RuntimeError("llm_invalid_json")


def robust_call_openrouter_json(*, system_prompt: str, user_prompt: str, schema_name: str, schema: dict) -> dict:
    if not _services.llm_live_configured():
        raise RuntimeError("live_ai_auth_required")

    model = os.getenv("LLM_MODEL", "").strip()
    base_payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.1,
        "max_tokens": 10000,
    }
    attempts = [
        {
            **base_payload,
            "provider": {"require_parameters": True},
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": schema_name, "strict": True, "schema": schema},
            },
        },
        {**base_payload, "response_format": {"type": "json_object"}},
        {
            **base_payload,
            "messages": [
                {"role": "system", "content": system_prompt + " Return one valid JSON object only. Do not use markdown fences or commentary."},
                {"role": "user", "content": user_prompt},
            ],
        },
    ]

    last_error: str | None = None
    with httpx.Client(timeout=httpx.Timeout(90.0, connect=15.0)) as client:
        for payload in attempts:
            try:
                response = client.post(_services.OPENROUTER_URL, headers=_services._openrouter_headers(), json=payload)
            except httpx.HTTPError as exc:
                last_error = f"network:{exc}"
                continue

            if response.status_code >= 400:
                last_error = f"OpenRouter {response.status_code}: {response.text[:500]}"
                continue

            try:
                data = response.json()
                message = data["choices"][0]["message"]
            except (ValueError, KeyError, IndexError, TypeError) as exc:
                last_error = f"invalid_response:{exc}"
                continue

            candidates = [message.get("content")]
            # Some free-router providers expose the final answer through a
            # different text field. Treat these only as fallbacks.
            for field in ("text", "output"):
                if message.get(field) is not None:
                    candidates.append(message.get(field))

            for candidate in candidates:
                try:
                    return robust_extract_json_content(candidate)
                except RuntimeError as exc:
                    last_error = str(exc)
                    continue

    raise RuntimeError(f"llm_request_failed:{last_error or 'No provider returned a valid JSON object'}")


# Patch the shared services module before the exported functions are used.
# This keeps the core engine provider-agnostic while handling the inconsistent
# response shapes seen from OpenRouter's free router.
_services._extract_json_content = robust_extract_json_content
_services._call_openrouter_json = robust_call_openrouter_json

create_assessment = _services.create_assessment
get_assessment = _services.get_assessment
get_role = _services.get_role
list_roles = _services.list_roles
llm_live_configured = _services.llm_live_configured
score_assessment = _services.score_assessment
score_assessment_payload = _services.score_assessment_payload
