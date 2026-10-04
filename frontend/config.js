/* Second Opinion - config.
 * USE_MOCK: true  = built-in fake checker (no backend needed, good for design work)
 *           false = send every message to API_URL
 * You can also switch from the address bar: index.html?mock=1 or index.html?mock=0
 */
window.SO_CONFIG = {
  USE_MOCK: false,
  DEBUG: true,
  API_URL: "http://localhost:8000/check",
  TIMEOUT_MS: 45000
};

(function () {
  var p = new URLSearchParams(location.search).get("mock");
  if (p === "1") window.SO_CONFIG.USE_MOCK = true;
  if (p === "0") window.SO_CONFIG.USE_MOCK = false;
})();
