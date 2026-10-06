/**
 * ResolveContext: alles, was ein Resolver von außen braucht, an einer Stelle.
 *
 * Enthält absichtlich keine Geschäftslogik. Auth ist ein eigenes Feld und
 * wird nicht in den Resolver "eingebacken", HTTP-Zugriff und der Playwright-
 * Stream-Finder kommen als injizierte Services herein (macht sie testbar und
 * hält Electron-Abhängigkeiten aus den Resolvern heraus).
 */

const { NO_AUTH, describeAuth, createAuthContext } = require("../auth/AuthContext");
const { nullLogger } = require("./logger");
const { ResolveError, ResolveErrorCode } = require("./errors");

/** Header-Namen einheitlich klein schreiben, Werte als String. */
const normalizeHeaders = (headers) => {
  if (!headers || typeof headers !== "object") return {};
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof name !== "string" || !name.trim()) continue;
    if (value === undefined || value === null) continue;
    out[name.trim().toLowerCase()] = String(value);
  }
  return out;
};

/**
 * @param {Object} [input]
 * @param {Object} [input.auth]        AuthContext (Default: {type:"none"})
 * @param {Object} [input.headers]     Zusätzliche HTTP-Header
 * @param {Array}  [input.cookies]     Cookies für unauthentifizierte Zusatzinfos
 * @param {string} [input.userAgent]
 * @param {AbortSignal} [input.signal]
 * @param {Object} [input.flags]       Feature-Schalter (playwrightFallback ...)
 * @param {Object} [input.services]    { http, findStream, sessionStore, ... }
 * @param {Object} [input.logger]
 * @param {Object} [input.cache]
 */
const createResolveContext = (input = {}) => {
  const auth = input.auth ? createAuthContext(input.auth) : NO_AUTH;
  const headers = normalizeHeaders(input.headers);
  if (typeof input.userAgent === "string" && input.userAgent.trim() && !headers["user-agent"]) {
    headers["user-agent"] = input.userAgent.trim();
  }

  const context = {
    auth,
    headers,
    cookies: Array.isArray(input.cookies) ? input.cookies : undefined,
    userAgent: headers["user-agent"],
    signal: input.signal,
    flags: { ...(input.flags || {}) },
    services: { ...(input.services || {}) },
    logger: input.logger || nullLogger(),
    cache: input.cache || null
  };

  /** true, wenn der Vorgang abgebrochen wurde. */
  context.isAborted = () => !!(context.signal && context.signal.aborted);

  /** Wirft einen CANCELLED-Fehler, sobald abgebrochen wurde. */
  context.throwIfAborted = () => {
    if (context.isAborted()) {
      throw new ResolveError(ResolveErrorCode.CANCELLED, "Vorgang abgebrochen.");
    }
  };

  /**
   * HTTP-Zugriff für Resolver. Nutzt den injizierten Client (Tests) oder das
   * globale fetch. Header und User-Agent aus dem Context werden ergänzt.
   * @param {string} url
   * @param {RequestInit} [options]
   */
  context.fetch = (url, options = {}) => {
    const client = typeof context.services.http === "function" ? context.services.http : globalThis.fetch;
    if (typeof client !== "function") {
      throw new ResolveError(ResolveErrorCode.NETWORK_ERROR, "Kein HTTP-Client verfügbar.");
    }
    return client(url, {
      ...options,
      signal: options.signal || context.signal,
      headers: { ...context.headers, ...normalizeHeaders(options.headers) }
    });
  };

  /** Kopie mit geänderten Feldern (z. B. anderer Logger je Resolver). */
  context.with = (overrides = {}) => createResolveContext({
    auth: overrides.auth || context.auth,
    headers: overrides.headers || context.headers,
    cookies: overrides.cookies || context.cookies,
    userAgent: overrides.userAgent || context.userAgent,
    signal: overrides.signal || context.signal,
    flags: { ...context.flags, ...(overrides.flags || {}) },
    services: { ...context.services, ...(overrides.services || {}) },
    logger: overrides.logger || context.logger,
    cache: overrides.cache !== undefined ? overrides.cache : context.cache
  });

  return context;
};

/**
 * Log-sichere Zusammenfassung eines Context: keine Cookie-Werte, keine
 * Header-Werte, nur Namen und Anzahlen.
 * @param {Object} context
 */
const describeContext = (context) => {
  if (!context) return { auth: { type: "none" } };
  return {
    auth: describeAuth(context.auth),
    headerNames: Object.keys(context.headers || {}).sort(),
    hasUserAgent: !!(context.headers && context.headers["user-agent"]),
    flags: { ...(context.flags || {}) },
    aborted: typeof context.isAborted === "function" ? context.isAborted() : false
  };
};

module.exports = {
  createResolveContext,
  describeContext,
  normalizeHeaders
};
