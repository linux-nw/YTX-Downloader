/**
 * Basis für SiteResolver.
 *
 * Ein SiteResolver erkennt eine Übersichts- oder Videoseite und extrahiert
 * daraus die eigentlichen Video-/Provider-Links. Er lädt nichts herunter und
 * löst auch keine Medien-URL auf, sondern liefert normalisierte Referenzen:
 *
 *   { sourceUrl, providerUrl, title?, thumbnail?, duration?, meta? }
 *
 * Mehrere Treffer auf einer Seite sind ausdrücklich erlaubt (mehrere Hoster
 * für dieselbe Folge, Episodenlisten ...). Den Rest erledigt der
 * ProviderResolver.
 *
 * Ein neuer SiteResolver braucht nur name, priority, canHandle und resolve,
 * siehe ARCHITECTURE.md.
 */

const { isHttpUrl } = require("../core/types");

class SiteResolver {
  /**
   * @param {{ name: string, priority?: number }} options
   */
  constructor(options = {}) {
    if (!options.name) throw new TypeError("SiteResolver: name fehlt.");
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
   * @returns {Promise<Array>} Media-Referenzen
   */
  async resolve(_url, _context) {
    throw new Error(`SiteResolver "${this.name}": resolve() ist nicht implementiert.`);
  }
}

module.exports = { SiteResolver };
