"""Person B's single entry point. Person A's /analyze route calls this.

    from analysis import analyze_message
    result = analyze_message(text, image_b64, media_type, evidence)
"""
from llm import run_llm
from rules import run_rules
from verdict import build_verdict


def analyze_message(text: str = "", image_b64: str | None = None,
                    media_type: str = "image/png", evidence: list | None = None) -> dict:
    text = text or ""
    rules = run_rules(text)
    llm = run_llm(text, image_b64, media_type)
    return build_verdict(text, rules, llm, evidence)
