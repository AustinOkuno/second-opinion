from analysis import analyze_message
from models import CheckResult


class ScamDetector:
    def detect(self, text: str, image: str | None = None,
               media_type: str = "image/png", evidence: list | None = None) -> CheckResult:
        result = analyze_message(text, image, media_type, evidence or [])
        result["reason"] = result["summary"]
        return CheckResult.model_validate(result)