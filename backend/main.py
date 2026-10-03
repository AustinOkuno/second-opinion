import logging

from dotenv import load_dotenv
load_dotenv()  # loads ANTHROPIC_API_KEY from backend/.env

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from detector import ScamDetector
from models import CheckRequest, CheckResult

logger = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500", "http://localhost:5500",   # VS Code Live Server
        "http://127.0.0.1:5173", "http://localhost:5173",   # Vite
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
detector = ScamDetector()


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.post("/check")
def check_scam(request: CheckRequest) -> CheckResult:
    try:
        return detector.detect(request.text, request.image, request.media_type)
    except Exception:
        logger.exception("Detector failed")
        raise HTTPException(status_code=503,
                            detail="Please try again later. The detector is currently unavailable.")