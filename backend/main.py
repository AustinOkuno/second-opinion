import logging

from dotenv import load_dotenv
load_dotenv()  # loads ANTHROPIC_API_KEY from backend/.env

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from detector import ScamDetector
from models import CheckRequest, CheckResult

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB

logger = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500", "http://localhost:5500",   # python -m http.server 5500 / VS Code Live Server
        "http://127.0.0.1:5173", "http://localhost:5173",   # Vite
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
detector = ScamDetector()


@app.get("/")
def read_root():
    return {"Hello": "World"}


# The website uses this route: JSON with text and/or a base64 screenshot.
@app.post("/check")
def check_scam(request: CheckRequest) -> CheckResult:
    try:
        return detector.detect(request.text, request.image, request.media_type)
    except Exception:
        logger.exception("Detector failed")
        raise HTTPException(status_code=503,
                            detail="Please try again later. The detector is currently unavailable.")


# File-upload version of the screenshot check.
@app.post("/check-image")
async def check_image(file: UploadFile) -> CheckResult:
    media_type = file.content_type
    if media_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415,
                            detail=f"Unsupported media type: {media_type}. "
                                   f"Allowed types are: {', '.join(sorted(ALLOWED_IMAGE_TYPES))}")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image file is empty.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image file is too large. Maximum size is 5 MB.")

    try:
        return detector.detect_image(image_bytes, media_type)
    except Exception:
        logger.exception("Image detector failed")
        raise HTTPException(status_code=503,
                            detail="Please try again later. The image detector is currently unavailable.")
