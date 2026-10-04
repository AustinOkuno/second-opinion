"""Data shapes used by the analysis code (Person B).

These describe what the AI must return and what the rules produce.
Person A's schemas.py describes the final API response; keep the two in sync.
"""
from typing import Literal

from pydantic import BaseModel, Field

Verdict = Literal["likely_scam", "suspicious", "no_red_flags_found", "cannot_tell"]

# Higher number = more serious. Used to pick the "worst" verdict.
SEVERITY = {
    "no_red_flags_found": 0,
    "cannot_tell": 1,
    "suspicious": 2,
    "likely_scam": 3,
}


class RedFlag(BaseModel):
    quote: str   # exact words copied from the message (used for highlighting)
    why: str     # plain-language reason it's suspicious


class LLMResult(BaseModel):
    verdict: Verdict
    summary: str
    red_flags: list[RedFlag] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)
    scam_type: str | None = None   # short label, e.g. "Grandparent scam"


class RuleResult(BaseModel):
    flags: list[RedFlag] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    score: int = 0       # total weight of every rule that matched
    strongest: int = 0   # weight of the single strongest rule that matched
