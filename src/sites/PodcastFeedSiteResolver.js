/**
 * SiteResolver für Podcast-RSS-Feeds.
 *
 * Übernimmt die bisherige Feed-Logik aus main.js unverändert in der Sache:
 * Regex-basiert statt mit XML-Parser, um keine zusätzliche Abhängigkeit zu
 * brauchen - Podcast-RSS ist strukturell einfach genug (ein <item> pro
 * Episode, ein <enclosure url="...">).
 *
 * Neu ist nur die Form des Ergebnisses: jede Episode wird zu einer
 * Media-Referenz mit providerUrl = enclosure-URL. Den Rest macht der
 * DirectMediaProviderResolver, der Download läuft danach wie bisher über
 * dieselbe MP3-Pipeline.
 */

const { SiteResolver } = require("./SiteResolver");
const { ResolveError, ResolveErrorCode } = require("../core/errors");
const { hostOf, isHttpUrl } = require("../core/types");

// Begrenzung gegen versehentliches Queuen riesiger Feeds (manche haben 1000+
// Folgen). Bewusst hoch, damit die Folgenauswahl im UI auch bei langem Archiv
// die komplette Liste zeigen kann.
const MAX_PODCAST_EPISODES = 300;

const decodeXmlEntities = (s) => String(s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"").replace(/&#0?39;/g, "'")
  .trim();

const extractTag = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? decodeXmlEntities(m[1]) : null;
};

/** Bild einer Episode: <itunes:image href="..."> oder Kanalbild als Fallback. */
const extractImage = (block) => {
  const m = block.match(/<itunes:image[^>]*\shref=["']([^"']+)["']/i);
  return m ? decodeXmlEntities(m[1]) : null;
};

/** <itunes:duration> in Sekunden, akzeptiert "83", "1:23" und "01:02:03". */
const parseDuration = (value) => {
  if (!value) return undefined;
  const parts = String(value).trim().split(":").map((p) => Number.parseFloat(p));
  if (parts.some((p) => !Number.isFinite(p))) return undefined;
  return parts.reduce((total, part) => total * 60 + part, 0);
};

/**
 * Heuristik der UI: sieht die URL nach einem Feed aus? Deckt gängige
 * Hosting-Anbieter und die üblichen Pfadmuster ab.
 * @param {string} url
 */
const looksLikePodcastFeed = (url) => {
  if (!isHttpUrl(url)) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = hostOf(url);
  if (/^feeds?\./i.test(parsed.hostname)) return true;
  if (/(^|\.)(anchor\.fm|libsyn\.com|feedburner\.com|feedpress\.me|podcastics\.com|megaphone\.fm|buzzsprout\.com|podbean\.com|simplecast\.com|transistor\.fm)$/i.test(host)) return true;
  if (/\.(xml|rss)(\?|$)/i.test(parsed.pathname)) return true;
  if (/\/(rss|feed)(\/|\.xml)?$/i.test(parsed.pathname)) return true;
  return false;
};

class PodcastFeedSiteResolver extends SiteResolver {
  /**
   * @param {{ maxEpisodes?: number }} [options]
   */
  constructor(options = {}) {
    // Hohe Priorität: ein Feed ist eindeutig erkennbar und soll vor dem
    // generischen Resolver drankommen.
    super({ name: "podcast-rss", priority: 90 });
    this.maxEpisodes = Number.isFinite(options.maxEpisodes) ? options.maxEpisodes : MAX_PODCAST_EPISODES;
  }

  canHandle(url) {
    return looksLikePodcastFeed(url);
  }

  /**
   * @param {string} url
   * @param {Object} context ResolveContext (nutzt context.fetch)
   * @returns {Promise<Array>} eine Referenz pro Episode
   */
  async resolve(url, context = {}) {
    const fetchImpl = typeof context.fetch === "function"
      ? context.fetch
      : (target, init) => globalThis.fetch(target, init);

    let res;
    try {
      res = await fetchImpl(url, { headers: { "user-agent": context.userAgent || "Mozilla/5.0" } });
    } catch (err) {
      throw new ResolveError(
        ResolveErrorCode.NETWORK_ERROR,
        "Podcast-Feed nicht erreichbar. Internetverbindung/URL prüfen.",
        { resolver: this.name, url, cause: err }
      );
    }
    if (!res || !res.ok) {
      const status = res ? res.status : 0;
      const code = status === 401 || status === 403
        ? ResolveErrorCode.AUTH_REQUIRED
        : ResolveErrorCode.PROVIDER_ERROR;
      throw new ResolveError(
        code,
        `Podcast-Feed konnte nicht geladen werden (${status}).`,
        { resolver: this.name, url }
      );
    }

    const xml = await res.text();
    const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
    if (itemBlocks.length === 0) {
      throw new ResolveError(
        ResolveErrorCode.EXTRACTION_FAILED,
        "Kein gültiger Podcast-RSS-Feed (keine Episoden gefunden).",
        { resolver: this.name, url }
      );
    }

    const channelImage = extractImage(xml.split(/<item\b/i)[0] || "");
    const episodes = [];
    for (const block of itemBlocks) {
      if (episodes.length >= this.maxEpisodes) break;
      const title = extractTag(block, "title");
      const enclosureMatch = block.match(/<enclosure[^>]*\surl=["']([^"']+)["'][^>]*>/i);
      const audioUrl = enclosureMatch ? decodeXmlEntities(enclosureMatch[1]) : null;
      if (!title || !audioUrl) continue;
      episodes.push({
        sourceUrl: url,
        providerUrl: audioUrl,
        title,
        thumbnail: extractImage(block) || channelImage || undefined,
        duration: parseDuration(extractTag(block, "itunes:duration")),
        provider: "podcast-rss",
        meta: { pubDate: extractTag(block, "pubDate") }
      });
    }

    if (episodes.length === 0) {
      throw new ResolveError(
        ResolveErrorCode.EXTRACTION_FAILED,
        "Keine Episoden mit direktem Audio-Link gefunden.",
        { resolver: this.name, url }
      );
    }
    return episodes;
  }
}

module.exports = {
  PodcastFeedSiteResolver,
  looksLikePodcastFeed,
  decodeXmlEntities,
  extractTag,
  parseDuration,
  MAX_PODCAST_EPISODES
};
