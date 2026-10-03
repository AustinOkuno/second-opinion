/*
 * Second Opinion – page behavior
 * ------------------------------------------------------------
 * Handles the chat UI. The only code that talks to the backend is the
 * "Backend connector" section right below; the rest calls API.check().
 */
(function () {
  /* ---------- Settings ---------- */
  var cfg = {
    // Where the backend (backend/main.py) runs. Start it with: uvicorn main:app --reload
    API_URL: "http://localhost:8000/check",
    // Give up waiting after this many milliseconds (the AI can be slow).
    TIMEOUT_MS: 45000,
    // Print requests and responses in the browser console (F12).
    DEBUG: true
  };

  /* ---------- Backend connector ----------
   * Request  (POST JSON, matches CheckRequest in backend/models.py):
   *   { "text": "...", "image": "<base64, no data: prefix>" | null, "media_type": "image/png" }
   * Response (matches CheckResult):
   *   { "verdict": "likely_scam" | "suspicious" | "no_red_flags_found" | "cannot_tell",
   *     "summary": "...", "red_flags": [{ "quote", "why" }], "next_steps": ["..."], "used_ai": bool }
   */
  var API = (function () {
    // Image types the AI can read, and its 5 MB size limit.
    var IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    var MAX_IMAGE_BYTES = 5 * 1024 * 1024;

    function log() { if (cfg.DEBUG) console.log.apply(console, ["[Second Opinion]"].concat([].slice.call(arguments))); }

    function CheckError(kind, detail, status) {
      this.kind = kind;          // "network" | "timeout" | "server" | "bad-image" | "bad-response"
      this.detail = detail;
      this.status = status;
    }

    function toBase64(f) {
      return new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function () { resolve(String(r.result).split(",")[1]); };   // drop "data:image/png;base64,"
        r.onerror = function () { reject(r.error); };
        r.readAsDataURL(f);
      });
    }

    async function check(opts) {
      var text = opts.text || "", image = opts.image || null;
      var payload = { text: text, image: null, media_type: "image/png" };
      if (image) {
        if (IMAGE_TYPES.indexOf(image.type) < 0 || image.size > MAX_IMAGE_BYTES) throw new CheckError("bad-image");
        payload.image = await toBase64(image);
        payload.media_type = image.type;
      }

      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, cfg.TIMEOUT_MS);
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
        throw new CheckError(e.name === "AbortError" ? "timeout" : "network", String(e));
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

    // Backend verdict -> the three looks the page has (scam / suspicious / ok).
    var VERDICTS = { likely_scam: "scam", suspicious: "suspicious", no_red_flags_found: "ok", cannot_tell: "suspicious" };

    function normalize(d, text) {
      if (!d || !VERDICTS[d.verdict] || !d.summary) throw new CheckError("bad-response", JSON.stringify(d));
      var verdict = VERDICTS[d.verdict];
      var notes = [];
      if (d.verdict === "cannot_tell") notes.push("We couldn't fully check this message, so treat it with care.");
      if (!d.used_ai) notes.push("Our AI checker wasn't available, so this answer comes from our basic safety checks only.");
      return {
        verdict: verdict,
        summary: d.summary,
        sure: verdict === "ok" ? "This is not a guarantee. If it later asks for money or personal details, check again." : "",
        reasons: (d.red_flags || []).filter(function (r) { return r && (r.quote || r.why); }),
        steps: d.next_steps || [],
        note: notes.join(" "),
        text: text
      };
    }

    return { check: check, CheckError: CheckError };
  })();

  var $ = function (id) { return document.getElementById(id); };
  var body = document.body, stage = $("stage"), stream = $("stream");
  var msg = $("msg"), form = $("form"), hint = $("hint");
  var file = $("file"), attach = $("attach"), attachImg = $("attachImg"), attachName = $("attachName");
  var pendingImage = null;   // { file, url }
  var busy = false;
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- Modes ---------- */
  function setMode(m) {
    body.classList.toggle("mode-call", m === "call");
    document.querySelectorAll(".seg button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === m)); });
    if (m === "call") updateCall(); else msg.focus({ preventScroll: true });
  }
  document.querySelectorAll(".seg button").forEach(function (b) { b.addEventListener("click", function () { setMode(b.dataset.mode); }); });

  function setStarted(v) { body.classList.toggle("started", v); $("newBtn").hidden = !v; }
  $("newBtn").addEventListener("click", function () {
    stream.innerHTML = ""; msg.value = ""; clearImage(); updateCount(); setStarted(false); setHint("");
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    msg.focus();
  });

  /* ---------- Character counter ---------- */
  var count = $("count"), MAX = Number(msg.getAttribute("maxlength")) || 5000;
  function updateCount() {
    var n = msg.value.length;
    count.textContent = n.toLocaleString() + " / " + MAX.toLocaleString() + " characters";
    count.classList.toggle("near", n > MAX * 0.9);
    $("newBtn").hidden = !(n || pendingImage || stream.childElementCount);
  }

  /* ---------- Rendering ---------- */
  var VERDICT = {
    scam: { cls: "v-scam", icon: "i-stop", label: "This looks like a scam" },
    suspicious: { cls: "v-sus", icon: "i-warn", label: "This looks suspicious" },
    ok: { cls: "v-ok", icon: "i-ok", label: "This looks probably fine" }
  };
  // Results replace each other; scroll the newest into view.
  function show(el) {
    stream.innerHTML = ""; stream.appendChild(el);
    requestAnimationFrame(function () { el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); });
  }
  function addThinking() {
    var d = document.createElement("div"); d.className = "thinking";
    d.innerHTML = '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>Checking this for you…';
    show(d); return d;
  }

  // Highlight each reason's quote inside the original message.
  function highlight(text, reasons) {
    var ranges = [], lower = text.toLowerCase();
    reasons.forEach(function (r) {
      var q = (r.quote || "").toLowerCase().trim(); if (q.length < 2) return;
      var i = lower.indexOf(q);
      while (i > -1) { ranges.push([i, i + q.length]); i = lower.indexOf(q, i + q.length); }
    });
    if (!ranges.length) return "";
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];
    ranges.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r.slice());
    });
    var out = "", pos = 0;
    merged.forEach(function (r) { out += esc(text.slice(pos, r[0])) + "<mark>" + esc(text.slice(r[0], r[1])) + "</mark>"; pos = r[1]; });
    return out + esc(text.slice(pos));
  }

  function renderResult(a) {
    var v = VERDICT[a.verdict];
    var reasons = a.reasons.length
      ? '<ul class="reasons">' + a.reasons.map(function (r) {
          return "<li>" + (r.quote ? "<q>" + esc(r.quote) + "</q>" : "") + "<span>" + esc(r.why) + "</span></li>";
        }).join("") + "</ul>"
      : '<p class="no-reasons">No pushy deadlines, requests for money, or requests for private details.</p>';
    var marked = a.text ? highlight(a.text, a.reasons) : "";
    var el = document.createElement("article"); el.className = "result " + v.cls;
    el.innerHTML = "" +
      '<div class="verdict"><svg aria-hidden="true"><use href="#' + v.icon + '"/></svg><div>' +
        '<p class="v-label">' + v.label + "</p>" +
        '<p class="v-sub">' + esc(a.summary) + "</p>" +
        (a.sure ? '<p class="v-sure">' + esc(a.sure) + "</p>" : "") + "</div></div>" +
      '<section class="do"><h3>What to do now</h3><ol>' + a.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol></section>" +
      "<section><h3>Why we think so</h3>" + reasons + "</section>" +
      (marked ? '<details><summary>See your message with the warnings marked</summary><div class="marked">' + marked + "</div></details>" : "") +
      (a.note ? '<div class="note">' + esc(a.note) + "</div>" : "") +
      '<div class="actions">' +
        '<button type="button" class="ghost" data-act="speak"><svg class="i" aria-hidden="true"><use href="#i-speak"/></svg>Read this to me</button>' +
        '<button type="button" class="ghost" data-act="family"><svg class="i" aria-hidden="true"><use href="#i-people"/></svg>Copy a note for family</button>' +
      "</div>" +
      (a.verdict !== "ok" ? '<div class="report">Report it so others are protected: <a href="https://reportfraud.ftc.gov" target="_blank" rel="noopener">reportfraud.ftc.gov</a></div>' : "") +
      "";
    el._analysis = a;
    show(el);
  }

  var ERRORS = {
    network: ["We couldn't reach the checker.", "Check your internet connection and try again."],
    timeout: ["This is taking too long.", "The checker didn't answer in time. Please try again."],
    server: ["Something went wrong on our side.", "Please try again in a moment."],
    "bad-response": ["We got an answer we couldn't read.", "Please try again in a moment."],
    "bad-image": ["We can't read that picture.", "Please use a PNG, JPG, WEBP, or GIF screenshot smaller than 5 MB."]
  };
  function renderError(err, retry) {
    var e = ERRORS[err.kind] || ERRORS.server;
    var el = document.createElement("div"); el.className = "error-card"; el.setAttribute("role", "alert");
    el.innerHTML = "<b>" + e[0] + "</b><p>" + e[1] +
      ' Until then, don\'t tap links or send money from this message.</p><button type="button" class="ghost">Try again</button>';
    el.querySelector("button").addEventListener("click", function () { retry(); });
    show(el);
    if (cfg.DEBUG) console.warn("[Second Opinion] request failed:", err.kind, err.status || "", err.detail || "",
      err.kind === "network" ? "\n→ Is the backend running at " + cfg.API_URL + " ? Is CORS enabled?" : "");
  }

  /* ---------- Send ---------- */
  var HINT_DEFAULT = hint.innerHTML;   // "Nothing you paste is saved."
  function setHint(t, err) {
    if (!t) { hint.innerHTML = HINT_DEFAULT; hint.className = "hint"; return; }
    hint.textContent = t; hint.className = "hint" + (err ? " err" : "");
  }

  async function runCheck(text, image) {
    busy = true; form.classList.add("busy");
    var thinking = addThinking();
    try {
      var result = await API.check({ text: text, image: image ? image.file : null });
      renderResult(result);
    } catch (err) {
      if (!(err instanceof API.CheckError)) { console.error(err); err = { kind: "bad-response" }; }
      renderError(err, function () { runCheck(text, image); });
    } finally {
      busy = false; form.classList.remove("busy");
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    var text = msg.value.trim();
    if (!text && !pendingImage) { setHint("Paste a message or add a screenshot first.", true); msg.focus(); return; }
    setHint("");
    setStarted(true);
    runCheck(text, pendingImage);   // text and screenshot stay in the box so the user can see what was checked
  });
  // Ctrl+Enter (or Cmd+Enter) checks; plain Enter adds a new line in the big box.
  msg.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
  });
  msg.addEventListener("input", function () { updateCount(); if (hint.classList.contains("err")) setHint(""); });

  /* ---------- Screenshot ---------- */
  function setImage(f) {
    if (!f || !/^image\//.test(f.type)) { setHint("That file is not a picture. Please choose a screenshot or photo.", true); return; }
    clearImage();
    pendingImage = { file: f, url: URL.createObjectURL(f) };
    attachImg.src = pendingImage.url; attachName.textContent = f.name || "Screenshot";
    attach.classList.add("on"); updateCount();
    setHint("Screenshot added. Press Check message when you are ready.");
  }
  // keepUrl: the chat bubble still shows the image, so don't revoke its URL.
  function clearImage(keepUrl) {
    if (pendingImage && !keepUrl) URL.revokeObjectURL(pendingImage.url);
    pendingImage = null; file.value = ""; attach.classList.remove("on"); attachImg.removeAttribute("src");
  }
  $("attachBtn").addEventListener("click", function () { file.click(); });
  $("attachRemove").addEventListener("click", function () { clearImage(); setHint(""); });
  file.addEventListener("change", function () { if (file.files[0]) setImage(file.files[0]); });

  var drop = $("drop"), depth = 0;
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") > -1; }
  window.addEventListener("dragenter", function (e) { if (hasFiles(e) && !body.classList.contains("mode-call")) { depth++; drop.classList.add("on"); } });
  window.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove("on"); });
  window.addEventListener("dragover", function (e) { e.preventDefault(); });
  window.addEventListener("drop", function (e) {
    e.preventDefault(); depth = 0; drop.classList.remove("on");
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) setImage(f);
  });
  msg.addEventListener("paste", function (e) {
    var fs = (e.clipboardData && e.clipboardData.files) || [];
    if (fs.length && /^image\//.test(fs[0].type)) { e.preventDefault(); setImage(fs[0]); }
  });

  /* ---------- Result buttons ---------- */
  var toastTimer;
  function toast(t) { var el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove("on"); }, 2400); }
  function copyText(t) {
    function fallback() {
      try {
        var ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); var ok = document.execCommand("copy"); ta.remove();
        toast(ok ? "Copied. Paste it into a text or email." : "Could not copy on this device.");
      } catch (e) { toast("Could not copy on this device."); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast("Copied. Paste it into a text or email."); }, fallback);
    else fallback();
  }
  var speaking = false;
  function speak(a) {
    if (!("speechSynthesis" in window)) { toast("Read aloud is not available in this browser."); return; }
    if (speaking) { speechSynthesis.cancel(); speaking = false; return; }
    var u = new SpeechSynthesisUtterance(VERDICT[a.verdict].label + ". " + a.summary + " What to do now. " + a.steps.join(" "));
    u.rate = 0.9; u.onend = u.onerror = function () { speaking = false; };
    speaking = true; speechSynthesis.speak(u);
  }
  stream.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var a = b.closest(".result")._analysis;
    if (b.dataset.act === "speak") speak(a);
    if (b.dataset.act === "family") {
      var snip = (a.text || "(a screenshot)");
      if (snip.length > 300) snip = snip.slice(0, 300) + "…";
      copyText('Hi, I got this message and a scam checker says: "' + VERDICT[a.verdict].label + '." Can you look at it with me before I do anything?\n\nThe message:\n' + snip);
    }
  });

  /* ---------- Call mode ---------- */
  var checks = $("checks"), callResult = $("callResult");
  function updateCall() {
    var n = checks.querySelectorAll("input:checked").length;
    if (!n) {
      callResult.className = "call-result";
      callResult.innerHTML = "<b>Nothing tapped yet</b><p>Even one of these is a reason to be careful.</p>";
    } else {
      callResult.className = "call-result stop";
      callResult.innerHTML = "<b>Hang up now. It is safe to.</b><p>" +
        (n >= 2 ? "Real companies and family members do not do these things." : "This is a common scam pattern.") +
        " Then call the real person or company on a number you already have. Never use a number the caller gave you.</p>";
    }
  }
  checks.addEventListener("change", updateCall);
  updateCall();
  updateCount();
})();
