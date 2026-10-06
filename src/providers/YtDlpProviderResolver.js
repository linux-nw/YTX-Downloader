/**
 * ProviderResolver, der die Auflösung an yt-dlp übergibt.
 *
 * yt-dlp bringt über 1000 Extraktoren mit - für die allermeisten Seiten ist
 * "gib die URL an yt-dlp" die richtige Antwort. Dieser Resolver macht daraus
 * ein reguläres ResolvedMedia, ohne vorher einen Metadaten-Abruf zu starten:
 * das war schon vorher das Verhalten der App und jeder zusätzliche Aufruf
 * würde jeden Download um Sekunden verlängern.
 *
 * Er ist damit der Auffang-Resolver mit niedriger Priorität. Wer für eine
 * Seite etwas Besseres kann, registriert einen Resolver mit höherer Priorität.
 */

const { ProviderResolver } = require("./ProviderResolver");
const { isHttpUrl } = require("../core/types");

class YtDlpProviderResolver extends ProviderResolver {
  constructor() {
    super({ name: "yt-dlp", priority: 10 });
  }

  canHandle(url) {
    return isHttpUrl(url);
  }

  /**
   * @param {string} url
   * @param {Object} [context]
   * @returns {Promise<Object>} ResolvedMedia
   */
  async resolve(url, context = {}) {
    const auth = context.auth || { type: "none" };
    return {
      sourceUrl: url,
      mediaUrl: url,
      provider: "yt-dlp",
      // Die eigentliche Formatwahl trifft yt-dlp beim Download anhand der
      // Nutzereinstellungen (Qualität, mp3/mp4), nicht dieser Resolver.
      meta: {
        handoff: "yt-dlp",
        // Nur die Art der Auth, nie deren Inhalt.
        authType: auth.type
      }
    };
  }
}

module.exports = { YtDlpProviderResolver };
