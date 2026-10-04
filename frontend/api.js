/*
 * Second Opinion - talks to the backend
 * ------------------------------------------------------------
 * app.js calls SecondOpinionAPI.check({ text, image }) and expects:
 *   { verdict: "scam" | "suspicious" | "ok", summary, likelihood (0-100), type,
 *     reasons: [{ quote, why }], steps: [...], text, note }
 *
 * The backend's POST /check returns:
 *   { verdict: "likely_scam" | "suspicious" | "cannot_tell" | "no_red_flags_found",
 *     summary, red_flags: [{ quote, why }], next_steps: [...],
 *     risk_score (0-100), scam_type, evidence, used_ai }
 *
 * This file sends the request and translates between the two.
 */
(function () {
  var cfg = window.SO_CONFIG || {};
  var IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  var MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  function log() {
    if (cfg.DEBUG) console.log.apply(console, ["[Second Opinion]"].concat([].slice.call(arguments)));
  }

  // app.js checks `err instanceof SecondOpinionAPI.CheckError` and reads err.kind
  function CheckError(kind, detail, status) {
    this.name = "CheckError";
    this.kind = kind;            // "network" | "timeout" | "server" | "bad-image" | "bad-response"
    this.detail = detail || "";
    this.status = status || 0;
    this.message = kind;
  }
  CheckError.prototype = Object.create(Error.prototype);
  CheckError.prototype.constructor = CheckError;

  // The page has three looks; "couldn't tell" uses the careful (suspicious) look plus a note.
  var VERDICTS = { likely_scam: "scam", suspicious: "suspicious", cannot_tell: "suspicious", no_red_flags_found: "ok" };

  function toBase64(f) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1]); };   // drop "data:image/png;base64,"
      r.onerror = function () { reject(new CheckError("bad-image", "Could not read the screenshot.")); };
      r.readAsDataURL(f);
    });
  }

  function normalize(d, text) {
    if (!d || !VERDICTS[d.verdict] || !d.summary) throw new CheckError("bad-response", JSON.stringify(d));
    var notes = [];
    if (d.verdict === "cannot_tell") notes.push("We couldn't fully check this message, so treat it with care.");
    if (d.used_ai === false) notes.push("Our AI checker wasn't available, so this answer comes from our basic safety checks only.");
    return {
      verdict: VERDICTS[d.verdict],
      summary: d.summary,
      likelihood: typeof d.risk_score === "number" ? d.risk_score : undefined,
      type: d.scam_type || "",
      reasons: (d.red_flags || []).filter(function (r) { return r && (r.quote || r.why); }),
      steps: d.next_steps || [],
      note: notes.join(" "),
      text: text
    };
  }

  async function check(opts) {
    var text = (opts && opts.text) || "", image = (opts && opts.image) || null;

    if (cfg.USE_MOCK) {
      var fake = await window.SO_MOCK(text, image);
      log("mock response", fake);
      return normalize(fake, text);
    }

    var payload = { text: text, image: null, media_type: "image/png" };
    if (image) {
      if (IMAGE_TYPES.indexOf(image.type) < 0 || image.size > MAX_IMAGE_BYTES) throw new CheckError("bad-image");
      payload.image = await toBase64(image);
      payload.media_type = image.type;
    }

    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, cfg.TIMEOUT_MS || 45000);
    var res;
    log("POST", cfg.API_URL, { text: text, image: image && image.name });
    try {
      res = await fetch(cfg.API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
    } catch (e) {
      throw new CheckError(e && e.name === "AbortError" ? "timeout" : "network", String(e));
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      var detail = await res.text().catch(function () { return ""; });
      log("server error", res.status, detail);
      throw new CheckError("server", detail, res.status);
    }
    var data;
    try { data = await res.json(); } catch (e) { throw new CheckError("bad-response", "Response was not JSON"); }
    log("response", data);
    return normalize(data, text);
  }

  window.SecondOpinionAPI = { check: check, CheckError: CheckError };
})();
