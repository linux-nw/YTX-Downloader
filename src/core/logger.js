/**
 * Strukturiertes Logging der Auflösungs-Pipeline.
 *
 * Jeder Schritt (Input -> Site erkannt -> Provider erkannt -> Resolver
 * versucht -> Erfolg/Fehler -> Fallback -> Ergebnis) wird als Objekt geloggt
 * und zusätzlich als eine Zeile formatiert, damit die vorhandene
 * "download:log"-Anzeige der App unverändert weiterbenutzt werden kann.
 *
 * Sicherheit: Cookies, Tokens, Passwörter und Authorization-Header werden vor
 * der Ausgabe entfernt bzw. maskiert. Das passiert zentral hier, damit kein
 * einzelner Resolver es vergessen kann.
 */

const STEP = {
  INPUT: "input",
  SITE_DETECTED: "site-detected",
  PROVIDER_DETECTED: "provider-detected",
  RESOLVER_TRY: "resolver-try",
  RESOLVER_OK: "resolver-ok",
  RESOLVER_FAIL: "resolver-fail",
  FALLBACK: "fallback",
  RESULT: "result",
  CACHE_HIT: "cache-hit"
};

const REDACTED = "[redacted]";

/** Query-Parameter, die typischerweise Signaturen/Tokens tragen. */
const SENSITIVE_QUERY_PARAMS = [
  "token", "access_token", "auth", "authorization", "sig", "signature",
  "key", "apikey", "api_key", "password", "passwd", "pwd", "session",
  "sessionid", "hash", "policy", "credential", "x-amz-signature"
];

/** Header-Namen, deren Werte nie geloggt werden. */
const SENSITIVE_HEADERS = new Set([
  "cookie", "set-cookie", "authorization", "proxy-authorization",
  "x-api-key", "x-auth-token", "x-csrf-token"
]);

/** Objekt-Schlüssel, die nie im Log auftauchen dürfen. */
const SENSITIVE_KEYS = /^(cookies?|token|access_?token|refresh_?token|password|passwd|pwd|secret|authorization|auth_?header|session_?id|api_?key|credential)s?$/i;

/**
 * Entfernt Signatur-/Token-Parameter aus einer URL. Ungültige URLs werden
 * unverändert zurückgegeben (dann ist es ohnehin kein Query-String).
 * @param {string} url
 */
const redactUrl = (url) => {
  if (typeof url !== "string" || !url) return url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  let touched = false;
  for (const key of [...parsed.searchParams.keys()]) {
    if (SENSITIVE_QUERY_PARAMS.includes(key.toLowerCase())) {
      parsed.searchParams.set(key, REDACTED);
      touched = true;
    }
  }
  // Userinfo (https://user:pass@host) ebenfalls entfernen.
  if (parsed.username || parsed.password) {
    parsed.username = "";
    parsed.password = "";
    touched = true;
  }
  return touched ? parsed.toString() : url;
};

/**
 * Header-Map für die Ausgabe säubern: sensible Werte werden maskiert, die
 * Namen bleiben sichtbar (nützlich zur Fehlersuche, verrät nichts).
 * @param {Record<string,string>} headers
 */
const redactHeaders = (headers) => {
  if (!headers || typeof headers !== "object") return headers;
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = SENSITIVE_HEADERS.has(String(name).toLowerCase()) ? REDACTED : value;
  }
  return out;
};

/**
 * Rekursive Säuberung beliebiger Log-Nutzlast.
 * @param {any} value
 * @param {number} [depth]
 */
const redact = (value, depth = 0) => {
  if (depth > 6) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactUrl(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, code: value.code || null, message: redactUrl(value.message) };
  }

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(key)) {
      // Menge statt Inhalt: hilft beim Debuggen, ohne etwas preiszugeben.
      out[key] = Array.isArray(val) ? `${REDACTED} (${val.length})` : REDACTED;
      continue;
    }
    if (String(key).toLowerCase() === "headers") {
      out[key] = redactHeaders(val);
      continue;
    }
    out[key] = redact(val, depth + 1);
  }
  return out;
};

/** Einzeilige, menschenlesbare Darstellung eines Schritts. */
const formatEntry = (entry) => {
  const parts = [`[resolve] ${entry.step}`];
  if (entry.resolver) parts.push(`resolver=${entry.resolver}`);
  if (entry.provider) parts.push(`provider=${entry.provider}`);
  if (entry.site) parts.push(`site=${entry.site}`);
  if (entry.url) parts.push(`url=${entry.url}`);
  if (entry.count !== undefined) parts.push(`count=${entry.count}`);
  if (entry.code) parts.push(`code=${entry.code}`);
  if (entry.ms !== undefined) parts.push(`${entry.ms}ms`);
  if (entry.message) parts.push(`- ${entry.message}`);
  return parts.join(" ");
};

/**
 * @param {{ sink?: (line: string, entry: Object) => void, runId?: string, enabled?: boolean }} [options]
 */
const createLogger = (options = {}) => {
  const sink = typeof options.sink === "function" ? options.sink : null;
  const enabled = options.enabled !== false;
  const runId = options.runId || null;
  /** @type {Object[]} */
  const entries = [];

  /**
   * @param {string} step  Wert aus STEP
   * @param {Object} [data]
   */
  const step = (stepName, data = {}) => {
    const entry = redact({ ...data, step: stepName });
    if (runId) entry.runId = runId;
    entry.ts = Date.now();
    entries.push(entry);
    if (enabled && sink) {
      try {
        sink(formatEntry(entry), entry);
      } catch {
        // Logging darf die Auflösung niemals zum Absturz bringen.
      }
    }
    return entry;
  };

  return {
    STEP,
    step,
    /** Alle bisher gesammelten (bereits gesäuberten) Einträge. */
    entries: () => entries.slice(),
    /** Untergeordneter Logger mit derselben Senke, z. B. pro Kandidat. */
    child: (childOptions = {}) => createLogger({ sink, enabled, runId, ...childOptions })
  };
};

/** Logger, der nichts ausgibt, aber Einträge sammelt (Tests, Default). */
const nullLogger = () => createLogger({ enabled: false });

module.exports = {
  STEP,
  REDACTED,
  SENSITIVE_HEADERS,
  SENSITIVE_QUERY_PARAMS,
  redact,
  redactUrl,
  redactHeaders,
  formatEntry,
  createLogger,
  nullLogger
};
