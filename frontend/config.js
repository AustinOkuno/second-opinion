/*
 * Second Opinion – settings
 * ------------------------------------------------------------
 * This is the only file you should need to touch to connect
 * the website to the backend.
 */
window.SO_CONFIG = {
  // Where the backend lives. Change this if your teammate runs it on another port or deploys it.
  API_URL: "http://localhost:8000/check",

  // true  = use the built-in fake checker (works with no backend, good for designing the UI)
  // false = send every message to API_URL
  // You can also force it from the address bar: index.html?mock=1 or index.html?mock=0
  USE_MOCK: false,

  // Give up waiting for the backend after this many milliseconds (LLMs can be slow).
  TIMEOUT_MS: 45000,

  // Print requests and responses in the browser console (F12) while you build.
  DEBUG: true
};

(function () {
  var p = new URLSearchParams(location.search).get("mock");
  if (p === "1") window.SO_CONFIG.USE_MOCK = true;
  if (p === "0") window.SO_CONFIG.USE_MOCK = false;
})();
