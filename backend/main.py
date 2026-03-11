from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, Base
from routes import auth, profile, ai

# Create all tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Job Autofill API",
    description="Backend for the AI-powered job application autofill extension.",
    version="1.0.0",
)

# Allow the Chrome extension (and local dev) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(ai.router)


@app.get("/health")
def health():
    return {"status": "ok"}
