/**
 * Basis für ProviderResolver.
 *
 * Ein ProviderResolver bekommt eine Hoster-/Streaming-URL (in der Regel vom
 * SiteResolver gefunden) und liefert genau ein normalisiertes Ergebnis:
 *
 *   { sourceUrl, mediaUrl, title?, formats?, provider, requiresAuth? }
 *
 * Regeln:
 * - keine Zugangsdaten im Resolver speichern, Auth kommt aus dem Context,
 * - fehlende Berechtigung wird als AUTH_REQUIRED/SESSION_EXPIRED gemeldet,
 *   nicht als allgemeiner Fehler,
 * - kein Umgehen von Zugriffsschutz und keine DRM-Entschlüsselung.
 */

const { isHttpUrl } = require("../core/types");

class ProviderResolver {
  /**
   * @param {{ name: string, priority?: number }} options
   */
  constructor(options = {}) {
    if (!options.name) throw new TypeError("ProviderResolver: name fehlt.");
    this.name = options.name;
    this.priority = Number.isFinite(options.priority) ? options.priority : 50;
  }

  /**
   * @param {string} url
   * @returns {boolean}
   */
  canHandle(url) {
    return isHttpUrl(url);
  }

  /**
   * @param {string} _url
   * @param {Object} _context ResolveContext
   * @returns {Promise<Object>} ResolvedMedia
   */
  async resolve(_url, _context) {
    throw new Error(`ProviderResolver "${this.name}": resolve() ist nicht implementiert.`);
  }
}

module.exports = { ProviderResolver };
