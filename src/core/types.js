/**
 * Gemeinsame Typdefinitionen der Resolver-Architektur.
 *
 * Das Projekt ist bewusst reines CommonJS ohne Build-Schritt, die "Interfaces"
 * sind daher JSDoc-Typedefs plus die Normalisierungsfunktionen in dieser Datei.
 *
 * @typedef {Object} MediaFormat
 * @property {string} [formatId]   Kennung des Formats beim Provider
 * @property {string} [url]        Direkte Medien-URL dieses Formats
 * @property {string} [ext]        Container/Endung (mp4, m4a, m3u8 ...)
 * @property {number} [height]     Videohöhe in Pixeln
 * @property {number} [tbr]        Gesamtbitrate in kbit/s
 * @property {string} [vcodec]
 * @property {string} [acodec]
 * @property {string} [note]
 *
 * @typedef {Object} ResolvedMedia
 * @property {string}  sourceUrl        Ursprüngliche Seite/URL, aus der die Referenz stammt
 * @property {string}  [providerUrl]    Von einem SiteResolver gefundene Hoster-/Provider-URL.
 *                                      Zwischenschritt: noch kein Download, nur eine Referenz.
 * @property {string}  [mediaUrl]       Vom ProviderResolver aufgelöste, herunterladbare URL
 * @property {string}  [title]
 * @property {string}  [thumbnail]
 * @property {number}  [duration]       Sekunden
 * @property {MediaFormat[]} [formats]
 * @property {string}  [provider]       Name des Providers ("yt-dlp", "direct", "podcast-rss" ...)
 * @property {boolean} [requiresAuth]   Provider signalisiert: ohne Auth nicht abspielbar
 * @property {string}  [resolver]       Name des Resolvers, der das Ergebnis geliefert hat
 * @property {Object}  [meta]           Freie, nicht sensible Zusatzdaten (z. B. pubDate)
 *
 * @typedef {Object} Cookie
 * @property {string} name
 * @property {string} value
 * @property {string} [domain]
 * @property {string} [path]
 * @property {number} [expires]
 *
 * @typedef {Object} AuthContext
 * @property {"none"|"cookies"|"session"} type
 * @property {Cookie[]} [cookies]
 * @property {string}   [sessionId]
 * @property {string}   [cookiesFromBrowser] Referenz auf einen Browser, aus dem Cookies
 *                                           erst zur Laufzeit gelesen werden (kein Secret).
 *
 * @typedef {Object} ResolveContext
 * @property {AuthContext} [auth]
 * @property {Record<string,string>} [headers]
 * @property {Cookie[]} [cookies]
 * @property {string} [userAgent]
 * @property {AbortSignal} [signal]
 * @property {Object} [flags]     Feature-Schalter (z. B. playwrightFallback)
 * @property {Object} [services]  Injizierte Abhängigkeiten (http, findStream ...)
 * @property {Object} [logger]
 * @property {Object} [cache]
 *
 * @typedef {Object} SiteResolver
 * @property {string} name
 * @property {number} [priority]
 * @property {(url: string) => boolean} canHandle
 * @property {(url: string, context: ResolveContext) => Promise<ResolvedMedia[]>} resolve
 *
 * @typedef {Object} ProviderResolver
 * @property {string} name
 * @property {number} [priority]
 * @property {(url: string) => boolean} canHandle
 * @property {(url: string, context: ResolveContext) => Promise<ResolvedMedia>} resolve
 */

/** Erlaubte Protokolle für Resolver-Eingaben. */
const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Tolerantes URL-Parsing: liefert das URL-Objekt oder null (statt zu werfen).
 * @param {string} url
 * @returns {URL|null}
 */
const parseUrl = (url) => {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    return new URL(url.trim());
  } catch {
    return null;
  }
};

/**
 * @param {string} url
 * @returns {boolean} true, wenn es eine absolute http(s)-URL ist.
 */
const isHttpUrl = (url) => {
  const parsed = parseUrl(url);
  return !!parsed && SUPPORTED_PROTOCOLS.has(parsed.protocol);
};

/**
 * Hostname in Kleinbuchstaben ohne führendes "www.", oder "" bei ungültiger URL.
 * @param {string} url
 */
const hostOf = (url) => {
  const parsed = parseUrl(url);
  return parsed ? parsed.hostname.toLowerCase().replace(/^www\./, "") : "";
};

/**
 * Prüft, ob der Host gleich einer Domain ist oder eine Subdomain davon.
 * @param {string} url
 * @param {string[]} domains
 */
const hostMatches = (url, domains) => {
  const host = hostOf(url);
  if (!host) return false;
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
};

const toFiniteNumber = (value) => {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(n) ? n : undefined;
};

const toCleanString = (value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * Normalisiert ein einzelnes Format auf die MediaFormat-Struktur.
 * @param {any} raw
 * @returns {MediaFormat|null}
 */
const normalizeFormat = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  /** @type {MediaFormat} */
  const format = {};
  const formatId = toCleanString(raw.formatId !== undefined ? raw.formatId : raw.format_id);
  if (formatId) format.formatId = formatId;
  const url = toCleanString(raw.url);
  if (url) format.url = url;
  const ext = toCleanString(raw.ext);
  if (ext) format.ext = ext;
  const height = toFiniteNumber(raw.height);
  if (height !== undefined) format.height = height;
  const tbr = toFiniteNumber(raw.tbr);
  if (tbr !== undefined) format.tbr = tbr;
  const vcodec = toCleanString(raw.vcodec);
  if (vcodec) format.vcodec = vcodec;
  const acodec = toCleanString(raw.acodec);
  if (acodec) format.acodec = acodec;
  const note = toCleanString(raw.note !== undefined ? raw.note : raw.format_note);
  if (note) format.note = note;
  return Object.keys(format).length ? format : null;
};

/**
 * Bringt ein beliebiges Resolver-Ergebnis auf die einheitliche ResolvedMedia-Form.
 * Unbekannte Felder werden verworfen, damit die Downloader-Schicht wirklich nur
 * mit dem normalisierten Ergebnis arbeitet und nichts über Provider-Interna weiß.
 *
 * @param {any} raw
 * @param {{ sourceUrl?: string, resolver?: string, provider?: string }} [defaults]
 * @returns {ResolvedMedia}
 */
const normalizeMedia = (raw, defaults = {}) => {
  if (!raw || typeof raw !== "object") {
    throw new TypeError("normalizeMedia: Objekt erwartet.");
  }
  const sourceUrl = toCleanString(raw.sourceUrl) || toCleanString(defaults.sourceUrl);
  if (!sourceUrl) {
    throw new TypeError("normalizeMedia: sourceUrl fehlt.");
  }

  /** @type {ResolvedMedia} */
  const media = { sourceUrl };

  const providerUrl = toCleanString(raw.providerUrl);
  if (providerUrl) media.providerUrl = providerUrl;
  const mediaUrl = toCleanString(raw.mediaUrl);
  if (mediaUrl) media.mediaUrl = mediaUrl;
  const title = toCleanString(raw.title);
  if (title) media.title = title;
  const thumbnail = toCleanString(raw.thumbnail);
  if (thumbnail) media.thumbnail = thumbnail;
  const duration = toFiniteNumber(raw.duration);
  if (duration !== undefined) media.duration = duration;

  if (Array.isArray(raw.formats)) {
    const formats = raw.formats.map(normalizeFormat).filter(Boolean);
    if (formats.length) media.formats = formats;
  }

  const provider = toCleanString(raw.provider) || toCleanString(defaults.provider);
  if (provider) media.provider = provider;
  const resolver = toCleanString(raw.resolver) || toCleanString(defaults.resolver);
  if (resolver) media.resolver = resolver;
  if (raw.requiresAuth !== undefined) media.requiresAuth = !!raw.requiresAuth;
  if (raw.meta && typeof raw.meta === "object") media.meta = { ...raw.meta };

  return media;
};

/**
 * Die URL, mit der die Downloader-Schicht arbeitet: aufgelöste Medien-URL,
 * sonst die Provider-Referenz, sonst die Quelle.
 * @param {ResolvedMedia} media
 * @returns {string}
 */
const downloadUrlOf = (media) => media.mediaUrl || media.providerUrl || media.sourceUrl;

/**
 * Ein Ergebnis gilt als "aufgelöst", wenn eine konkrete Medien-URL vorliegt.
 * @param {ResolvedMedia} media
 */
const isResolved = (media) => !!(media && media.mediaUrl);

module.exports = {
  SUPPORTED_PROTOCOLS,
  parseUrl,
  isHttpUrl,
  hostOf,
  hostMatches,
  normalizeFormat,
  normalizeMedia,
  downloadUrlOf,
  isResolved
};
