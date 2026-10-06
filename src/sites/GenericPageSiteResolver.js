/**
 * Generischer SiteResolver: die URL ist bereits die Videoseite.
 *
 * Das ist das Verhalten der App vor der Umstellung - eine eingegebene URL
 * ging direkt an yt-dlp. Damit bleibt YouTube & Co. exakt so schnell wie
 * vorher (kein zusätzlicher Netzwerkzugriff) und die neue Pipeline hat
 * trotzdem für jede URL einen definierten Einstiegspunkt.
 *
 * Priorität bewusst ganz unten: jeder spezialisierte SiteResolver kommt
 * zuerst dran, dieser hier fängt den Rest auf.
 */

const { SiteResolver } = require("./SiteResolver");
const { isHttpUrl } = require("../core/types");

class GenericPageSiteResolver extends SiteResolver {
  constructor() {
    super({ name: "generic-page", priority: 1 });
  }

  canHandle(url) {
    return isHttpUrl(url);
  }

  /**
   * @param {string} url
   * @returns {Promise<Array>} genau eine Referenz: die URL selbst
   */
  async resolve(url) {
    return [{ sourceUrl: url, providerUrl: url }];
  }
}

module.exports = { GenericPageSiteResolver };
