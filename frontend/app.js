/*
 * Second Opinion – page behavior
 * ------------------------------------------------------------
 * Handles the chat UI. It never talks to the backend directly;
 * it calls SecondOpinionAPI.check({ text, image }) from api.js.
 */
(() => {
  const cfg = window.SO_CONFIG;
  const API = window.SecondOpinionAPI;

  /* ---------- Helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);
  const isImage = (f) => !!f && /^image\//.test(f.type);
  const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
  const icon = (id, cls) => `<svg${cls ? ` class="${cls}"` : ""} aria-hidden="true"><use href="#${id}"/></svg>`;

  // Mark exactly one button in a toggle group as pressed.
  function setPressed(buttons, key, value) {
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[key] === value)));
  }

  /* ---------- Elements & state ---------- */
  const body = document.body, stage = $("stage"), stream = $("stream");
  const msg = $("msg"), form = $("form"), hint = $("hint");
  const file = $("file"), attach = $("attach"), attachImg = $("attachImg"), attachName = $("attachName");
  const sizeButtons = $$(".sizes button"), modeButtons = $$(".seg button");

  let pendingImage = null;   // { file, url }
  let bubbleUrls = [];       // object URLs still shown in the chat
  let busy = false;

  /* ---------- Demo-mode badge so the team always knows what's answering ---------- */
  if (cfg.USE_MOCK) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "Demo mode";
    badge.title = "Answers come from the built-in fake checker. Set USE_MOCK to false in config.js to use the backend.";
    document.querySelector(".brand").appendChild(badge);
  }

  /* ---------- Text size ---------- */
  const SIZE_KEY = "so-size";
  function setSize(s) {
    document.documentElement.setAttribute("data-size", s);
    setPressed(sizeButtons, "size", s);
    try { localStorage.setItem(SIZE_KEY, s); } catch (e) {}
  }
  sizeButtons.forEach((b) => b.addEventListener("click", () => setSize(b.dataset.size)));
  try { const saved = localStorage.getItem(SIZE_KEY); if (saved) setSize(saved); } catch (e) {}

  /* ---------- Modes ---------- */
  function setMode(m) {
    body.classList.toggle("mode-call", m === "call");
    setPressed(modeButtons, "mode", m);
    if (m === "call") updateCall(); else msg.focus({ preventScroll: true });
    stage.scrollTop = 0;
  }
  modeButtons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

  function setStarted(v) { body.classList.toggle("started", v); $("newBtn").hidden = !v; }

  function resetChat() {
    bubbleUrls.forEach((u) => URL.revokeObjectURL(u));
    bubbleUrls = [];
    stream.innerHTML = "";
    setStarted(false); setMode("chat"); setHint("");
    stopSpeaking();
  }
  $("newBtn").addEventListener("click", resetChat);

  /* ---------- Suggestions ---------- */
  const SAMPLES = [
    "ALERT: Unusual activity on your Chase account. Your account has been suspended. Verify your identity within 24 hours or it will be closed: http://chase-secure-verify.top/login",
    "Grandma it's me, I was in an accident and I'm in jail. Please don't tell Mom and Dad. I need $2,000 bail today. Go buy gift cards and read me the numbers.",
    "Hi, this is Riverside Pharmacy. Your prescription is ready for pickup. We're open until 7 PM today. Reply STOP to opt out."
  ];
  let demoIndex = 0;

  const SUGGESTIONS = {
    paste() { msg.focus(); setHint("Copy the message, then tap the box above and choose Paste."); },
    shot() { file.click(); },
    call() { setMode("call"); },
    demo() {
      msg.value = SAMPLES[demoIndex++ % SAMPLES.length]; grow();
      setHint("This is an example message.");
      setTimeout(() => form.requestSubmit(), reduceMotion ? 0 : 700);
    }
  };
  $$("[data-go]").forEach((b) => b.addEventListener("click", () => SUGGESTIONS[b.dataset.go]()));

  /* ---------- Rendering ---------- */
  const VERDICT = {
    scam: { cls: "v-scam", icon: "i-stop", label: "This looks like a scam" },
    suspicious: { cls: "v-sus", icon: "i-warn", label: "This looks suspicious" },
    ok: { cls: "v-ok", icon: "i-ok", label: "This looks probably fine" }
  };
  const AVATAR = `<span class="avatar" aria-hidden="true">${icon("i-shield")}</span>`;

  function toBottom() { requestAnimationFrame(() => { stage.scrollTop = stage.scrollHeight; }); }

  function append(className, html) {
    const el = document.createElement("div");
    el.className = className;
    el.innerHTML = html;
    stream.appendChild(el);
    toBottom();
    return el;
  }
  const addBot = (html) => append("bot", `${AVATAR}<div class="bot-body">${html}</div>`);

  function addBubble(text, image) {
    if (image) bubbleUrls.push(image.url);
    append("you", (image ? `<img src="${esc(image.url)}" alt="Your screenshot">` : "") + esc(text));
  }

  function addThinking() {
    return addBot('<span class="thinking"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>Checking this for you…</span>');
  }

  // Highlight each reason's quote inside the original message.
  function highlight(text, reasons) {
    const lower = text.toLowerCase();
    const ranges = [];
    reasons.forEach((r) => {
      const q = (r.quote || "").toLowerCase().trim();
      if (q.length < 2) return;
      for (let i = lower.indexOf(q); i > -1; i = lower.indexOf(q, i + q.length)) ranges.push([i, i + q.length]);
    });
    if (!ranges.length) return "";

    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach((r) => {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r.slice());
    });

    let out = "", pos = 0;
    merged.forEach(([start, end]) => {
      out += esc(text.slice(pos, start)) + "<mark>" + esc(text.slice(start, end)) + "</mark>";
      pos = end;
    });
    return out + esc(text.slice(pos));
  }

  function reasonsHtml(reasons) {
    if (!reasons.length) return '<p class="no-reasons">No pushy deadlines, requests for money, or requests for private details.</p>';
    return '<ul class="reasons">' + reasons.map((r) =>
      `<li>${r.quote ? `<q>${esc(r.quote)}</q>` : ""}<span>${esc(r.why)}</span></li>`
    ).join("") + "</ul>";
  }

  function resultHtml(a) {
    const v = VERDICT[a.verdict];
    const marked = a.text ? highlight(a.text, a.reasons) : "";
    return `<article class="result ${v.cls}">
      <div class="verdict">${icon(v.icon)}<div>
        <p class="v-label">${v.label}</p>
        <p class="v-sub">${esc(a.summary)}</p>
        <p class="v-sure">How sure we are: ${esc(a.sure)}</p>
      </div></div>
      <section class="do"><h3>What to do now</h3><ol>${a.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></section>
      <section><h3>Why we think so</h3>${reasonsHtml(a.reasons)}</section>
      ${marked ? `<details><summary>See your message with the warnings marked</summary><div class="marked">${marked}</div></details>` : ""}
      ${a.note ? `<div class="note">${esc(a.note)}</div>` : ""}
      <div class="actions">
        <button type="button" class="ghost" data-act="speak">${icon("i-speak", "i")}Read this to me</button>
        <button type="button" class="ghost" data-act="family">${icon("i-people", "i")}Copy a note for family</button>
      </div>
      ${a.verdict !== "ok" ? '<div class="report">Report it so others are protected: <a href="https://reportfraud.ftc.gov" target="_blank" rel="noopener">reportfraud.ftc.gov</a></div>' : ""}
    </article>`;
  }

  function renderResult(a) {
    addBot(resultHtml(a))._analysis = a;
  }

  const ERRORS = {
    network: ["We couldn't reach the checker.", "Check your internet connection and try again."],
    timeout: ["This is taking too long.", "The checker didn't answer in time. Please try again."],
    server: ["Something went wrong on our side.", "Please try again in a moment."],
    "bad-response": ["We got an answer we couldn't read.", "Please try again in a moment."]
  };

  function renderError(err, retry) {
    const [title, text] = ERRORS[err.kind] || ERRORS.server;
    const el = addBot(`<div class="error-card" role="alert"><b>${title}</b><p>${text} Until then, don't tap links or send money from this message.</p><button type="button" class="ghost">Try again</button></div>`);
    el.querySelector("button").addEventListener("click", () => { el.remove(); retry(); });
    if (cfg.DEBUG) {
      console.warn("[Second Opinion] request failed:", err.kind, err.status || "", err.detail || "",
        err.kind === "network" ? `\n→ Is the backend running at ${cfg.API_URL} ? Is CORS enabled?` : "");
    }
  }

  /* ---------- Send ---------- */
  function setHint(t, isError) { hint.textContent = t; hint.className = "hint" + (isError ? " err" : ""); }

  function setBusy(v) { busy = v; form.classList.toggle("busy", v); }

  async function runCheck(text, image) {
    setBusy(true);
    const thinking = addThinking();
    try {
      const result = await API.check({ text, image: image ? image.file : null });
      thinking.remove();
      renderResult(result);
    } catch (err) {
      thinking.remove();
      if (!(err instanceof API.CheckError)) { console.error(err); err = { kind: "bad-response" }; }
      renderError(err, () => runCheck(text, image));
    } finally {
      setBusy(false);
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy) return;
    const text = msg.value.trim();
    if (!text && !pendingImage) { setHint("Paste a message or add a screenshot first.", true); msg.focus(); return; }
    const image = pendingImage;
    setHint("");
    setStarted(true);
    addBubble(text, image);
    msg.value = ""; grow(); clearImage(true);
    runCheck(text, image);
  });

  // Enter sends on desktop; on touch devices Enter adds a new line.
  msg.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && matchMedia("(hover: hover)").matches) { e.preventDefault(); form.requestSubmit(); }
  });

  const MAX_INPUT_PX = 228;
  function grow() { msg.style.height = "auto"; msg.style.height = Math.min(msg.scrollHeight, MAX_INPUT_PX) + "px"; }
  msg.addEventListener("input", () => { grow(); if (hint.classList.contains("err")) setHint(""); });

  /* ---------- Screenshot ---------- */
  function setImage(f) {
    if (!isImage(f)) { setHint("That file is not a picture. Please choose a screenshot or photo.", true); return; }
    clearImage();
    pendingImage = { file: f, url: URL.createObjectURL(f) };
    attachImg.src = pendingImage.url;
    attachName.textContent = f.name || "Screenshot";
    attach.classList.add("on");
    setHint("Screenshot added. Tap Check when you are ready.");
  }

  // keepUrl: the chat bubble still shows the image, so don't revoke its URL.
  function clearImage(keepUrl) {
    if (pendingImage && !keepUrl) URL.revokeObjectURL(pendingImage.url);
    pendingImage = null;
    file.value = "";
    attach.classList.remove("on");
    attachImg.removeAttribute("src");
  }

  $("attachBtn").addEventListener("click", () => file.click());
  $("attachRemove").addEventListener("click", () => { clearImage(); setHint(""); });
  file.addEventListener("change", () => { if (file.files[0]) setImage(file.files[0]); });

  msg.addEventListener("paste", (e) => {
    const f = e.clipboardData && e.clipboardData.files[0];
    if (isImage(f)) { e.preventDefault(); setImage(f); }
  });

  // Drag & drop anywhere on the page. `depth` counts nested dragenter/dragleave pairs.
  const drop = $("drop");
  let depth = 0;
  const hasFiles = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
  const hideDrop = () => drop.classList.remove("on");

  window.addEventListener("dragenter", (e) => {
    if (hasFiles(e) && !body.classList.contains("mode-call")) { depth++; drop.classList.add("on"); }
  });
  window.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) hideDrop(); });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault(); depth = 0; hideDrop();
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) setImage(f);
  });

  /* ---------- Result buttons ---------- */
  let toastTimer;
  function toast(t) {
    const el = $("toast");
    el.textContent = t;
    el.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("on"), 2400);
  }

  const COPIED = "Copied. Paste it into a text or email.";
  const COPY_FAILED = "Could not copy on this device.";

  function copyWithTextarea(t) {
    try {
      const ta = document.createElement("textarea");
      ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      toast(ok ? COPIED : COPY_FAILED);
    } catch (e) { toast(COPY_FAILED); }
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(() => toast(COPIED), () => copyWithTextarea(t));
    } else {
      copyWithTextarea(t);
    }
  }

  const canSpeak = "speechSynthesis" in window;
  let speaking = false;

  function stopSpeaking() {
    if (canSpeak) speechSynthesis.cancel();
    speaking = false;
  }

  function speak(a) {
    if (!canSpeak) { toast("Read aloud is not available in this browser."); return; }
    if (speaking) { stopSpeaking(); return; }
    const u = new SpeechSynthesisUtterance(`${VERDICT[a.verdict].label}. ${a.summary} What to do now. ${a.steps.join(" ")}`);
    u.rate = 0.9;
    u.onend = u.onerror = () => { speaking = false; };
    speaking = true;
    speechSynthesis.speak(u);
  }

  function familyNote(a) {
    let snip = a.text || "(a screenshot)";
    if (snip.length > 300) snip = snip.slice(0, 300) + "…";
    return `Hi, I got this message and a scam checker says: "${VERDICT[a.verdict].label}." Can you look at it with me before I do anything?\n\nThe message:\n${snip}`;
  }

  const ACTIONS = {
    speak,
    family: (a) => copyText(familyNote(a))
  };
  stream.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    ACTIONS[b.dataset.act](b.closest(".bot")._analysis);
  });

  /* ---------- Call mode ---------- */
  const checks = $("checks"), callResult = $("callResult");
  function updateCall() {
    const n = checks.querySelectorAll("input:checked").length;
    if (!n) {
      callResult.className = "call-result";
      callResult.innerHTML = "<b>Nothing tapped yet</b><p>Even one of these is a reason to be careful.</p>";
      return;
    }
    callResult.className = "call-result stop";
    callResult.innerHTML = "<b>Hang up now. It is safe to.</b><p>" +
      (n >= 2 ? "Real companies and family members do not do these things." : "This is a common scam pattern.") +
      " Then call the real person or company on a number you already have. Never use a number the caller gave you.</p>";
  }
  checks.addEventListener("change", updateCall);

  updateCall();
  grow();
})();
