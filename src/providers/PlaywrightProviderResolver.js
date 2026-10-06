/**
 * ProviderResolver für JS-gerenderte Seiten: ein headless Browser lädt die
 * Seite und die tatsächlich angeforderte Stream-URL wird mitgeschnitten.
 *
 * Das ist die teuerste Methode (Browserstart, Wartezeiten), deshalb:
 * - niedrigste Priorität,
 * - nur aktiv, wenn der Nutzer den Fallback in den Einstellungen einschaltet
 *   (context.flags.playwrightFallback),
 * - in der Download-Kaskade erst als letzte Stufe.
 */

const { ProviderResolver } = require("./ProviderResolver");
const { isHttpUrl } = require("../core/types");
const { ResolveError, ResolveErrorCode } = require("../core/errors");
const { findStreamWithPlaywright } = require("./playwrightStreamFinder");

/** Playwright-Setupfehler auf strukturierte Codes abbilden. */
const mapPlaywrightError = (err, url, name) => {
  const code = err && err.code;
  if (code === "PLAYWRIGHT_MISSING" || code === "PLAYWRIGHT_CHROMIUM_MISSING") {
    return new ResolveError(ResolveErrorCode.DEPENDENCY_MISSING, err.message, {
      resolver: name, url, cause: err, details: { setup: code }
    });
  }
  return new ResolveError(
    ResolveErrorCode.EXTRACTION_FAILED,
    err && err.message ? err.message : "Browser-Extraktion fehlgeschlagen.",
    { resolver: name, url, cause: err }
  );
};

class PlaywrightProviderResolver extends ProviderResolver {
  /**
   * @param {{ findStream?: (url: string, log: Function) => Promise<string|null> }} [options]
   */
  constructor(options = {}) {
    super({ name: "playwright-sniffer", priority: 5 });
    this._findStream = typeof options.findStream === "function"
      ? options.findStream
      : findStreamWithPlaywright;
  }

  canHandle(url) {
    return isHttpUrl(url);
  }

  /**
   * @param {string} url
   * @param {Object} context ResolveContext
   * @returns {Promise<Object>} ResolvedMedia
   */
  async resolve(url, context = {}) {
    const flags = context.flags || {};
    if (!flags.playwrightFallback) {
      throw new ResolveError(
        ResolveErrorCode.UNSUPPORTED_URL,
        "Playwright-Fallback ist nicht aktiviert.",
        { resolver: this.name, url }
      );
    }
    if (context.throwIfAborted) context.throwIfAborted();

    // Ein injizierter Finder (Tests, alternative Browser-Session) hat Vorrang.
    const findStream = typeof (context.services || {}).findStream === "function"
      ? context.services.findStream
      : this._findStream;
    const log = (message) => {
      if (context.logger) context.logger.step("resolver-try", { resolver: this.name, message });
    };

    let streamUrl;
    try {
      streamUrl = await findStream(url, log);
    } catch (err) {
      throw mapPlaywrightError(err, url, this.name);
    }

    if (!streamUrl) {
      throw new ResolveError(
        ResolveErrorCode.EXTRACTION_FAILED,
        "Kein Stream gefunden",
        { resolver: this.name, url, details: { reason: "PLAYWRIGHT_NO_STREAM" } }
      );
    }

    return {
      sourceUrl: url,
      mediaUrl: streamUrl,
      provider: "playwright",
      meta: { method: "network-sniffing" }
    };
  }
}

module.exports = { PlaywrightProviderResolver, mapPlaywrightError };
