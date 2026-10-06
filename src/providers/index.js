/**
 * Registry aller mitgelieferten ProviderResolver.
 *
 * Neuen Hoster unterstützen: Datei in diesem Ordner anlegen, Klasse von
 * ProviderResolver ableiten und hier in createProviderRegistry() eintragen.
 *
 * Prioritäten der Standardresolver:
 *   80 direct-media       URL ist bereits eine Mediendatei
 *   10 yt-dlp             Auffang für alles, was yt-dlp kann
 *    5 playwright-sniffer nur wenn im UI aktiviert, letzte Stufe
 */

const { ResolverRegistry } = require("../core/registry");
const { ProviderResolver } = require("./ProviderResolver");
const { DirectMediaProviderResolver } = require("./DirectMediaProviderResolver");
const { YtDlpProviderResolver } = require("./YtDlpProviderResolver");
const { PlaywrightProviderResolver } = require("./PlaywrightProviderResolver");

/**
 * @param {{ extra?: Array, findStream?: Function }} [options]
 * @returns {ResolverRegistry}
 */
const createProviderRegistry = (options = {}) => {
  const registry = new ResolverRegistry({ kind: "ProviderResolver" });
  registry.registerAll([
    new DirectMediaProviderResolver(),
    ...(options.extra || []),
    new YtDlpProviderResolver(),
    new PlaywrightProviderResolver({ findStream: options.findStream })
  ]);
  return registry;
};

module.exports = {
  createProviderRegistry,
  ProviderResolver,
  DirectMediaProviderResolver,
  YtDlpProviderResolver,
  PlaywrightProviderResolver
};
