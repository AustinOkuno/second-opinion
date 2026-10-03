from enum import Enum
from pydantic import BaseModel, ConfigDict, Field

class Verdict(Enum):
    SAFE = "safe"
    SCAM = "scam"
    SUSPICIOUS = "suspicious"



class CheckRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=5000)


class CheckResult(BaseModel):
    verdict: Verdict
    reason: str = Field(min_length=1, max_length=1000)


