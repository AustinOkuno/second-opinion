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
window.SecondOpinionAPI = (function () {
  var cfg = window.SO_CONFIG;

  function log() { if (cfg.DEBUG) console.log.apply(console, ["[Second Opinion]"].concat([].slice.call(arguments))); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function CheckError(kind, detail, status) {
    this.kind = kind;          // "network" | "timeout" | "server" | "bad-response"
    this.detail = detail;
    this.status = status;
  }

  async function check(input) {
    var text = input.text || "";
    var image = input.image || null;

    if (cfg.USE_MOCK) {
      await wait(1200);
      var fake = window.MockChecker.analyze(text, image);
      log("mock response", fake);
      return normalize(fake, text);
    }

    var form = new FormData();
    form.append("text", text);
    if (image) form.append("image", image, image.name || "screenshot.png");

    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, cfg.TIMEOUT_MS);
    var res;
    log("POST", cfg.API_URL, { text: text, image: image && image.name });
    try {
      res = await fetch(cfg.API_URL, { method: "POST", body: form, signal: ctrl.signal });
    } catch (e) {
      throw new CheckError(e.name === "AbortError" ? "timeout" : "network", String(e));
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      var detail = "";
      try { detail = await res.text(); } catch (e) {}
      log("server error", res.status, detail);
      throw new CheckError("server", detail, res.status);
    }

    var data;
    try { data = await res.json(); } catch (e) { throw new CheckError("bad-response", "Response was not JSON"); }
    log("response", data);
    return normalize(data, text);
  }

  /* ---------- Make any reasonable backend output fit the UI ---------- */
  var SCAM = ["scam", "fraud", "phishing", "malicious", "dangerous", "high", "high_risk", "likely_scam", "spam"];
  var SUS = ["suspicious", "warning", "maybe", "unsure", "medium", "medium_risk", "possible_scam", "uncertain"];
  var OK = ["safe", "ok", "fine", "probably_fine", "legit", "legitimate", "benign", "low", "low_risk", "not_scam", "ham"];

  function toVerdict(d) {
    var v = String(d.verdict || d.label || d.classification || d.result || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    if (SCAM.indexOf(v) > -1) return "scam";
    if (SUS.indexOf(v) > -1) return "suspicious";
    if (OK.indexOf(v) > -1) return "ok";
    if (typeof d.is_scam === "boolean") return d.is_scam ? "scam" : "ok";
    var score = d.score != null ? d.score : d.risk_score != null ? d.risk_score : d.probability;
    if (typeof score === "number") {
      if (score > 1) score = score / 100;           // accept 0-100 as well as 0-1
      return score >= 0.7 ? "scam" : score >= 0.35 ? "suspicious" : "ok";
    }
    return "suspicious";                            // never say "safe" when unsure
  }

  function toConfidence(d) {
    var c = d.confidence;
    if (typeof c === "number") { if (c > 1) c = c / 100; return c >= 0.8 ? "high" : c >= 0.5 ? "medium" : "low"; }
    c = String(c || "").toLowerCase();
    return ["high", "medium", "low"].indexOf(c) > -1 ? c : "";
  }

  function toReasons(d) {
    var list = d.reasons || d.red_flags || d.flags || d.signals || [];
    if (!Array.isArray(list)) list = [list];
    return list.map(function (r) {
      if (typeof r === "string") return { quote: "", why: r };
      return { quote: r.quote || r.phrase || r.text || r.match || "", why: r.why || r.reason || r.explanation || r.description || "" };
    }).filter(function (r) { return r.why || r.quote; });
  }

  var DEFAULT_STEPS = {
    scam: ["Don't tap any link or call any number in this message.", "Don't send money, gift cards, or codes.", "Show this to someone you trust."],
    suspicious: ["Don't tap links or call numbers in this message yet.", "Contact the company using a number you already trust.", "Show this to someone you trust."],
    ok: ["If you weren't expecting it, call the sender on a number you already have.", "Never share codes, passwords, or card numbers from a message."]
  };
  var DEFAULT_SUMMARY = {
    scam: "This message has strong signs of a scam.",
    suspicious: "Some things about this message are worrying. Check before you act.",
    ok: "We didn't find the usual scam warning signs."
  };
  var SURE_TEXT = {
    high: "Very sure",
    medium: "Fairly sure",
    low: "Not certain. Better to check than to guess."
  };

  function normalize(d, text) {
    d = d || {};
    if (d.result && typeof d.result === "object") d = d.result;     // unwrap { result: {...} }
    var verdict = toVerdict(d);
    var conf = toConfidence(d);
    var steps = d.next_steps || d.steps || d.actions || d.what_to_do;
    if (typeof steps === "string") steps = [steps];
    var sure = SURE_TEXT[conf] || (verdict === "ok"
      ? "This is not a guarantee. If it later asks for money or personal details, check again."
      : "Not certain. Better to check than to guess.");
    return {
      verdict: verdict,
      summary: d.summary || d.explanation || d.message || DEFAULT_SUMMARY[verdict],
      sure: sure,
      reasons: toReasons(d),
      steps: Array.isArray(steps) && steps.length ? steps.map(String) : DEFAULT_STEPS[verdict],
      note: d.note || "",
      text: text
    };
  }

  return { check: check, normalize: normalize, CheckError: CheckError };
})();
