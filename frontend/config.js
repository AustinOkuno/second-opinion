/* Second Opinion - config.
 * On your laptop it uses the local backend; online it uses the Render backend.
 * Add ?mock=1 to the address for demo mode (no backend needed).
 */
window.SO_CONFIG = {
  USE_MOCK: false,
  DEBUG: true,
  API_URL: (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://localhost:8000/check"
    : "https://second-opinion-aa5w.onrender.com/check",
  TIMEOUT_MS: 70000   // the free server can take up to a minute to wake up
};

(function () {
  var p = new URLSearchParams(location.search).get("mock");
  if (p === "1") window.SO_CONFIG.USE_MOCK = true;
  if (p === "0") window.SO_CONFIG.USE_MOCK = false;
})();