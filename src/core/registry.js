/**
 * Registry für Site- und ProviderResolver.
 *
 * Ersetzt if/else-Ketten: ein Resolver meldet sich mit canHandle(url) und
 * einer Priorität an, die Registry liefert die passenden Kandidaten in
 * absteigender Priorität. Eine kaputte canHandle-Implementierung darf die
 * Auswahl nicht sprengen, deshalb wird sie isoliert aufgerufen.
 */

const DEFAULT_PRIORITY = 50;

/** Pflichtform eines Resolvers prüfen, bevor er registriert wird. */
const assertResolverShape = (resolver, kind) => {
  if (!resolver || typeof resolver !== "object") {
    throw new TypeError(`${kind}: Resolver-Objekt erwartet.`);
  }
  if (typeof resolver.name !== "string" || !resolver.name.trim()) {
    throw new TypeError(`${kind}: Resolver braucht einen name.`);
  }
  if (typeof resolver.canHandle !== "function") {
    throw new TypeError(`${kind} "${resolver.name}": canHandle(url) fehlt.`);
  }
  if (typeof resolver.resolve !== "function") {
    throw new TypeError(`${kind} "${resolver.name}": resolve(url, context) fehlt.`);
  }
};

class ResolverRegistry {
  /**
   * @param {{ kind?: string, logger?: Object }} [options]
   */
  constructor(options = {}) {
    this.kind = options.kind || "Resolver";
    /** @type {Array<{resolver: Object, priority: number, order: number}>} */
    this._items = [];
    this._counter = 0;
  }

  /**
   * @param {Object} resolver  {name, canHandle, resolve, priority?}
   * @param {{ priority?: number }} [options]
   * @returns {this}
   */
  register(resolver, options = {}) {
    assertResolverShape(resolver, this.kind);
    if (this._items.some((item) => item.resolver.name === resolver.name)) {
      throw new Error(`${this.kind} "${resolver.name}" ist bereits registriert.`);
    }
    const priority = Number.isFinite(options.priority)
      ? options.priority
      : (Number.isFinite(resolver.priority) ? resolver.priority : DEFAULT_PRIORITY);
    this._items.push({ resolver, priority, order: this._counter++ });
    return this;
  }

  /** Mehrere auf einmal registrieren. */
  registerAll(resolvers = []) {
    for (const resolver of resolvers) this.register(resolver);
    return this;
  }

  /** @param {string} name */
  unregister(name) {
    const before = this._items.length;
    this._items = this._items.filter((item) => item.resolver.name !== name);
    return this._items.length !== before;
  }

  /** @param {string} name */
  get(name) {
    const item = this._items.find((i) => i.resolver.name === name);
    return item ? item.resolver : null;
  }

  /** Alle Resolver nach Priorität (höchste zuerst), stabil bei Gleichstand. */
  list() {
    return this._items
      .slice()
      .sort((a, b) => (b.priority - a.priority) || (a.order - b.order))
      .map((item) => item.resolver);
  }

  /** Namen inklusive Priorität, für Logging/Diagnose. */
  describe() {
    return this._items
      .slice()
      .sort((a, b) => (b.priority - a.priority) || (a.order - b.order))
      .map((item) => ({ name: item.resolver.name, priority: item.priority }));
  }

  /**
   * Passende Resolver für eine URL, nach Priorität sortiert.
   * @param {string} url
   * @param {{ logger?: Object }} [options]
   * @returns {Object[]}
   */
  match(url, options = {}) {
    const logger = options.logger;
    return this.list().filter((resolver) => {
      try {
        return !!resolver.canHandle(url);
      } catch (err) {
        // Ein fehlerhaftes canHandle darf die anderen Resolver nicht blockieren.
        if (logger) {
          logger.step("resolver-fail", {
            resolver: resolver.name,
            code: "EXTRACTION_FAILED",
            message: `canHandle warf: ${err && err.message ? err.message : err}`
          });
        }
        return false;
      }
    });
  }

  /** Der erste passende Resolver oder null. */
  find(url, options = {}) {
    const matches = this.match(url, options);
    return matches.length ? matches[0] : null;
  }

  get size() {
    return this._items.length;
  }
}

module.exports = { ResolverRegistry, DEFAULT_PRIORITY, assertResolverShape };
