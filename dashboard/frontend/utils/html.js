// HTML escaping helpers shared by every component that builds markup from template strings.

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;'
};

/**
 * Escapes a value for safe interpolation into HTML text content or a quoted attribute value.
 * Anything that reaches the DOM through `innerHTML` and did not originate in this source file
 * (container names, service labels, job targets, API error text, user settings) must pass
 * through this function.
 * @param {*} value - Value to escape; null and undefined become an empty string.
 * @returns {string} The escaped string.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

export default escapeHtml;
