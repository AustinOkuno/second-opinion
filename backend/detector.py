from analysis import analyze_message
from models import CheckResult
from models import Verdict


class ScamDetector:
    def detect(self, text: str, image: str | None = None,
               media_type: str = "image/png", evidence: list | None = None) -> CheckResult:
        result = analyze_message(text, image, media_type, evidence or [])
        result["reason"] = result["summary"]
        return CheckResult.model_validate(result)

    def detect_image(self, image: bytes, media_type: str) -> CheckResult:
      # hard-coded CheckResult, like the text fake
            return CheckResult(
            verdict=Verdict.SUSPICIOUS,
            reason="Image analysis not implemented yet",
            summary="Image analysis not implemented yet",
        )