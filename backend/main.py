from detector import ScamDetector
from fastapi import FastAPI, HTTPException
from models import Verdict, CheckRequest, CheckResult
import logging
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
detector = ScamDetector()


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.post("/check")
def check_scam(request: CheckRequest) -> CheckResult:
    # Placeholder implementation - replace with actual scam detection logic
    try:
        return detector.detect(request.text)
    except Exception:
        logger = logging.getLogger(__name__)
        logger.exception("Detector failed")
        raise HTTPException(status_code=503, detail="Please try again later. The detector is currently unavailable.")