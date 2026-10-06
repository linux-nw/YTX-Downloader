/**
 * Strukturierte Resolver-Fehler.
 *
 * Bisher landete jeder Fehlschlag als freie Textzeile in der UI ("failed").
 * Mit einem Fehlercode kann die Pipeline entscheiden, ob ein Fallback
 * überhaupt Sinn ergibt (z. B. AUTH_REQUIRED: ein zweiter Versuch ohne
 * Cookies bringt nichts) und die UI kann gezielt helfen.
 */

const ResolveErrorCode = {
  UNSUPPORTED_URL: "UNSUPPORTED_URL",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  CAPTCHA_REQUIRED: "CAPTCHA_REQUIRED",
  GEO_RESTRICTED: "GEO_RESTRICTED",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  EXTRACTION_FAILED: "EXTRACTION_FAILED",
  NETWORK_ERROR: "NETWORK_ERROR",
  // Ergänzungen für die vorhandenen Abläufe dieses Projekts:
  DEPENDENCY_MISSING: "DEPENDENCY_MISSING", // yt-dlp/ffmpeg/Playwright fehlt (ENOENT)
  CANCELLED: "CANCELLED"                    // Nutzer hat abgebrochen
};

/**
 * Reihenfolge für die Aggregation mehrerer Fehlversuche: Was weiter oben
 * steht, ist die für den Nutzer nützlichere Aussage. "Login nötig" hilft
 * mehr als das generische "Extraktion fehlgeschlagen" eines Zweitresolvers.
 */
const ERROR_PRIORITY = [
  ResolveErrorCode.CANCELLED,
  ResolveErrorCode.AUTH_REQUIRED,
  ResolveErrorCode.SESSION_EXPIRED,
  ResolveErrorCode.CAPTCHA_REQUIRED,
  ResolveErrorCode.GEO_RESTRICTED,
  ResolveErrorCode.DEPENDENCY_MISSING,
  ResolveErrorCode.NETWORK_ERROR,
  ResolveErrorCode.PROVIDER_ERROR,
  ResolveErrorCode.EXTRACTION_FAILED,
  ResolveErrorCode.UNSUPPORTED_URL
];

/**
 * Fehlercodes, bei denen weitere Resolver/Fallback-Stufen nichts bringen:
 * abgebrochen ist abgebrochen, und ohne Login/Captcha ändert eine andere
 * Extraktionsmethode nichts an der fehlenden Berechtigung.
 */
const TERMINAL_CODES = new Set([
  ResolveErrorCode.CANCELLED
]);

class ResolveError extends Error {
  /**
   * @param {string} code    Wert aus ResolveErrorCode
   * @param {string} message Menschenlesbare Meldung (ohne Secrets!)
   * @param {{ resolver?: string, url?: string, cause?: any, details?: Object, retryable?: boolean }} [options]
   */
  constructor(code, message, options = {}) {
    super(message || code);
    this.name = "ResolveError";
    this.code = ResolveErrorCode[code] ? code : ResolveErrorCode.EXTRACTION_FAILED;
    if (options.resolver) this.resolver = options.resolver;
    if (options.url) this.url = options.url;
    if (options.cause !== undefined) this.cause = options.cause;
    if (options.details) this.details = options.details;
    this.retryable = options.retryable !== undefined
      ? !!options.retryable
      : !TERMINAL_CODES.has(this.code);
  }

  /** Kompakte, log-sichere Darstellung (enthält nur Code, Resolver, Meldung). */
  toLogObject() {
    return {
      code: this.code,
      resolver: this.resolver || null,
      message: this.message
    };
  }
}

/**
 * Heuristik aus der bestehenden main.js: Sieht die Meldung nach einem
 * Zugriffs-/Anti-Bot-Block aus (403/410/429/451, Cloudflare ...)? Dann lohnt
 * ein Wiederholungsversuch mit Browser-Impersonation, seitenübergreifend.
 * Bewusst unverändert übernommen, damit die bestehenden Tipps gleich bleiben.
 * @param {string} msg
 */
const looksLikeBlock = (msg) => !!msg && /HTTP Error (4|5)\d\d|\b4(0[39]|10|29|51)\b|forbidden|blocked|cloudflare|captcha|Unable to download webpage|TLS|SSL|Got error/i.test(msg);

/** yt-dlp meldet "Unsupported URL", wenn kein Extractor greift. */
const isUnsupportedUrl = (msg) => !!msg && /unsupported url/i.test(msg);

/**
 * Ordnet eine rohe Fehlermeldung (yt-dlp-Zeile, fetch-Fehler ...) einem
 * strukturierten Code zu. Reihenfolge der Prüfungen ist wichtig: die
 * spezifischeren Fälle zuerst, der generische Block-Fall zuletzt.
 * @param {string} msg
 * @returns {string} ResolveErrorCode
 */
const classifyMessage = (msg) => {
  const text = String(msg || "");
  if (!text.trim()) return ResolveErrorCode.EXTRACTION_FAILED;

  if (/\babort(ed)?\b|abgebrochen|cancell?ed/i.test(text)) return ResolveErrorCode.CANCELLED;

  // Captcha/Bot-Check vor Auth prüfen: "Sign in to confirm you're not a bot"
  // enthält beide Signalwörter, ist aber ein Bot-Check.
  if (/captcha|not a bot|recaptcha|hcaptcha|challenge required/i.test(text)) {
    return ResolveErrorCode.CAPTCHA_REQUIRED;
  }
  if (/session (has )?expired|cookies are no longer valid|token (has )?expired|invalid session|HTTP Error 401|\b401\b/i.test(text)) {
    return ResolveErrorCode.SESSION_EXPIRED;
  }
  if (/sign in|log ?in required|login required|requires authentication|members?-only|private (video|album|content)|is private|account|--cookies|age.?restricted|confirm your age|premium/i.test(text)) {
    return ResolveErrorCode.AUTH_REQUIRED;
  }
  if (/available in your country|geo.?restrict|geo.?block|HTTP Error 451|\b451\b|blocked in your/i.test(text)) {
    return ResolveErrorCode.GEO_RESTRICTED;
  }
  if (isUnsupportedUrl(text) || /no video (formats )?found|there.?s no video|no media found/i.test(text)) {
    return ResolveErrorCode.UNSUPPORTED_URL;
  }
  if (/ENOENT|wurde nicht gefunden|not installed|command not found|is not recognized/i.test(text)) {
    return ResolveErrorCode.DEPENDENCY_MISSING;
  }
  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|getaddrinfo|network|timed? ?out|fetch failed|nicht erreichbar/i.test(text)) {
    return ResolveErrorCode.NETWORK_ERROR;
  }
  if (looksLikeBlock(text)) return ResolveErrorCode.PROVIDER_ERROR;

  return ResolveErrorCode.EXTRACTION_FAILED;
};

/**
 * Macht aus einem beliebigen geworfenen Wert einen ResolveError.
 * Bereits strukturierte Fehler bleiben unverändert (inkl. ihres Codes).
 * @param {any} err
 * @param {{ resolver?: string, url?: string, code?: string }} [options]
 * @returns {ResolveError}
 */
const toResolveError = (err, options = {}) => {
  if (err instanceof ResolveError) {
    if (options.resolver && !err.resolver) err.resolver = options.resolver;
    if (options.url && !err.url) err.url = options.url;
    return err;
  }
  const message = err && err.message ? err.message : String(err || "Unbekannter Fehler");
  // Node-Fehlercodes (ENOENT, ECONNRESET ...) fließen in die Klassifikation ein.
  const nodeCode = err && typeof err.code === "string" ? err.code : "";
  const code = options.code
    || (ResolveErrorCode[nodeCode] ? nodeCode : classifyMessage(`${nodeCode} ${message}`));
  return new ResolveError(code, message, {
    resolver: options.resolver,
    url: options.url,
    cause: err
  });
};

/**
 * Wählt aus mehreren Fehlversuchen den aussagekräftigsten Fehler.
 * @param {ResolveError[]} errors
 * @returns {ResolveError|null}
 */
const pickMostRelevantError = (errors) => {
  const list = (errors || []).filter(Boolean);
  if (list.length === 0) return null;
  let best = list[0];
  let bestRank = ERROR_PRIORITY.indexOf(best.code);
  for (const err of list.slice(1)) {
    const rank = ERROR_PRIORITY.indexOf(err.code);
    if (rank !== -1 && (bestRank === -1 || rank < bestRank)) {
      best = err;
      bestRank = rank;
    }
  }
  return best;
};

/** Praktisch für Resolver: "ich könnte, aber nur mit Login". */
const authRequired = (message, options = {}) =>
  new ResolveError(ResolveErrorCode.AUTH_REQUIRED, message, options);

/** Praktisch für Resolver: "diese URL ist nicht meine Baustelle". */
const unsupported = (message, options = {}) =>
  new ResolveError(ResolveErrorCode.UNSUPPORTED_URL, message, options);

module.exports = {
  ResolveError,
  ResolveErrorCode,
  ERROR_PRIORITY,
  TERMINAL_CODES,
  looksLikeBlock,
  isUnsupportedUrl,
  classifyMessage,
  toResolveError,
  pickMostRelevantError,
  authRequired,
  unsupported
};
