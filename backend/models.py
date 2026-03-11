from sqlalchemy import Column, String, Boolean, JSON, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Personal Info
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address_line1 = Column(String, nullable=True)
    address_line2 = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    zip_code = Column(String, nullable=True)
    country = Column(String, nullable=True)

    # Links
    linkedin_url = Column(String, nullable=True)
    github_url = Column(String, nullable=True)
    portfolio_url = Column(String, nullable=True)
    website_url = Column(String, nullable=True)

    # Work Authorization
    authorized_to_work = Column(Boolean, nullable=True)
    sponsorship_needed = Column(Boolean, nullable=True)
    # e.g. "US Citizen", "Green Card", "H1B", "OPT", etc.
    visa_status = Column(String, nullable=True)

    # EEO Fields (stored as string to allow "Decline to Self Identify")
    gender = Column(String, nullable=True)      # Male / Female / Non-binary / Decline
    ethnicity = Column(String, nullable=True)   # Hispanic / White / Asian / etc / Decline
    veteran_status = Column(String, nullable=True)   # Yes / No / Decline
    disability_status = Column(String, nullable=True)  # Yes / No / Decline

    # Experience / Education stored as JSONB arrays for rich data
    # Each entry: { title, company, start_date, end_date, description }
    work_experience = Column(JSON, nullable=True, default=list)
    # Each entry: { degree, institution, field_of_study, graduation_year }
    education = Column(JSON, nullable=True, default=list)
    # Each entry: { name } 
    skills = Column(JSON, nullable=True, default=list)

    # Resume text extracted for use by Grok in open-ended answers
    resume_text = Column(String, nullable=True)

    # Grok API key (user-specific, encrypted at rest ideally)
    grok_api_key = Column(String, nullable=True)
