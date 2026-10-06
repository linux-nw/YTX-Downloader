/**
 * ProviderResolver für direkt verlinkte Mediendateien und Manifeste.
 *
 * Zuständig für alles, was schon eine Medien-URL ist: Podcast-Enclosures
 * (mp3/m4a), direkte mp4-Links, HLS-Playlists (m3u8) und DASH-Manifeste (mpd).
 * Hier ist nichts zu extrahieren, die URL wird nur normalisiert und mit einem
 * Format versehen.
 *
 * Hinweis: verschlüsselte (DRM-geschützte) Streams werden nicht behandelt.
 * Es wird nichts entschlüsselt und kein Zugriffsschutz umgangen; solche
 * Quellen scheitern bewusst weiter unten im Downloader.
 */

const { ProviderResolver } = require("./ProviderResolver");
const { parseUrl, isHttpUrl } = require("../core/types");

const AUDIO_EXT = ["mp3", "m4a", "aac", "opus", "ogg", "oga", "flac", "wav"];
const VIDEO_EXT = ["mp4", "m4v", "webm", "mov", "mkv", "ts"];
const MANIFEST_EXT = ["m3u8", "mpd"];
const ALL_EXT = [...AUDIO_EXT, ...VIDEO_EXT, ...MANIFEST_EXT];

/** Endung aus dem Pfad (ohne Query), klein geschrieben, oder "". */
const extensionOf = (url) => {
  const parsed = parseUrl(url);
  if (!parsed) return "";
  const match = parsed.pathname.match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : "";
};

class DirectMediaProviderResolver extends ProviderResolver {
  constructor() {
    // Hohe Priorität: wenn die URL bereits eine Mediendatei ist, muss kein
    // anderer Resolver mehr raten.
    super({ name: "direct-media", priority: 80 });
  }

  canHandle(url) {
    return isHttpUrl(url) && ALL_EXT.includes(extensionOf(url));
  }

  /**
   * @param {string} url
   * @returns {Promise<Object>} ResolvedMedia
   */
  async resolve(url) {
    const ext = extensionOf(url);
    return {
      sourceUrl: url,
      mediaUrl: url,
      provider: "direct",
      formats: [{
        url,
        ext,
        note: MANIFEST_EXT.includes(ext)
          ? "Manifest (adaptive Streams)"
          : (AUDIO_EXT.includes(ext) ? "Direkte Audiodatei" : "Direkte Videodatei")
      }]
    };
  }
}

module.exports = {
  DirectMediaProviderResolver,
  extensionOf,
  AUDIO_EXT,
  VIDEO_EXT,
  MANIFEST_EXT
};
