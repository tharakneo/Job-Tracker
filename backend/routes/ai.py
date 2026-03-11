import json
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException

import models, schemas
from auth import get_current_user
from config import settings

router = APIRouter(prefix="/ai", tags=["ai"])

# ── Prompt helpers ────────────────────────────────────────────────────────────

PROFILE_FIELD_KEYS = [
    "first_name", "last_name", "email", "phone",
    "address_line1", "address_line2", "city", "state", "zip_code", "country",
    "linkedin_url", "github_url", "portfolio_url", "website_url",
    "authorized_to_work", "sponsorship_needed", "visa_status",
    "gender", "ethnicity", "veteran_status", "disability_status",
    "work_experience", "education", "skills", "resume_text",
]


def _build_classify_prompt(label: str, context: Optional[str], input_type: Optional[str], options: Optional[list]) -> str:
    options_str = f"\nAvailable options: {json.dumps(options)}" if options else ""
    context_str = f"\nPage/form context: {context}" if context else ""
    input_type_str = f"\nInput type: {input_type}" if input_type else ""

    return f"""You are an expert at mapping job application form fields to a structured user profile.

Given a form field, identify which profile field key it corresponds to.

Profile field keys available:
{json.dumps(PROFILE_FIELD_KEYS, indent=2)}

Form field label: "{label}"{context_str}{input_type_str}{options_str}

Respond ONLY with a valid JSON object in this exact format:
{{
  "field_key": "<the matching profile field key or null if no match>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<one sentence explanation>"
}}

Rules:
- If the field is about work authorization or visa, use "authorized_to_work" or "sponsorship_needed" as appropriate.
- If it is an EEO / demographic question, use the appropriate eeo field key.
- If it is about covering letter or "why this company" type questions, use "resume_text" as a signal but set field_key to "open_ended".
- Return field_key as null only if you truly cannot match the field.
"""


def _build_answer_prompt(question: str, context: Optional[str], profile: models.User) -> str:
    profile_snippet = {
        "name": f"{profile.first_name} {profile.last_name}",
        "skills": profile.skills,
        "work_experience": profile.work_experience,
        "education": profile.education,
        "resume_text": (profile.resume_text or "")[:3000],
    }
    context_str = f"\nJob/page context: {context}" if context else ""
    return f"""You are helping a job applicant answer an open-ended question in their job application.
Write a concise, professional answer (2-4 sentences) tailored to their background.

Applicant profile:
{json.dumps(profile_snippet, indent=2)}
{context_str}

Question: "{question}"

Respond with ONLY the answer text — no preamble, no quotes around it.
"""


# ── Route: classify a form field ──────────────────────────────────────────────

@router.post("/classify", response_model=schemas.ClassifyFieldResponse)
async def classify_field(
    payload: schemas.ClassifyFieldRequest,
    current_user: models.User = Depends(get_current_user),
):
    api_key = current_user.grok_api_key or settings.GROK_API_KEY
    if not api_key:
        raise HTTPException(status_code=400, detail="No Grok API key configured")

    prompt = _build_classify_prompt(
        payload.label, payload.context, payload.input_type, payload.options
    )

    grok_response = await _call_grok(api_key, prompt)

    try:
        parsed = json.loads(grok_response)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Grok returned non-JSON response")

    field_key = parsed.get("field_key")
    confidence = float(parsed.get("confidence", 0.0))

    # Resolve the actual answer from the user's profile
    answer = None
    if field_key and field_key != "open_ended" and hasattr(current_user, field_key):
        answer = getattr(current_user, field_key)

        # For dropdowns/radios: find the best matching option
        if payload.options and answer is not None:
            answer = _match_option(answer, payload.options)

    return schemas.ClassifyFieldResponse(
        field_key=field_key or "unknown",
        confidence=confidence,
        answer=answer,
    )


# ── Route: answer open-ended questions ────────────────────────────────────────

@router.post("/answer-open-ended")
async def answer_open_ended(
    payload: schemas.AnswerOpenEndedRequest,
    current_user: models.User = Depends(get_current_user),
):
    api_key = current_user.grok_api_key or settings.GROK_API_KEY
    if not api_key:
        raise HTTPException(status_code=400, detail="No Grok API key configured")

    prompt = _build_answer_prompt(payload.question, payload.context, current_user)
    answer_text = await _call_grok(api_key, prompt)
    return {"answer": answer_text.strip()}


# ── Grok API helper ───────────────────────────────────────────────────────────

async def _call_grok(api_key: str, prompt: str) -> str:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": "grok-2-latest",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{settings.GROK_API_BASE}/chat/completions",
            headers=headers,
            json=body,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Grok API error: {resp.text}")
    data = resp.json()
    return data["choices"][0]["message"]["content"]


# ── Option matching helper ────────────────────────────────────────────────────

def _match_option(value, options: list) -> Optional[str]:
    """
    Given a profile value (bool or string) and a list of dropdown/radio options,
    return the option string that best matches the value.
    Uses simple keyword heuristics — sufficient for EEO fields.
    """
    if isinstance(value, bool):
        # sponsorship_needed, authorized_to_work
        target_positive = ["yes", "i do", "require", "will require"]
        target_negative = ["no", "i do not", "do not require", "won't require", "will not"]
        targets = target_positive if value else target_negative
    elif isinstance(value, str):
        targets = [value.lower()]
    else:
        return None

    for option in options:
        option_lower = option.lower()
        if any(t in option_lower for t in targets):
            return option

    # Fallback: return the first option if nothing matched
    return options[0] if options else None
