"""Combines the rule checks, the AI's opinion, and outside evidence
into one final answer for the user.

Key safety idea: the rules set a "floor". If the rules find strong
warning signs, the AI can't talk the verdict down, even if a scam
message tricks it into saying everything is fine.
"""
from analysis_models import SEVERITY, LLMResult, RedFlag, RuleResult

DEFAULT_NEXT_STEPS = {
    "likely_scam": [
        "Do not reply, click links, or call numbers in the message.",
        "Do not send money, gift cards, or any codes.",
        "If it claims to be a company you use, contact them using the number on their official website or your card.",
    ],
    "suspicious": [
        "Don't act on it yet.",
        "Check with the company directly using a phone number you already trust.",
        "Ask a family member or friend to look at it with you.",
    ],
    "no_red_flags_found": [
        "We didn't find warning signs, but stay careful.",
        "If it later asks for money or personal information, check it again.",
    ],
    "cannot_tell": [
        "We couldn't fully check this message.",
        "Don't send money or personal information until you've confirmed who sent it.",
        "Ask someone you trust to look at it with you.",
    ],
}

RULE_SUMMARIES = {
    "likely_scam": "Our safety checks found several strong warning signs that this is a scam.",
    "suspicious": "Our safety checks found warning signs in this message.",
    "cannot_tell": "We couldn't find clear warning signs, but we weren't able to fully check this message.",
}


def _normalize(s: str) -> str:
    return " ".join(s.casefold().split())


def _quote_in_text(quote: str, text: str) -> bool:
    return bool(quote.strip()) and _normalize(quote) in _normalize(text)


def rules_floor(rules: RuleResult) -> str | None:
    """The lowest verdict the rules allow when the AI is also used."""
    if rules.score >= 5:
        return "likely_scam"
    if rules.strongest >= 3:
        return "suspicious"
    return None  # mild hits alone don't override the AI


def rules_only_verdict(rules: RuleResult) -> str:
    """The verdict when the AI isn't available."""
    if rules.score >= 5:
        return "likely_scam"
    if rules.score >= 2:
        return "suspicious"
    return "cannot_tell"  # rules alone can't vouch for a message


def _merge_flags(ai_flags: list[RedFlag], rule_flags: list[RedFlag], limit: int = 6) -> list[RedFlag]:
    merged = list(ai_flags)
    for rf in rule_flags:
        overlaps = any(
            _normalize(rf.quote) in _normalize(f.quote) or _normalize(f.quote) in _normalize(rf.quote)
            for f in merged
        )
        if not overlaps:
            merged.append(rf)
    return merged[:limit]


def build_verdict(text: str, rules: RuleResult, llm: LLMResult | None,
                  evidence: list | None = None) -> dict:
    evidence = evidence or []

    # 1. No AI answer: fall back to rules only.
    if llm is None:
        verdict = rules_only_verdict(rules)
        return {
            "verdict": verdict,
            "summary": RULE_SUMMARIES.get(verdict, RULE_SUMMARIES["cannot_tell"]),
            "red_flags": [f.model_dump() for f in rules.flags[:6]],
            "evidence": evidence,
            "next_steps": DEFAULT_NEXT_STEPS[verdict],
            "used_ai": False,
        }

    # 2. Drop AI quotes that aren't really in the message (they can't be
    #    highlighted, and might be made up). Skip this check for
    #    screenshot-only input, where there's no text to compare against.
    if text.strip():
        ai_flags = [f for f in llm.red_flags if _quote_in_text(f.quote, text)]
    else:
        ai_flags = list(llm.red_flags)

    # 3. Apply the rules floor.
    verdict = llm.verdict
    summary = llm.summary
    next_steps = llm.next_steps or DEFAULT_NEXT_STEPS[verdict]

    floor = rules_floor(rules)
    if floor and SEVERITY[floor] > SEVERITY[verdict]:
        # The AI said something milder than the rules allow. Trust the
        # rules and replace the AI's wording, which may have been tricked.
        verdict = floor
        summary = RULE_SUMMARIES[floor]
        next_steps = DEFAULT_NEXT_STEPS[floor]

    # 4. Red flags shown to the user.
    if verdict == "no_red_flags_found":
        red_flags = []
    else:
        red_flags = _merge_flags(ai_flags, rules.flags)

    return {
        "verdict": verdict,
        "summary": summary,
        "red_flags": [f.model_dump() for f in red_flags],
        "evidence": evidence,
        "next_steps": next_steps[:3],
        "used_ai": True,
    }
