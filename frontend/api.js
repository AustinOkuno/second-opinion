/*
 * Second Opinion – backend connector
 * ------------------------------------------------------------
 * The ONLY file that talks to the backend.
 *
 * Request  (POST, multipart/form-data)
 *   text   : the pasted message (may be empty if only a screenshot was sent)
 *   image  : optional screenshot file
 *
 * Response (JSON) – the "contract" the backend should return:
 *   {
 *     "verdict":    "scam" | "suspicious" | "safe",
 *     "confidence": "high" | "medium" | "low",        (optional)
 *     "summary":    "One plain sentence for the user.",
 *     "reasons":    [ { "quote": "exact words from the message", "why": "plain explanation" } ],
 *     "next_steps": [ "Short instruction", "Another instruction" ],
 *     "note":       "Optional extra message shown in a yellow box"
 *   }
 *
 * normalize() below is forgiving: it also accepts common variations
 * (score: 0.92, is_scam: true, reasons as plain strings, "probably_fine", etc.)
 * so the UI keeps working even if the backend output is a little different.
 */
window.SecondOpinionAPI = (() => {
  const cfg = window.SO_CONFIG;
  const MOCK_DELAY_MS = 1200;

  const log = (...args) => { if (cfg.DEBUG) console.log("[Second Opinion]", ...args); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  class CheckError extends Error {
    constructor(kind, detail, status) {
      super(detail || kind);
      this.name = "CheckError";
      this.kind = kind;          // "network" | "timeout" | "server" | "bad-response"
      this.detail = detail;
      this.status = status;
    }
  }

  async function check({ text = "", image = null } = {}) {
    const data = cfg.USE_MOCK ? await checkMock(text, image) : await checkBackend(text, image);
    return normalize(data, text);
  }

  async function checkMock(text, image) {
    await wait(MOCK_DELAY_MS);
    const data = window.MockChecker.analyze(text, image);
    log("mock response", data);
    return data;
  }

  async function checkBackend(text, image) {
    const form = new FormData();
    form.append("text", text);
    if (image) form.append("image", image, image.name || "screenshot.png");

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.TIMEOUT_MS);
    let res;
    log("POST", cfg.API_URL, { text, image: image && image.name });
    try {
      res = await fetch(cfg.API_URL, { method: "POST", body: form, signal: ctrl.signal });
    } catch (e) {
      throw new CheckError(e.name === "AbortError" ? "timeout" : "network", String(e));
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      log("server error", res.status, detail);
      throw new CheckError("server", detail, res.status);
    }

    let data;
    try { data = await res.json(); } catch (e) { throw new CheckError("bad-response", "Response was not JSON"); }
    log("response", data);
    return data;
  }

  /* ---------- Make any reasonable backend output fit the UI ---------- */
  const VERDICT_WORDS = {
    scam: ["scam", "fraud", "phishing", "malicious", "dangerous", "high", "high_risk", "likely_scam", "spam"],
    suspicious: ["suspicious", "warning", "maybe", "unsure", "medium", "medium_risk", "possible_scam", "uncertain"],
    ok: ["safe", "ok", "fine", "probably_fine", "legit", "legitimate", "benign", "low", "low_risk", "not_scam", "ham"]
  };

  // Accept 0-100 as well as 0-1.
  const toFraction = (n) => (n > 1 ? n / 100 : n);

  function toVerdict(d) {
    const word = String(d.verdict || d.label || d.classification || d.result || "")
      .toLowerCase().trim().replace(/[\s-]+/g, "_");
    for (const verdict of Object.keys(VERDICT_WORDS)) {
      if (VERDICT_WORDS[verdict].includes(word)) return verdict;
    }
    if (typeof d.is_scam === "boolean") return d.is_scam ? "scam" : "ok";
    const score = [d.score, d.risk_score, d.probability].find((s) => s != null);
    if (typeof score === "number") {
      const s = toFraction(score);
      return s >= 0.7 ? "scam" : s >= 0.35 ? "suspicious" : "ok";
    }
    return "suspicious";                            // never say "safe" when unsure
  }

  function toConfidence(d) {
    const c = d.confidence;
    if (typeof c === "number") {
      const f = toFraction(c);
      return f >= 0.8 ? "high" : f >= 0.5 ? "medium" : "low";
    }
    const word = String(c || "").toLowerCase();
    return ["high", "medium", "low"].includes(word) ? word : "";
  }

  function toReasons(d) {
    let list = d.reasons || d.red_flags || d.flags || d.signals || [];
    if (!Array.isArray(list)) list = [list];
    return list
      .map((r) => typeof r === "string"
        ? { quote: "", why: r }
        : {
            quote: r.quote || r.phrase || r.text || r.match || "",
            why: r.why || r.reason || r.explanation || r.description || ""
          })
      .filter((r) => r.why || r.quote);
  }

  function toSteps(d, verdict) {
    let steps = d.next_steps || d.steps || d.actions || d.what_to_do;
    if (typeof steps === "string") steps = [steps];
    return Array.isArray(steps) && steps.length ? steps.map(String) : DEFAULT_STEPS[verdict];
  }

  const DEFAULT_STEPS = {
    scam: ["Don't tap any link or call any number in this message.", "Don't send money, gift cards, or codes.", "Show this to someone you trust."],
    suspicious: ["Don't tap links or call numbers in this message yet.", "Contact the company using a number you already trust.", "Show this to someone you trust."],
    ok: ["If you weren't expecting it, call the sender on a number you already have.", "Never share codes, passwords, or card numbers from a message."]
  };
  const DEFAULT_SUMMARY = {
    scam: "This message has strong signs of a scam.",
    suspicious: "Some things about this message are worrying. Check before you act.",
    ok: "We didn't find the usual scam warning signs."
  };
  const NOT_SURE = "Not certain. Better to check than to guess.";
  const SURE_TEXT = { high: "Very sure", medium: "Fairly sure", low: NOT_SURE };
  const OK_NO_CONFIDENCE = "This is not a guarantee. If it later asks for money or personal details, check again.";

  function normalize(d, text) {
    d = d || {};
    if (d.result && typeof d.result === "object") d = d.result;     // unwrap { result: {...} }
    const verdict = toVerdict(d);
    const conf = toConfidence(d);
    return {
      verdict,
      summary: d.summary || d.explanation || d.message || DEFAULT_SUMMARY[verdict],
      sure: SURE_TEXT[conf] || (verdict === "ok" ? OK_NO_CONFIDENCE : NOT_SURE),
      reasons: toReasons(d),
      steps: toSteps(d, verdict),
      note: d.note || "",
      text
    };
  }

  return { check, normalize, CheckError };
})();
