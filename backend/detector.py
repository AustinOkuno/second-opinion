import base64

from analysis import analyze_message
from models import CheckResult


class ScamDetector:
    def detect(self, text: str, image: str | None = None,
               media_type: str = "image/png", evidence: list | None = None) -> CheckResult:
        result = analyze_message(text, image, media_type, evidence or [])
        result["reason"] = result["summary"]
        return CheckResult.model_validate(result)

    def detect_image(self, image_bytes: bytes, media_type: str) -> CheckResult:
        """Used by /check-image (file upload). Turns the file into base64 and runs the same check."""
        image_b64 = base64.b64encode(image_bytes).decode("ascii")
        return self.detect("", image_b64, media_type)
