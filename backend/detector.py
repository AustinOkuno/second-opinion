from models import CheckRequest, CheckResult, Verdict
class ScamDetector:

    def detect(self, txt:str) -> CheckResult:
        #raise RuntimeError("boom")
        # Implement the logic to detect scams based on the request
        # For now, we'll return a placeholder response
        return CheckResult(verdict=Verdict.SAFE, reason="Placeholder reason", text=txt)