/**
 * AuthContext: bewusst vom Resolver getrennt.
 *
 * Ein Resolver bekommt Auth nur als Teil des ResolveContext gereicht und
 * speichert nichts davon. Passwörter gibt es hier absichtlich gar nicht als
 * Feld: die App meldet sich nirgends selbst an, sie verwendet entweder
 * gar keine Auth, bereits vorhandene Cookies oder eine Session-Referenz.
 */

const { ResolveError, ResolveErrorCode } = require("../core/errors");

const AUTH_TYPES = new Set(["none", "cookies", "session"]);

/** Felder, die niemals in einen AuthContext gehören. */
const FORBIDDEN_FIELDS = ["password", "passwd", "pwd", "secret", "apiKey", "api_key", "token"];

/**
 * Normalisiert einen einzelnen Cookie auf {name, value, domain?, path?, expires?}.
 * @param {any} raw
 */
const normalizeCookie = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  const cookie = { name, value: typeof raw.value === "string" ? raw.value : "" };
  if (typeof raw.domain === "string" && raw.domain) cookie.domain = raw.domain;
  if (typeof raw.path === "string" && raw.path) cookie.path = raw.path;
  if (Number.isFinite(raw.expires)) cookie.expires = raw.expires;
  return cookie;
};

/**
 * Erstellt einen validierten AuthContext.
 *
 * @param {{ type?: string, cookies?: Array, sessionId?: string, cookiesFromBrowser?: string }} [input]
 * @returns {{ type: string, cookies?: Array, sessionId?: string, cookiesFromBrowser?: string }}
 */
const createAuthContext = (input = {}) => {
  for (const field of FORBIDDEN_FIELDS) {
    if (input && Object.prototype.hasOwnProperty.call(input, field)) {
      throw new TypeError(
        `AuthContext: Feld "${field}" ist nicht erlaubt. Zugangsdaten werden nicht im Resolver gehalten.`
      );
    }
  }

  const type = AUTH_TYPES.has(input.type) ? input.type : "none";
  const auth = { type };

  if (type === "cookies") {
    const cookies = Array.isArray(input.cookies)
      ? input.cookies.map(normalizeCookie).filter(Boolean)
      : [];
    if (cookies.length) auth.cookies = cookies;
    // Referenz auf einen Browser, aus dem yt-dlp die Cookies selbst liest.
    // Das ist nur ein Name ("chrome", "firefox" ...), kein Geheimnis.
    if (typeof input.cookiesFromBrowser === "string" && input.cookiesFromBrowser
      && input.cookiesFromBrowser !== "none") {
      auth.cookiesFromBrowser = input.cookiesFromBrowser;
    }
  }

  if (type === "session") {
    if (typeof input.sessionId !== "string" || !input.sessionId.trim()) {
      throw new TypeError('AuthContext: type "session" benötigt eine sessionId.');
    }
    auth.sessionId = input.sessionId.trim();
  }

  return auth;
};

/** Der Standard: kein Login, keine Cookies. */
const NO_AUTH = Object.freeze({ type: "none" });

/**
 * @param {{type: string}} [auth]
 * @returns {boolean} true, wenn überhaupt Auth-Material vorhanden ist.
 */
const hasAuth = (auth) => !!auth && auth.type !== "none";

/**
 * Log-sichere Darstellung: nur Art und Menge, nie Werte.
 * @param {Object} [auth]
 */
const describeAuth = (auth) => {
  if (!auth || auth.type === "none") return { type: "none" };
  const out = { type: auth.type };
  if (Array.isArray(auth.cookies)) out.cookieCount = auth.cookies.length;
  if (auth.cookiesFromBrowser) out.cookiesFromBrowser = auth.cookiesFromBrowser;
  if (auth.sessionId) out.hasSession = true;
  return out;
};

/**
 * Fehler, mit dem ein Resolver signalisiert: "geht, aber nur mit Login".
 * @param {string} [message]
 * @param {{ resolver?: string, url?: string, needs?: string }} [options]
 */
const requireAuth = (message, options = {}) => new ResolveError(
  ResolveErrorCode.AUTH_REQUIRED,
  message || "Für diese Quelle wird eine Anmeldung benötigt.",
  { resolver: options.resolver, url: options.url, details: { needs: options.needs || "cookies" } }
);

/**
 * Fehler, mit dem ein Resolver signalisiert: "die Session ist abgelaufen".
 * @param {string} [message]
 * @param {{ resolver?: string, url?: string }} [options]
 */
const sessionExpired = (message, options = {}) => new ResolveError(
  ResolveErrorCode.SESSION_EXPIRED,
  message || "Die gespeicherte Session ist abgelaufen.",
  options
);

module.exports = {
  AUTH_TYPES,
  NO_AUTH,
  createAuthContext,
  normalizeCookie,
  hasAuth,
  describeAuth,
  requireAuth,
  sessionExpired
};
