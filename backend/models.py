from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Verdict(str, Enum):
    LIKELY_SCAM = "likely_scam"
    SUSPICIOUS = "suspicious"
    NO_RED_FLAGS_FOUND = "no_red_flags_found"   # never "safe"
    CANNOT_TELL = "cannot_tell"


class CheckRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    text: str = Field(default="", max_length=5000)
    image: str | None = None          # base64 screenshot (optional)
    media_type: str = "image/png"

    @model_validator(mode="after")
    def need_text_or_image(self):
        if not self.text and not self.image:
            raise ValueError("Send a message or a screenshot.")
        return self


class RedFlag(BaseModel):
    quote: str
    why: str


class EvidenceItem(BaseModel):
    title: str = ""
    link: str = ""
    snippet: str = ""


class CheckResult(BaseModel):
    verdict: Verdict
    summary: str
    reason: str = ""                  # same as summary; kept so older frontend code still works
    red_flags: list[RedFlag] = []
    evidence: list[EvidenceItem] = []
    next_steps: list[str] = []
    risk_score: int = 0               # 0-100, always inside the band for its verdict
    scam_type: str | None = None      # short label, e.g. "Family emergency scam"
    used_ai: bool = False
