"""Simple warning-sign checks that don't need AI.

They run instantly, work offline, and act as a safety net:
if the AI is down or gets tricked, these still catch obvious scams.
"""
import re

from analysis_models import RedFlag, RuleResult

# (category, weight, pattern, plain-language reason)
# weight: 3 = strong warning sign, 2 = medium, 1 = mild
RULES = [
    ("gift_card", 3,
     r"\b(gift ?cards?|itunes cards?|google play cards?|steam cards?)\b",
     "Real companies and government agencies don't ask to be paid with gift cards."),
    ("crypto_payment", 3,
     r"\b(bitcoin|crypto(currency)?|btc|usdt|bitcoin atm|crypto atm)\b",
     "Being told to pay with cryptocurrency is a common scam sign."),
    ("asks_for_secrets", 3,
     r"\b(send|give|share|confirm|provide|enter|reply with|tell (me|us))\b[^.!?\n]{0,40}"
     r"\b(password|social security|ssn|pin|verification code|one[- ]time code|account number)\b",
     "Real organizations don't ask for passwords, codes, or your Social Security number by message."),
    ("secrecy", 3,
     r"\b(don['’]?t tell|do not tell|keep (this|it) (a )?secret|between (you and me|us))\b",
     "Scammers often ask you to keep things secret so no one can warn you."),
    ("bail_emergency", 3,
     r"\b(bail money|need bail|i['’]?m in jail|been arrested)\b",
     "A sudden request for bail or emergency money is a common 'family in trouble' scam."),
    ("payment_app", 2,
     r"\b(wire transfer|western union|moneygram|zelle|cash ?app|venmo)\b",
     "Money sent by wire or payment apps is very hard to get back."),
    ("account_threat", 2,
     r"\b(account (has been |will be |is )?(suspended|locked|closed|compromised|disabled)"
     r"|unusual (sign-?in|activity)|verify your (account|identity))\b",
     "Messages saying your account is locked often try to get you to log in on a fake site."),
    ("prize", 2,
     r"\b(you(['’]ve| have)? won|claim your (prize|reward)|lottery|sweepstakes)\b",
     "Being told you won something you didn't enter is a classic scam."),
    ("tech_support", 2,
     r"\b(virus (detected|found)|your (computer|device|pc) (is|has been) (infected|hacked)"
     r"|call (microsoft|apple|windows) support|remote access)\b",
     "Warnings that your computer is infected are usually tech support scams."),
    ("short_link", 2,
     r"\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly)/\S+",
     "Shortened links hide where they really go."),
    ("number_link", 2,
     r"https?://\d{1,3}(\.\d{1,3}){3}\S*",
     "Links made of numbers instead of a website name are a warning sign."),
    ("small_fee", 1,
     r"\b(redelivery fee|small fee|processing fee|customs fee|pay a fee)\b",
     "Asking for a small fee to release a package is a common delivery scam."),
    ("urgency", 1,
     r"\b(urgent(ly)?|immediately|right away|act now|within \d+ (hours?|minutes?)"
     r"|today only|final notice|last chance|expires? (today|soon))\b",
     "Pressure to act fast is meant to stop you from thinking it through."),
]

# Plain-language scam type for each rule, used when the AI is unavailable.
CATEGORY_LABELS = {
    "gift_card": "Gift card scam",
    "crypto_payment": "Crypto payment scam",
    "asks_for_secrets": "Phishing for private info",
    "secrecy": "Secrecy pressure scam",
    "bail_emergency": "Family emergency scam",
    "payment_app": "Payment app scam",
    "account_threat": "Account phishing",
    "prize": "Prize or lottery scam",
    "tech_support": "Tech support scam",
    "short_link": "Suspicious link",
    "number_link": "Suspicious link",
    "small_fee": "Fake delivery fee",
    "urgency": "Pressure tactic",
}

COMPILED = [(cat, w, re.compile(p, re.IGNORECASE), why) for cat, w, p, why in RULES]


def run_rules(text: str) -> RuleResult:
    """Check the message against every rule and return what matched."""
    result = RuleResult()
    if not text:
        return result

    for category, weight, pattern, why in COMPILED:
        match = pattern.search(text)
        if match:
            # match.group(0) is the exact text from the message, so the
            # frontend can find and highlight it.
            result.flags.append(RedFlag(quote=match.group(0), why=why))
            result.categories.append(category)
            result.score += weight
            result.strongest = max(result.strongest, weight)

    return result
