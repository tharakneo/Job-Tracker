from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr


# ── Auth Schemas ─────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Profile Schemas ──────────────────────────────────────────────────────────

class WorkExperience(BaseModel):
    title: str
    company: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None   # None = Present
    description: Optional[str] = None


class Education(BaseModel):
    degree: str
    institution: str
    field_of_study: Optional[str] = None
    graduation_year: Optional[int] = None


class ProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None

    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    website_url: Optional[str] = None

    authorized_to_work: Optional[bool] = None
    sponsorship_needed: Optional[bool] = None
    visa_status: Optional[str] = None

    gender: Optional[str] = None
    ethnicity: Optional[str] = None
    veteran_status: Optional[str] = None
    disability_status: Optional[str] = None

    work_experience: Optional[List[WorkExperience]] = None
    education: Optional[List[Education]] = None
    skills: Optional[List[str]] = None
    resume_text: Optional[str] = None
    grok_api_key: Optional[str] = None


class ProfileResponse(ProfileUpdate):
    email: str

    class Config:
        from_attributes = True


# ── AI Schemas ───────────────────────────────────────────────────────────────

class ClassifyFieldRequest(BaseModel):
    label: str                         # The form field label text
    context: Optional[str] = None      # Surrounding HTML or page context
    input_type: Optional[str] = None   # "text", "select", "radio", "checkbox"
    options: Optional[List[str]] = None  # Available options for dropdowns/radios


class ClassifyFieldResponse(BaseModel):
    field_key: str        # Matches a key in the user profile schema
    confidence: float     # 0.0–1.0
    answer: Optional[Any] = None   # The resolved answer value from user's profile


class AnswerOpenEndedRequest(BaseModel):
    question: str
    context: Optional[str] = None   # Job description or surrounding text
