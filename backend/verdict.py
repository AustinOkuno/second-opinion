"""Combines the rule checks, the AI's opinion, and outside evidence
into one final answer for the user.

Key safety idea: the rules set a "floor". If the rules find strong
warning signs, the AI can't talk the verdict down, even if a scam
message tricks it into saying everything is fine.
"""
from analysis_models import SEVERITY, LLMResult, RedFlag, RuleResult
from rules import CATEGORY_LABELS

# When several rules match, name the scam after the "story" (bail, tech support,
# prize...) before the payment method or pressure tactic it uses.
TYPE_PRIORITY = [
    "bail_emergency", "tech_support", "prize", "account_threat", "small_fee",
    "crypto_payment", "gift_card", "asks_for_secrets", "payment_app", "secrecy",
    "short_link", "number_link", "urgency",
]

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


# Each verdict owns a band of the 0-100 risk score, so the number always agrees
# with the verdict. Where it lands inside the band depends on how many warning
# signs were found. It's a consistent risk level, not a probability.
RISK_RANGES = {
    "likely_scam": (75, 99),
    "suspicious": (40, 74),
    "cannot_tell": (20, 39),
    "no_red_flags_found": (0, 15),
}


def risk_score(verdict: str, rules: RuleResult, red_flag_count: int) -> int:
    low, high = RISK_RANGES[verdict]
    strength = min(1.0, (rules.score + 2 * red_flag_count) / 12)
    return low + round(strength * (high - low))


def rules_scam_type(rules: RuleResult) -> str | None:
    """Name the scam after the most telling rule that matched."""
    for category in TYPE_PRIORITY:
        if category in rules.categories:
            return CATEGORY_LABELS.get(category)
    return None


def _clean_type(t: str | None) -> str | None:
    if not t:
        return None
    t = " ".join(str(t).split())[:40]
    return t or None


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
        flags = rules.flags[:6]
        return {
            "verdict": verdict,
            "summary": RULE_SUMMARIES.get(verdict, RULE_SUMMARIES["cannot_tell"]),
            "red_flags": [f.model_dump() for f in flags],
            "evidence": evidence,
            "next_steps": DEFAULT_NEXT_STEPS[verdict],
            "risk_score": risk_score(verdict, rules, len(flags)),
            "scam_type": rules_scam_type(rules) if verdict in ("likely_scam", "suspicious") else None,
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

    scam_type = _clean_type(llm.scam_type) or rules_scam_type(rules)

    floor = rules_floor(rules)
    if floor and SEVERITY[floor] > SEVERITY[verdict]:
        # The AI said something milder than the rules allow. Trust the
        # rules and replace the AI's wording, which may have been tricked.
        verdict = floor
        summary = RULE_SUMMARIES[floor]
        next_steps = DEFAULT_NEXT_STEPS[floor]
        scam_type = rules_scam_type(rules)  # the AI's label may have been tricked too

    # 4. Red flags shown to the user.
    if verdict == "no_red_flags_found":
        red_flags = []
        scam_type = None
    else:
        red_flags = _merge_flags(ai_flags, rules.flags)

    return {
        "verdict": verdict,
        "summary": summary,
        "red_flags": [f.model_dump() for f in red_flags],
        "evidence": evidence,
        "next_steps": next_steps[:3],
        "risk_score": risk_score(verdict, rules, len(red_flags)),
        "scam_type": scam_type,
        "used_ai": True,
    }
