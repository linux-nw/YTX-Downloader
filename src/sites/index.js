/**
 * Registry aller mitgelieferten SiteResolver.
 *
 * Neue Seite unterstützen: Datei in diesem Ordner anlegen, Klasse von
 * SiteResolver ableiten und hier in createSiteRegistry() eintragen.
 * Die Reihenfolge im Array ist egal, entschieden wird über priority.
 */

const { ResolverRegistry } = require("../core/registry");
const { SiteResolver } = require("./SiteResolver");
const { PodcastFeedSiteResolver, looksLikePodcastFeed } = require("./PodcastFeedSiteResolver");
const { GenericPageSiteResolver } = require("./GenericPageSiteResolver");

/**
 * @param {{ extra?: Array }} [options] zusätzliche Resolver (Tests, Plugins)
 * @returns {ResolverRegistry}
 */
const createSiteRegistry = (options = {}) => {
  const registry = new ResolverRegistry({ kind: "SiteResolver" });
  registry.registerAll([
    new PodcastFeedSiteResolver(),   // priority 90
    ...(options.extra || []),
    new GenericPageSiteResolver()    // priority 1, fängt alles auf
  ]);
  return registry;
};

module.exports = {
  createSiteRegistry,
  SiteResolver,
  PodcastFeedSiteResolver,
  GenericPageSiteResolver,
  looksLikePodcastFeed
};
