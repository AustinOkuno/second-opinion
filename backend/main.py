from detector import ScamDetector
from fastapi import FastAPI, HTTPException
from models import Verdict, CheckRequest, CheckResult
import logging
from fastapi.middleware.cors import CORSMiddleware
from fastapi import UploadFile

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB

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


@app.post("/check-image")
async def check_image(file: UploadFile) -> CheckResult:
    # Read the image file as bytes
    media_type = file.content_type

    #check allowed image types
    if media_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported media type: {media_type}. Allowed types are: {', '.join(sorted(ALLOWED_IMAGE_TYPES))}")
    
    image_bytes = await file.read()

    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image file is empty.")

    #check image size
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image file is too large. Maximum size is 5 MB.")

    # Call the detect_image method of the ScamDetector
    try:
        return detector.detect_image(image_bytes, media_type)
    except Exception:
        logger = logging.getLogger(__name__)
        logger.exception("Image detector failed")
        raise HTTPException(status_code=503, detail="Please try again later. The image detector is currently unavailable.")