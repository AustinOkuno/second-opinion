/*
 * Second Opinion – fake checker for demo / design mode
 * ------------------------------------------------------------
 * Used only when SO_CONFIG.USE_MOCK is true. It returns the SAME JSON
 * shape the real backend should return, so the UI is tested the same way.
 * Safe to delete once the backend is reliable.
 */
window.MockChecker = (() => {
  const RULES = [
    { tag: "giftcard", w: 3, re: /gift ?cards?|itunes card|google play card|steam card/gi,
      why: "Only scammers ask to be paid in gift cards. Real companies and government offices never do." },
    { tag: "money", w: 3, re: /wire (?:the )?(?:money|transfer)|western union|moneygram|bitcoin|crypto(?:currency)?|zelle|cash ?app/gi,
      why: "Money sent this way is almost impossible to get back, which is why scammers ask for it." },
    { tag: "secret", w: 3, re: /(?:don'?t|do not) (?:tell|share|mention)[^.!?]*|keep (?:this|it) (?:a )?secret|between us/gi,
      why: "Being told to keep it secret stops your family from helping you spot the scam." },
    { tag: "trouble", w: 3, re: /\b(?:bail|jail|arrested|in an accident)\b/gi,
      why: "A relative in trouble who needs money fast is a very common scam. Voices can be copied or faked." },
    { tag: "remote", w: 3, re: /remote access|anydesk|teamviewer|install (?:this|the) (?:app|software)/gi,
      why: "Giving someone control of your computer lets them see your accounts and take your money." },
    { tag: "prize", w: 3, re: /\byou(?:'ve| have)? won\b|\bprize\b|lottery|sweepstakes|claim your/gi,
      why: "You can't win a contest you never entered. Prize messages are bait for fees or personal details." },
    { tag: "urgent", w: 2, re: /(?:within|in the next) \d+ (?:hours?|minutes?)|act now|immediately|urgent|final notice|right away|last chance/gi,
      why: "Scammers invent deadlines so you panic and skip the step where you check." },
    { tag: "secrets", w: 2, re: /social security|\bssn\b|medicare number|password|passcode|\bpin\b|verification code|one-time code|card number|routing number/gi,
      why: "Real companies don't ask for these by text, email, or phone call." },
    { tag: "account", w: 2, re: /suspended|locked|unusual activity|unauthorized|compromised|verify your (?:account|identity)|your account has been/gi,
      why: "Fake account alerts are used to get you to log in on a copy of the real website." },
    { tag: "gov", w: 2, re: /\birs\b|social security administration|arrest warrant|\bwarrant\b/gi,
      why: "Government offices write to you by mail first. They don't threaten arrest by text or phone." },
    { tag: "package", w: 2, re: /\b(?:package|parcel|delivery)\b[^.!?]*\b(?:fee|redeliver|reschedule|failed|held|unable)\b/gi,
      why: "Fake delivery notices ask for a small fee so they can take your card number." },
    { tag: "link", w: 1.5, re: /https?:\/\/\S+|\b(?:bit\.ly|tinyurl\.com)\/\S+|\b[a-z0-9-]+\.(?:xyz|top|info|click|help|live|online)\b\S*/gi,
      why: "A link in a message you didn't ask for can lead to a fake website. Don't tap it." }
  ];

  const SCREENSHOT_EXAMPLE = "Notice: Your package could not be delivered. Pay a small redelivery fee within 24 hours: http://usps-redeliver.top/pay";
  const SCREENSHOT_NOTE = "Demo mode: screenshots are not read yet. This result uses an example message.";

  function match(text) {
    const reasons = [], tags = {};
    let score = 0;
    for (const r of RULES) {
      const m = text.match(r.re);
      if (!m) continue;
      score += r.w;
      tags[r.tag] = true;
      reasons.push({ quote: m[0].trim().slice(0, 70), why: r.why });
    }
    return { score, tags, reasons };
  }

  function stepsFor(verdict, tags) {
    if (verdict === "safe") return [];
    const steps = [verdict === "scam"
      ? "Don't tap any link or call any number in this message."
      : "Don't tap links or call numbers in this message yet."];
    if (tags.giftcard || tags.money) steps.push("Do not send money, gift cards, or codes. Stop here.");
    if (tags.trouble) steps.push("Hang up. Call your grandchild or relative on the number you already have.");
    else if (tags.account) steps.push("Call your bank using the number on the back of your card.");
    else if (tags.gov) steps.push("Look up the agency's real number yourself. Don't use one from this message.");
    else if (tags.package) steps.push("Check the order on the store's own website or app.");
    else steps.push("If you think it might be real, contact the company using a number you already trust.");
    steps.push("Show this to someone you trust. Anyone can be fooled, and checking is smart.");
    return steps;
  }

  function summaryFor(verdict, n) {
    if (verdict === "scam") return `This message has ${n} classic scam warning sign${n === 1 ? "" : "s"}.`;
    if (verdict === "suspicious") return `This has ${n === 1 ? "one warning sign" : n + " warning signs"}. Check it carefully before you do anything.`;
    return "We didn't find the usual scam warning signs in this message.";
  }

  function confidenceFor(verdict, score) {
    if (verdict === "scam") return score >= 6 ? "high" : "medium";
    if (verdict === "suspicious") return "low";
    return "";
  }

  function analyze(text, image) {
    let note = "";
    if (!text && image) {
      text = SCREENSHOT_EXAMPLE;
      note = SCREENSHOT_NOTE;
    }
    const { score, tags, reasons } = match(text);
    const verdict = score >= 4 ? "scam" : score >= 1 ? "suspicious" : "safe";
    const steps = stepsFor(verdict, tags);
    return {
      verdict,
      confidence: confidenceFor(verdict, score),
      summary: summaryFor(verdict, reasons.length),
      reasons,
      next_steps: steps.length ? steps : undefined,
      note
    };
  }

  return { analyze };
})();
