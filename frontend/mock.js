/*
 * Second Opinion - fake backend for design work and as a demo fallback.
 * Returns the SAME shape as the real POST /check, so api.js treats both the same way.
 * Turn it on with USE_MOCK: true in config.js, or add ?mock=1 to the address.
 */
window.SO_MOCK = function (text, image) {
  text = text || "";
  var lower = text.toLowerCase();
  var checks = [
    [/gift ?cards?/, "Real companies and government agencies don't ask to be paid with gift cards.", "Gift card scam"],
    [/don'?t tell|keep (this|it) (a )?secret/, "Scammers ask you to keep secrets so no one can warn you.", "Secrecy pressure scam"],
    [/urgent|immediately|act now|within \d+ (hours?|minutes?)/, "Pressure to act fast is meant to stop you from thinking it through.", "Pressure tactic"],
    [/bit\.ly\/\S+|tinyurl\.com\/\S+/, "Shortened links hide where they really go.", "Suspicious link"],
    [/bitcoin|crypto/, "Being told to pay with cryptocurrency is a common scam sign.", "Crypto payment scam"]
  ];
  var flags = [], type = null;
  checks.forEach(function (c) {
    var m = lower.match(c[0]);
    if (m) { flags.push({ quote: text.substr(m.index, m[0].length), why: c[1] }); type = type || c[2]; }
  });

  var verdict = !text ? "cannot_tell" : flags.length >= 2 ? "likely_scam" : flags.length ? "suspicious" : "no_red_flags_found";
  var info = {
    likely_scam: [85, "(Demo) This message has several common scam warning signs."],
    suspicious: [55, "(Demo) This message has a warning sign worth checking."],
    no_red_flags_found: [5, "(Demo) We didn't find common warning signs."],
    cannot_tell: [30, "(Demo) The demo checker can't read screenshots."]
  }[verdict];
  var steps = {
    likely_scam: ["Do not reply, click links, or call numbers in the message.", "Do not send money, gift cards, or any codes.", "Ask someone you trust to look at it with you."],
    suspicious: ["Don't act on it yet.", "Check with the company using a phone number you already trust."],
    no_red_flags_found: ["Stay careful.", "If it later asks for money or personal information, check it again."],
    cannot_tell: ["Don't send money or personal information until you've confirmed who sent it."]
  }[verdict];

  var response = {
    verdict: verdict, summary: info[1], reason: info[1], red_flags: flags, evidence: [],
    next_steps: steps, risk_score: info[0], scam_type: verdict === "no_red_flags_found" ? null : type, used_ai: true
  };
  return new Promise(function (resolve) { setTimeout(function () { resolve(response); }, 600); });
};
