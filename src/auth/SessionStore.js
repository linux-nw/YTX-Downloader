/**
 * SessionStore: kurzlebige Session-Referenzen, ausschließlich im Speicher.
 *
 * Bewusste Einschränkungen:
 * - keine Persistenz auf Platte (nichts überlebt einen App-Neustart),
 * - TTL für jeden Eintrag, danach wird er verworfen,
 * - keine Passwörter, nur bereits bestehendes Session-Material,
 * - toJSON/inspect geben niemals Werte preis.
 *
 * Ein Resolver bekommt nur die sessionId im ResolveContext und fragt damit
 * hier nach. So liegt das Material an genau einer Stelle statt in jedem
 * Resolver.
 */

const crypto = require("node:crypto");

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 Minuten

class SessionStore {
  /**
   * @param {{ ttlMs?: number, maxEntries?: number, now?: () => number }} [options]
   */
  constructor(options = {}) {
    this.ttlMs = Number.isFinite(options.ttlMs) && options.ttlMs > 0 ? options.ttlMs : DEFAULT_TTL_MS;
    this.maxEntries = Number.isFinite(options.maxEntries) && options.maxEntries > 0 ? options.maxEntries : 20;
    this._now = typeof options.now === "function" ? options.now : () => Date.now();
    /** @type {Map<string, {expiresAt: number, data: Object}>} */
    this._entries = new Map();
  }

  /**
   * Legt eine Session an und liefert ihre Id zurück.
   * @param {{ cookies?: Array, headers?: Object, userAgent?: string, origin?: string }} data
   * @param {{ ttlMs?: number }} [options]
   * @returns {string} sessionId
   */
  create(data = {}, options = {}) {
    const id = crypto.randomUUID();
    this.set(id, data, options);
    return id;
  }

  /**
   * @param {string} sessionId
   * @param {Object} data
   * @param {{ ttlMs?: number }} [options]
   */
  set(sessionId, data = {}, options = {}) {
    if (typeof sessionId !== "string" || !sessionId) {
      throw new TypeError("SessionStore.set: sessionId fehlt.");
    }
    this._evictExpired();
    if (this._entries.size >= this.maxEntries && !this._entries.has(sessionId)) {
      // Ältesten Eintrag verdrängen (Map hält Einfügereihenfolge).
      const oldest = this._entries.keys().next();
      if (!oldest.done) this._entries.delete(oldest.value);
    }
    const ttl = Number.isFinite(options.ttlMs) && options.ttlMs > 0 ? options.ttlMs : this.ttlMs;
    this._entries.set(sessionId, { expiresAt: this._now() + ttl, data: { ...data } });
    return sessionId;
  }

  /**
   * @param {string} sessionId
   * @returns {Object|null} Session-Daten oder null (unbekannt/abgelaufen).
   */
  get(sessionId) {
    const entry = this._entries.get(sessionId);
    if (!entry) return null;
    if (entry.expiresAt <= this._now()) {
      this._entries.delete(sessionId);
      return null;
    }
    return entry.data;
  }

  /** @param {string} sessionId */
  has(sessionId) {
    return this.get(sessionId) !== null;
  }

  /** @param {string} sessionId */
  delete(sessionId) {
    return this._entries.delete(sessionId);
  }

  /** Alles verwerfen, z. B. beim Beenden der App. */
  clear() {
    this._entries.clear();
  }

  /** Anzahl gültiger Sessions (räumt nebenbei abgelaufene weg). */
  size() {
    this._evictExpired();
    return this._entries.size;
  }

  _evictExpired() {
    const now = this._now();
    for (const [id, entry] of this._entries) {
      if (entry.expiresAt <= now) this._entries.delete(id);
    }
  }

  /** Niemals Inhalte serialisieren. */
  toJSON() {
    return { sessions: this._entries.size, persisted: false };
  }
}

module.exports = { SessionStore, DEFAULT_TTL_MS };
