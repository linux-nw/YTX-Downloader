/**
 * Zusammenbau der Standard-Pipeline.
 *
 * Eine Stelle, an der Registries, Cache und Logger verdrahtet werden - der
 * Rest der App (main.js) kennt nur noch createDefaultResolverManager() und
 * createResolveContext().
 */

const { ResolverManager } = require("./ResolverManager");
const { ResolverCache } = require("../cache/ResolverCache");
const { createSiteRegistry } = require("../sites");
const { createProviderRegistry } = require("../providers");
const { nullLogger } = require("./logger");

/**
 * @param {Object} [options]
 * @param {Array}  [options.extraSites]
 * @param {Array}  [options.extraProviders]
 * @param {Function} [options.findStream] Ersatz für den Playwright-Finder (Tests)
 * @param {Object|null} [options.cache]   null = ohne Cache
 * @param {Object} [options.logger]
 * @returns {ResolverManager}
 */
const createDefaultResolverManager = (options = {}) => new ResolverManager({
  sites: createSiteRegistry({ extra: options.extraSites }),
  providers: createProviderRegistry({
    extra: options.extraProviders,
    findStream: options.findStream
  }),
  cache: options.cache === undefined ? new ResolverCache() : options.cache,
  logger: options.logger || nullLogger()
});

module.exports = { createDefaultResolverManager };
