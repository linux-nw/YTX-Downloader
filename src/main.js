const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

let mainWindow;
let activeDownload = null;
// Wird von download:cancel gesetzt, damit mehrstufige Abläufe (Transkript) nach
// einem Abbruch nicht mit der nächsten Stufe weitermachen.
let cancelRequested = false;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#0a0e14",
    title: "YTX Downloader",
    titleBarStyle: "hidden",
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Lade die neue Vela React App
  mainWindow.loadFile(path.join(__dirname, "index.html"));
};

app.whenReady().then(() => {
  // Wichtig für zuverlässige Windows-Benachrichtigungen (sonst erscheinen sie ggf. nicht)
  if (process.platform === "win32") {
    app.setAppUserModelId("com.ytx.downloader");
  }
  createWindow();

  // Dep-Cache vorab befüllen; warnen wenn curl_cffi fehlt (Impersonation nicht nutzbar).
  getDependencyStatus().then((deps) => {
    if (!deps.impersonateAvailable) {
      console.warn(
        "[YTX] Browser-Impersonation nicht verfügbar (curl_cffi fehlt).\n" +
        "      Seiten wie Pornhub senden HTTP 410 ohne Impersonation.\n" +
        "      Lösung: pip install -U \"yt-dlp[default,curl-cffi]\""
      );
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// IPC Helper
const sendToRenderer = (channel, payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
};

const getDefaultDownloadFolder = () => app.getPath("downloads");

// Erlaubte Zeichensätze für Dateinamen (= Python-Codec-Namen, an PYTHONIOENCODING).
// "system" lässt die Umgebung unberührt. Unbekannte Werte → utf-8.
const ALLOWED_ENCODINGS = new Set([
  "system", "utf-8", "utf-8-sig", "utf-16", "ascii",
  "cp1252", "latin-1", "iso-8859-15", "cp437", "cp850", "mac-roman"
]);
const normalizeEncoding = (enc) => (ALLOWED_ENCODINGS.has(enc) ? enc : "utf-8");

// Browser, deren Cookies yt-dlp via --cookies-from-browser auslesen kann.
const ALLOWED_BROWSERS = new Set([
  "none", "chrome", "firefox", "edge", "brave", "opera", "vivaldi", "chromium", "safari", "whale"
]);

// Whisper-Modelle (Sprache→Text). Größer = genauer aber langsamer. Default: base.
const ALLOWED_WHISPER_MODELS = new Set(["tiny", "base", "small", "medium", "large"]);
const normalizeWhisperModel = (m) => (ALLOWED_WHISPER_MODELS.has(m) ? m : "base");

// Heuristik: Sieht die Fehlermeldung nach einem Zugriffs-/Anti-Bot-Block aus
// (403/410/429/451, Cloudflare, "Unable to download webpage" …)? Dann lohnt ein
// generischer Wiederholungsversuch mit Browser-Impersonation – seitenübergreifend.
const looksLikeBlock = (msg) => !!msg && /HTTP Error (4|5)\d\d|\b4(0[39]|10|29|51)\b|forbidden|blocked|cloudflare|captcha|Unable to download webpage|TLS|SSL|Got error/i.test(msg);
const isUnsupportedUrl = (msg) => !!msg && /unsupported url/i.test(msg);

// Liefert domain-spezifische extractor-args für Stufe 2 der Retry-Kaskade,
// oder null wenn für diese URL kein passender Age-Gate-Bypass bekannt ist.
const getAgeGateExtraArgs = (url) => {
  if (/(?:^|\.)youtube\.com|youtu\.be/i.test(url)) {
    return ["--extractor-args", "youtube:skip=age_gate"];
  }
  return null;
};

// Vorbereitung für yt-dlp Download
const buildYtDlpArgs = ({ url, format, quality, audioQuality, playlistMode, outputFolder, cookiesBrowser, impersonate, embedCoverArt }) => {
  const args = [
    "--newline",
    "--no-colors",
    "--ignore-config",
    "--retries",
    "10",
    "--fragment-retries",
    "10",
    "--concurrent-fragments",
    "4",
    "--paths",
    outputFolder,
    "--output",
    "%(title).180B.%(ext)s",
    "--progress-template",
    "download:%(progress._percent_str)s|%(progress._downloaded_bytes_str)s|%(progress._total_bytes_str)s|%(progress._speed_str)s|%(progress._eta_str)s"
  ];

  if (format === "mp3") {
    args.push(
      "--format",
      "bestaudio/best",
      "--extract-audio",
      "--audio-format",
      "mp3",
      "--audio-quality",
      audioQuality && audioQuality !== "undefined" ? audioQuality : "0"
    );
    // Video-Thumbnail als Cover-Art in die MP3 (ID3 APIC) einbetten, wenn gewünscht.
    if (embedCoverArt) {
      args.push("--embed-thumbnail");
    }
  } else if (format === "audio-raw") {
    // Nur für die interne Whisper-Vorbereitung: bestes Audio ohne ffmpeg-Reencode.
    // Whisper sampelt intern ohnehin auf 16 kHz Mono herunter, ein MP3-Reencode
    // mit Bestqualität davor kostet nur Zeit ohne jeden Nutzen.
    args.push("--format", "bestaudio/best");
  } else {
    // Robuste Format-Auswahl mit mehreren Fallbacks (durch "/" getrennt), damit
    // möglichst viele Seiten klappen – auch solche ohne getrennte Video/Audio-
    // Streams oder ohne height-Angabe (Pornhub, GayForFans, generischer Extractor):
    //   1. bestes Video ≤ Wunschhöhe + bestes Audio (getrennte Streams)
    //   2. bestes Einzelformat ≤ Wunschhöhe (progressiv)
    //   3. bestes Video + bestes Audio ohne Höhenlimit
    //   4. irgendein bestes Format ("best" / "b")
    let formatString = "bestvideo*+bestaudio/best";
    if (quality && quality !== "best" && quality !== "undefined") {
      formatString = `bestvideo*[height<=${quality}]+bestaudio/best[height<=${quality}]/bestvideo*+bestaudio/best`;
    }
    args.push(
      "--format",
      formatString,
      "--merge-output-format",
      "mp4"
    );
    // --embed-chapters bettet Kapitelmarken ein, wo die Seite sie liefert
    // (z. B. YouTube-Kapitel, Twitch-VOD-Marker) – no-op sonst, kostet nichts.
    args.push("--embed-subs", "--embed-metadata", "--embed-chapters");
    // Video-Thumbnail als Cover-Art einbetten (attached-pic Stream im MP4),
    // genau wie bei MP3 – dieselbe Einstellung gilt für beide Formate.
    if (embedCoverArt) {
      args.push("--embed-thumbnail");
    }
  }

  if (playlistMode === "single-video") {
    args.push("--no-playlist");
  }

  if (playlistMode === "playlist-combined") {
    args.push("--yes-playlist", "--concat-playlist", "always");
  }

  if (playlistMode === "playlist-items") {
    args.push("--yes-playlist");
  }

  // Generische Hebel für breite Seiten-Kompatibilität:
  // - Browser-Impersonation ahmt einen echten Browser nach (TLS/HTTP2-Fingerprint)
  //   und umgeht damit Anti-Bot/Cloudflare-Blocks (403/410/429 …) auf vielen Seiten.
  // - Cookies aus dem Browser schalten Login-/Altersschranken frei.
  if (impersonate) {
    args.push("--impersonate", "chrome");
  }
  if (cookiesBrowser && cookiesBrowser !== "none") {
    args.push("--cookies-from-browser", cookiesBrowser);
  }

  args.push(url);
  return args;
};

const getYtDlpCandidates = () => [
  { command: "yt-dlp", argsPrefix: [] },
  { command: "python", argsPrefix: ["-m", "yt_dlp"] },
  { command: "python3", argsPrefix: ["-m", "yt_dlp"] },
  { command: "py", argsPrefix: ["-m", "yt_dlp"] }
];

// Prüft, ob ein Kommando vorhanden ist; gibt die Versionsausgabe (string) oder null zurück.
const checkCommand = (command, args, env) => new Promise((resolve) => {
  try {
    const child = spawn(command, args, { windowsHide: true, env: env || process.env });
    let out = "";
    if (child.stdout) child.stdout.on("data", (d) => { out += d.toString(); });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 ? (out.trim() || "ok") : null));
  } catch {
    resolve(null);
  }
});

// yt-dlp- und ffmpeg-Verfügbarkeit ermitteln (Ergebnis wird gecacht).
let depStatusCache = null;
const getDependencyStatus = async () => {
  if (depStatusCache) return depStatusCache;
  let ytDlp = null;
  for (const c of getYtDlpCandidates()) {
    const v = await checkCommand(c.command, [...c.argsPrefix, "--version"]);
    if (v) {
      ytDlp = { command: c.command, argsPrefix: c.argsPrefix, version: String(v).split(/\r?\n/)[0] };
      break;
    }
  }
  const ffmpeg = await checkCommand("ffmpeg", ["-version"]);
  // Impersonation verfügbar, wenn yt-dlp echte Targets auflistet (braucht curl_cffi).
  let impersonate = null;
  if (ytDlp) {
    impersonate = await checkCommand(ytDlp.command, [...ytDlp.argsPrefix, "--list-impersonate-targets"]);
  }
  depStatusCache = {
    ytDlpAvailable: !!ytDlp,
    ytDlpVersion: ytDlp ? ytDlp.version : null,
    ffmpegAvailable: !!ffmpeg,
    impersonateAvailable: !!impersonate && /chrome|edge|safari|firefox/i.test(impersonate)
  };
  return depStatusCache;
};

const parseProgressLine = (line) => {
  const percentMatch = line.match(/(\d+(?:\.\d+)?)%/);
  if (!percentMatch) {
    return null;
  }

  const parts = line.split("|").map((part) => part.trim());
  return {
    percent: Number.parseFloat(percentMatch[1]),
    downloaded: parts[1] || "",
    total: parts[2] || "",
    speed: parts[3] || "",
    eta: parts[4] || ""
  };
};

// Startet headless Chromium via Playwright, lauscht auf Netzwerk-Responses und
// gibt die erste gefundene Media-URL (.m3u8 / .mp4 / .ts) zurück, oder null.
// Wirft mit .code PLAYWRIGHT_MISSING / PLAYWRIGHT_CHROMIUM_MISSING bei fehlendem Setup.
const findStreamWithPlaywright = async (url, sendLog) => {
  let pw;
  try {
    pw = require("playwright");
  } catch {
    throw Object.assign(
      new Error("Playwright nicht installiert. Bitte ausführen: npm install playwright && npx playwright install chromium"),
      { code: "PLAYWRIGHT_MISSING" }
    );
  }

  let browser;
  try {
    browser = await pw.chromium.launch({ headless: true });
  } catch (err) {
    if (/executable|not found|ENOENT/i.test(err.message)) {
      throw Object.assign(
        new Error("Playwright Chromium nicht gefunden. Bitte ausführen: npx playwright install chromium"),
        { code: "PLAYWRIGHT_CHROMIUM_MISSING" }
      );
    }
    throw err;
  }

  const page = await browser.newPage();
  const mediaUrls = new Set();

  page.on("response", (res) => {
    const u = res.url();
    if (/\.m3u8(\?|$)|\.mp4(\?|$)|\.ts(\?|$)|\/manifest\b/i.test(u)) {
      mediaUrls.add(u);
    }
  });

  try {
    sendLog("Playwright: lade Seite in headless Chromium …");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3_000);

    if (mediaUrls.size === 0) {
      sendLog("Playwright: kein Stream nach Laden – versuche Play-Klick …");
      try {
        const playEl = await page.$(
          'video, [aria-label*="play" i], [class*="play-btn" i], button[class*="play" i]'
        );
        if (playEl) {
          await playEl.click();
          await page.waitForTimeout(5_000);
        }
      } catch { /* kein Play-Element – weiter */ }
    }

    // .m3u8 (HLS) bevorzugen, dann .mp4, dann Rest
    const sorted = [...mediaUrls].sort((a, b) => {
      const score = (u) => (u.includes(".m3u8") ? 2 : u.includes(".mp4") ? 1 : 0);
      return score(b) - score(a);
    });
    return sorted[0] || null;
  } finally {
    await browser.close();
  }
};

// Zieldatei aus einer yt-dlp-Logzeile ermitteln (voller, von --paths aufgelöster
// Pfad) – für den "Löschen"-Button im Verlauf, damit die richtige Datei entfernt wird.
const parseDestinationFromLine = (line) => {
  let match = line.match(/Merging formats into "(.+?)"/);
  if (!match) match = line.match(/Destination:\s*(.+)$/);
  if (!match) match = line.match(/\[download\]\s+(.+?) has already been downloaded/);
  return match ? match[1].trim() : null;
};

const runDownloadWithCandidate = (candidate, options, runOpts = {}) => new Promise((resolve, reject) => {
  const args = [
    ...candidate.argsPrefix,
    ...buildYtDlpArgs({ ...options, impersonate: runOpts.impersonate }),
    ...(runOpts.extraArgs || [])
  ];
  // Encoding: standardmäßig UTF-8 erzwingen, damit Umlaute (ü, ä, ö …) und
  // andere Unicode-Zeichen im Dateinamen nicht zu "?" werden. Python nutzt
  // sonst auf Windows die System-Codepage. "system" lässt die Umgebung unberührt.
  const env = { ...process.env };
  if (options.encoding && options.encoding !== "system") {
    env.PYTHONIOENCODING = options.encoding;
    // PYTHONUTF8=1 erzwingt UTF-8 unabhängig von PYTHONIOENCODING – daher nur
    // bei utf-8 setzen und sonst explizit deaktivieren, sonst greift ein global
    // gesetztes PYTHONUTF8=1 und der gewählte Codec würde ignoriert.
    env.PYTHONUTF8 = options.encoding === "utf-8" ? "1" : "0";
  }
  const child = spawn(candidate.command, args, {
    windowsHide: true,
    env
  });

  activeDownload = child;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  // Letzte echte yt-dlp-Fehlerzeile merken, um sie statt "Code N" anzuzeigen.
  let lastErrorLine = "";
  // Letzte erkannte Zieldatei merken – für den "Löschen"-Button im Verlauf.
  let lastDestination = null;

  const handleOutput = (data) => {
    const lines = data.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const progress = parseProgressLine(line);
      if (progress) {
        sendToRenderer("download:progress", progress);
      } else {
        if (/^ERROR:|^\s*ERROR:|Unsupported URL|is not available|Unable to|HTTP Error/i.test(line)) {
          lastErrorLine = line.replace(/^ERROR:\s*/i, "").trim();
        }
        const dest = parseDestinationFromLine(line);
        if (dest) lastDestination = dest;
        sendToRenderer("download:log", line);
      }
    }
  };

  child.stdout.on("data", handleOutput);
  child.stderr.on("data", handleOutput);

  child.on("error", (error) => {
    if (error.code === "ENOENT") {
      reject(Object.assign(new Error(`${candidate.command} wurde nicht gefunden.`), { code: "ENOENT" }));
      return;
    }
    reject(error);
  });

  child.on("close", (code) => {
    activeDownload = null;
    if (code === 0) {
      resolve(lastDestination);
      return;
    }
    reject(new Error(lastErrorLine || `yt-dlp wurde mit Code ${code} beendet.`));
  });
});

// Ermittelt die Thumbnail-URL des Videos über yt-dlp-Metadaten (%(thumbnail)s) –
// für die Cover-Bild-Anzeige im Verlauf, wenn "Cover-Bild: Thumbnail" aktiv ist.
const getThumbnailUrl = (candidate, url, cookiesBrowser, impersonate) => new Promise((resolve) => {
  const args = [...candidate.argsPrefix, "--skip-download", "--no-playlist", "--print", "%(thumbnail)s"];
  if (impersonate) args.push("--impersonate", "chrome");
  if (cookiesBrowser && cookiesBrowser !== "none") args.push("--cookies-from-browser", cookiesBrowser);
  args.push(url);
  try {
    const child = spawn(candidate.command, args, { windowsHide: true });
    let out = "";
    if (child.stdout) child.stdout.on("data", (d) => { out += d.toString(); });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const line = out.trim().split(/\r?\n/)[0].trim();
      if (!line || /^na$/i.test(line) || line.toLowerCase() === "none") return resolve(null);
      resolve(line);
    });
  } catch {
    resolve(null);
  }
});

// ============================================
// Podcast: RSS-Feed einlesen, Episoden mit direktem Audio-Link zurückgeben.
// Der eigentliche Download läuft danach über dieselbe MP3-Pipeline wie bei
// YouTube & Co. – yt-dlps generischer Extractor lädt direkt verlinkte
// Audiodateien (das "enclosure"-Attribut jeder Episode) genauso wie jede
// andere URL, kein separater Downloader nötig.
// ============================================

// Regex-basiert statt mit einem XML-Parser, um keine zusätzliche Abhängigkeit
// zu brauchen – Podcast-RSS ist strukturell einfach genug (ein <item> pro
// Episode, ein <enclosure url="…">) dass das robust genug funktioniert.
const decodeXmlEntities = (s) => String(s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"").replace(/&#0?39;/g, "'")
  .trim();

const extractTag = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? decodeXmlEntities(m[1]) : null;
};

// Begrenzung gegen versehentliches Queuen riesiger Feeds (manche haben 1000+ Folgen).
// Höher als früher, damit die Folgenauswahl im UI auch bei Feeds mit langem
// Archiv (mehrere hundert Episoden) die komplette Liste anzeigen kann.
const MAX_PODCAST_EPISODES = 300;

const resolvePodcastFeed = async (url) => {
  let res;
  try {
    res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  } catch {
    throw new Error("Podcast-Feed nicht erreichbar. Internetverbindung/URL prüfen.");
  }
  if (!res.ok) throw new Error(`Podcast-Feed konnte nicht geladen werden (${res.status}).`);
  const xml = await res.text();

  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  if (itemBlocks.length === 0) {
    throw new Error("Kein gültiger Podcast-RSS-Feed (keine Episoden gefunden).");
  }

  const episodes = [];
  for (const block of itemBlocks) {
    if (episodes.length >= MAX_PODCAST_EPISODES) break;
    const title = extractTag(block, "title");
    const enclosureMatch = block.match(/<enclosure[^>]*\surl=["']([^"']+)["'][^>]*>/i);
    const audioUrl = enclosureMatch ? decodeXmlEntities(enclosureMatch[1]) : null;
    if (!title || !audioUrl) continue;
    episodes.push({ title, audioUrl, pubDate: extractTag(block, "pubDate") });
  }
  if (episodes.length === 0) {
    throw new Error("Keine Episoden mit direktem Audio-Link gefunden.");
  }
  return episodes;
};

// Sendet "download:completed" – holt bei MP3/MP4 + aktiviertem Cover-Bild-
// Setting zusätzlich die Thumbnail-URL für die Anzeige im Verlauf (best effort).
const sendDownloadCompleted = async (normalized, filePath, candidate, deps) => {
  let thumbnailUrl = null;
  if ((normalized.format === "mp3" || normalized.format === "mp4") && normalized.embedCoverArt && candidate) {
    thumbnailUrl = await getThumbnailUrl(candidate, normalized.url, normalized.cookiesBrowser, deps && deps.impersonateAvailable);
  }
  sendToRenderer("download:completed", { outputFolder: normalized.outputFolder, filePath, thumbnailUrl });
};

// ============================================
// Transkript: Untertitel-Extraktion + Whisper-Fallback
// ============================================

// openai-whisper liefert KEIN `python -m whisper` (kein __main__), aber das
// Console-Script `whisper` und den CLI-Entrypoint `whisper.transcribe:cli`.
// Primär das Script (liegt nach pip-Install im PATH), als Fallback der direkte
// CLI-Aufruf über den jeweiligen Python (falls das Scripts-Verzeichnis fehlt).
const WHISPER_CLI_SNIPPET = "from whisper.transcribe import cli; cli()";
const getWhisperCandidates = () => [
  { command: "whisper", argsPrefix: [] },
  { command: "python", argsPrefix: ["-c", WHISPER_CLI_SNIPPET] },
  { command: "py", argsPrefix: ["-c", WHISPER_CLI_SNIPPET] },
  { command: "python3", argsPrefix: ["-c", WHISPER_CLI_SNIPPET] }
];

// UTF-8 erzwingen: ohne PYTHONUTF8=1 stürzt schon `whisper --help` auf der
// Windows-Konsole (cp1252) ab, weil der Hilfetext Nicht-Latin-Zeichen enthält.
const WHISPER_ENV = { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" };

// Erste verfügbare Whisper-Variante finden – bewusst lazy (erst wenn gebraucht),
// weil `whisper --help` torch importiert und das mehrere Sekunden dauern kann.
const findWhisper = async () => {
  for (const c of getWhisperCandidates()) {
    const ok = await checkCommand(c.command, [...c.argsPrefix, "--help"], WHISPER_ENV);
    if (ok) return c;
  }
  return null;
};

// Standard-Sprachprioritäten, wenn der Nutzer "auto" wählt.
const SUB_LANG_PRIORITY = ["en", "de", "es", "fr", "it", "pt", "nl", "ja", "ko", "ru"];
const resolveSubLangs = (lang) => {
  if (!lang || lang === "auto") return SUB_LANG_PRIORITY.map((c) => `${c}.*`).join(",");
  if (lang === "all") return "all,-live_chat";
  return `${lang}.*`;
};
// Whisper bekommt nur eine konkrete Sprache; bei auto/all selbst erkennen lassen.
const resolveWhisperLang = (lang) => (!lang || lang === "auto" || lang === "all") ? null : lang;

// Ermittelt die tatsächliche Videosprache über yt-dlp-Metadaten (%(language)s).
// Wichtig für "auto": YouTube bietet für praktisch jedes Video automatische
// Untertitel in ~150 Sprachen an – das sind aber fast immer Maschinen-
// übersetzungen der einen echten Original-Tonspur, keine eigenständigen
// Transkripte. Ohne diese Erkennung würde die alte Prioritätsliste (en, de, …)
// fast immer die englische Übersetzung statt der Originalsprache liefern.
const detectVideoLanguage = (candidate, url, cookiesBrowser, impersonate) => new Promise((resolve) => {
  const args = [...candidate.argsPrefix, "--skip-download", "--no-playlist", "--print", "%(language)s"];
  if (impersonate) args.push("--impersonate", "chrome");
  if (cookiesBrowser && cookiesBrowser !== "none") args.push("--cookies-from-browser", cookiesBrowser);
  args.push(url);
  try {
    const child = spawn(candidate.command, args, { windowsHide: true });
    let out = "";
    if (child.stdout) child.stdout.on("data", (d) => { out += d.toString(); });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const line = out.trim().split(/\r?\n/)[0].trim();
      if (!line || /^na$/i.test(line) || line.toLowerCase() === "none") return resolve(null);
      resolve(line.split(/[-_]/)[0].toLowerCase());
    });
  } catch {
    resolve(null);
  }
});

const buildSubtitleArgs = ({ url, subLangs, outputFolder, cookiesBrowser, impersonate }) => {
  const args = [
    "--newline",
    "--no-colors",
    "--ignore-config",
    "--no-playlist",
    "--skip-download",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs",
    subLangs,
    "--sub-format",
    "vtt/srt/best",
    "--paths",
    outputFolder,
    "--output",
    "%(title).180B.%(ext)s"
  ];
  if (impersonate) args.push("--impersonate", "chrome");
  if (cookiesBrowser && cookiesBrowser !== "none") args.push("--cookies-from-browser", cookiesBrowser);
  args.push(url);
  return args;
};

// VTT/SRT → reiner Text: WEBVTT-Header, Zeitstempel, Cue-Nummern, Inline-Tags und
// direkte Wiederholungen (typisch bei rollenden Auto-Captions) entfernen.
const subtitleToText = (raw) => {
  const out = [];
  let last = "";
  for (let line of raw.split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    if (/^WEBVTT/.test(line)) continue;
    if (/^(NOTE|Kind:|Language:|STYLE|REGION)/.test(line)) continue;
    if (line.includes("-->")) continue;       // Zeitstempelzeile
    if (/^\d+$/.test(line)) continue;          // SRT Cue-Nummer
    line = line
      .replace(/<[^>]+>/g, "")                  // <00:00:00.000>, <c>…</c>
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
    if (!line || line === last) continue;
    out.push(line);
    last = line;
  }
  return out.join("\n");
};

// Aus den von yt-dlp geschriebenen Untertiteldateien die passende nach
// Sprachpriorität wählen (existierende Dateien bevorzugt).
const pickSubtitleFile = (files, lang) => {
  if (!files || files.length === 0) return null;
  const existing = files.filter((f) => { try { return fs.existsSync(f); } catch { return false; } });
  const list = existing.length ? existing : files;
  const langHit = (code) => list.find((f) => new RegExp(`\\.${code}(?:[-.]|$)`, "i").test(path.basename(f)));
  if (lang && lang !== "auto" && lang !== "all") {
    const pref = langHit(lang);
    if (pref) return pref;
  } else if (lang === "auto") {
    for (const code of SUB_LANG_PRIORITY) {
      const hit = langHit(code);
      if (hit) return hit;
    }
  }
  return list[0];
};

// Einzige Audiodatei im temporären Ordner finden (Ergebnis des Audio-Downloads).
const findAudioFile = (dir) => {
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return null; }
  const audio = entries.filter((f) => /\.(mp3|m4a|opus|webm|aac|wav|ogg|flac)$/i.test(f));
  return audio.length ? path.join(dir, audio[0]) : null;
};

// Generisches Streaming-Spawn: setzt activeDownload (für Abbruch), leitet jede
// Zeile an onLine und merkt sich die letzte echte Fehlerzeile.
const spawnStreaming = (command, args, { env, onLine } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { windowsHide: true, env: env || process.env });
  activeDownload = child;
  let lastErr = "";
  if (child.stdout) child.stdout.setEncoding("utf8");
  if (child.stderr) child.stderr.setEncoding("utf8");
  const handle = (data) => {
    for (const line of data.split(/\r?\n/)) {
      if (!line.trim()) continue;
      if (/^ERROR:|Unsupported URL|is not available|Unable to|HTTP Error/i.test(line)) {
        lastErr = line.replace(/^ERROR:\s*/i, "").trim();
      }
      if (onLine) onLine(line);
    }
  };
  if (child.stdout) child.stdout.on("data", handle);
  if (child.stderr) child.stderr.on("data", handle);
  child.on("error", (err) => {
    if (err.code === "ENOENT") {
      reject(Object.assign(new Error(`${command} wurde nicht gefunden.`), { code: "ENOENT" }));
      return;
    }
    reject(err);
  });
  child.on("close", (code) => {
    activeDownload = null;
    resolve({ code, lastErr });
  });
});

// Komplette Transkript-Pipeline. Sendet dieselben Events wie ein Download
// (download:log / download:completed / download:failed) und liefert {ok,error}.
const runTranscript = async (normalized, deps) => {
  const log = (m) => sendToRenderer("download:log", m);
  const fail = (msg) => { sendToRenderer("download:failed", msg); return { ok: false, error: msg }; };
  const env = { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" };

  // --- Stufe 1: vorhandene Untertitel / Auto-Captions holen ---
  log("[Transkript 1/2] Suche vorhandene Untertitel …");
  let ytCandidate = null;
  let subFiles = [];
  let detectedLang = null;
  for (const c of getYtDlpCandidates()) {
    subFiles = [];
    let subLangs = resolveSubLangs(normalized.lang);
    if (normalized.lang === "auto") {
      detectedLang = await detectVideoLanguage(c, normalized.url, normalized.cookiesBrowser, deps.impersonateAvailable);
      if (detectedLang) {
        log(`Erkannte Videosprache: ${detectedLang}`);
        subLangs = `${detectedLang}.*`;
      }
    }
    const args = [...c.argsPrefix, ...buildSubtitleArgs({
      url: normalized.url,
      subLangs,
      outputFolder: normalized.outputFolder,
      cookiesBrowser: normalized.cookiesBrowser,
      impersonate: deps.impersonateAvailable
    })];
    try {
      await spawnStreaming(c.command, args, {
        env,
        onLine: (line) => {
          const m = line.match(/Writing video subtitles to:\s*(.+)$/i) || line.match(/Writing subtitles to:\s*(.+)$/i);
          if (m) subFiles.push(m[1].trim());
          log(line);
        }
      });
      ytCandidate = c;
      break;
    } catch (err) {
      if (err.code === "ENOENT") continue; // nächste yt-dlp-Variante probieren
      ytCandidate = c;
      break;
    }
  }

  if (!ytCandidate) {
    return fail("yt-dlp wurde nicht gefunden. Bitte installiere yt-dlp (z. B. \"pip install yt-dlp\") und stelle sicher, dass es im PATH liegt.");
  }
  if (cancelRequested) return { ok: false };

  // Transkripte haben keine eigene Cover-Art zum Einbetten (reiner Text) – bei
  // aktiviertem Cover-Bild-Setting holen wir das Thumbnail trotzdem best effort
  // für die Vorschau im Verlauf (dieselbe Optik wie bei Video/Audio).
  const thumbnailUrl = normalized.embedCoverArt
    ? await getThumbnailUrl(ytCandidate, normalized.url, normalized.cookiesBrowser, deps.impersonateAvailable)
    : null;

  const chosen = pickSubtitleFile(subFiles, detectedLang || normalized.lang);
  if (chosen) {
    try {
      const text = subtitleToText(fs.readFileSync(chosen, "utf8"));
      if (text.trim()) {
        const txtPath = chosen.replace(/\.[^.]+$/, "") + ".txt";
        fs.writeFileSync(txtPath, text, "utf8");
        log("Untertitel gefunden – Transkript gespeichert.");
        log(`Destination: ${txtPath}`);
        sendToRenderer("download:completed", { outputFolder: normalized.outputFolder, transcriptText: text, transcriptPath: txtPath, thumbnailUrl });
        return { ok: true };
      }
    } catch (err) {
      log(`Untertitel-Datei konnte nicht gelesen werden: ${err.message}`);
    }
  }

  // --- Stufe 2: keine (passenden) Untertitel → Whisper-Transkription ---
  log("[Transkript 2/2] Keine passenden Untertitel – automatischer Whisper-Fallback …");
  const whisper = await findWhisper();
  if (!whisper) {
    return fail(
      "Keine Untertitel verfügbar und Whisper ist nicht installiert. Für die automatische " +
      "Transkription beliebiger Videos bitte Whisper installieren: pip install -U openai-whisper " +
      "(benötigt zusätzlich ffmpeg im PATH)."
    );
  }
  if (cancelRequested) return { ok: false };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ytx-trans-"));
  try {
    // Audio über die bestehende Download-Pipeline laden (liefert echten Fortschritt).
    log("Lade Audiospur für die Transkription …");
    await runDownloadWithCandidate(ytCandidate, {
      ...normalized,
      format: "audio-raw",
      outputFolder: tmpDir,
      playlistMode: "single-video"
    }, { impersonate: deps.impersonateAvailable });

    if (cancelRequested) return { ok: false };

    const audioFile = findAudioFile(tmpDir);
    if (!audioFile) throw new Error("Audiodatei nach dem Download nicht gefunden.");

    const wlang = resolveWhisperLang(normalized.lang);
    const wargs = [
      ...whisper.argsPrefix,
      audioFile,
      "--model", normalized.whisperModel,
      "--output_format", "txt",
      "--output_dir", normalized.outputFolder,
      ...(wlang ? ["--language", wlang] : [])
    ];
    log(`[Whisper] Transkribiere Audio (Modell: ${normalized.whisperModel}) – das kann je nach Länge dauern …`);
    const { code } = await spawnStreaming(whisper.command, wargs, { env, onLine: (line) => log(line) });
    if (cancelRequested) return { ok: false };
    if (code !== 0) throw new Error(`Whisper wurde mit Code ${code} beendet.`);

    const base = path.basename(audioFile).replace(/\.[^.]+$/, "");
    const outTxtPath = path.join(normalized.outputFolder, base + ".txt");
    log(`Destination: ${outTxtPath}`);
    let whisperText;
    try { whisperText = fs.readFileSync(outTxtPath, "utf8"); } catch { /* Anzeige best effort, Datei bleibt trotzdem gespeichert */ }
    sendToRenderer("download:completed", { outputFolder: normalized.outputFolder, transcriptText: whisperText, transcriptPath: outTxtPath, thumbnailUrl });
    return { ok: true };
  } catch (err) {
    if (cancelRequested) return { ok: false };
    let msg = err && err.message ? err.message : "Transkription fehlgeschlagen.";
    if (err && err.code === "ENOENT") msg = "Whisper oder yt-dlp wurde nicht gefunden.";
    return fail(msg);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Aufräumen best effort */ }
  }
};

// ============================================
// IPC Handlers - Vela App kompatibel
// ============================================

// App State
ipcMain.handle("app:get-state", async () => {
  const deps = await getDependencyStatus();
  return {
    defaultDownloadFolder: getDefaultDownloadFolder(),
    platform: process.platform,
    ...deps
  };
});

// Theme handling
ipcMain.handle("app:set-theme", (_event, theme) => {
  return { ok: true };
});

// Folder selection
ipcMain.handle("dialog:select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Download-Ordner auswählen",
    defaultPath: getDefaultDownloadFolder(),
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// Download start
ipcMain.handle("download:start", async (_event, options) => {
  if (activeDownload) {
    return { ok: false, error: "Es läuft bereits ein Download." };
  }
  cancelRequested = false;

  const normalized = {
    url: String(options.url || "").trim(),
    format: options.format === "mp3" ? "mp3" : options.format === "transcript" ? "transcript" : "mp4",
    quality: options.quality ? String(options.quality) : undefined,
    audioQuality: options.audioQuality ? String(options.audioQuality) : undefined,
    embedCoverArt: !!options.embedCoverArt,
    playlistMode: options.playlistMode || "single-video",
    outputFolder: options.outputFolder || getDefaultDownloadFolder(),
    encoding: normalizeEncoding(options.encoding),
    cookiesBrowser: ALLOWED_BROWSERS.has(options.cookiesBrowser) ? options.cookiesBrowser : "none",
    playwrightFallback: !!options.playwrightFallback,
    lang: options.lang ? String(options.lang) : "auto",
    whisperModel: normalizeWhisperModel(options.whisperModel)
  };

  if (!normalized.url) {
    return { ok: false, error: "Bitte eine URL eingeben." };
  }

  sendToRenderer("download:started", normalized);

  // Transkript läuft über eine eigene Pipeline (Untertitel + Whisper-Fallback).
  if (normalized.format === "transcript") {
    const depsT = await getDependencyStatus();
    return await runTranscript(normalized, depsT);
  }

  const deps = await getDependencyStatus();
  let lastError;
  let workingCandidate = null;

  // Stufe 1: MIT Impersonation (wenn curl_cffi verfügbar), sonst direkt ohne.
  for (const candidate of getYtDlpCandidates()) {
    try {
      sendToRenderer("download:log", `[Stufe 1/5] Starte mit ${candidate.command}${candidate.argsPrefix.length ? ` ${candidate.argsPrefix.join(" ")}` : ""}${deps.impersonateAvailable ? " (Impersonation: chrome)" : ""}`);
      const filePath = await runDownloadWithCandidate(candidate, normalized, { impersonate: deps.impersonateAvailable });
      await sendDownloadCompleted(normalized, filePath, candidate, deps);
      return { ok: true };
    } catch (error) {
      lastError = error;
      if (error.code !== "ENOENT") {
        workingCandidate = candidate;
        break;
      }
      sendToRenderer("download:log", error.message);
    }
  }

  if (workingCandidate && deps.impersonateAvailable) {
    // Stufe 2: Impersonation + domain-spezifische Age-Gate-Args (nur wenn bekannt).
    // Für Pornhub/generische Seiten gibt getAgeGateExtraArgs() null zurück → Stufe überspringen.
    const ageGateArgs = getAgeGateExtraArgs(normalized.url);
    if (ageGateArgs) {
      try {
        sendToRenderer("download:log", "[Stufe 2/5] Erneuter Versuch mit Age-Gate-Bypass …");
        const filePath = await runDownloadWithCandidate(workingCandidate, normalized, {
          impersonate: true,
          extraArgs: ageGateArgs
        });
        await sendDownloadCompleted(normalized, filePath, workingCandidate, deps);
        return { ok: true };
      } catch (error) {
        lastError = error;
      }
    }

    // Stufe 3: Fallback ohne Impersonation (für Seiten, die curl_cffi-TLS ablehnen).
    try {
      sendToRenderer("download:log", "[Stufe 3/5] Fallback: Versuch ohne Browser-Impersonation …");
      const filePath = await runDownloadWithCandidate(workingCandidate, normalized, { impersonate: false });
      await sendDownloadCompleted(normalized, filePath, workingCandidate, deps);
      return { ok: true };
    } catch (error) {
      lastError = error;
    }
  }

  // Stufe 4: Kein Extractor gefunden → Generic-Extractor erzwingen (Standard-Embeds).
  if (workingCandidate && isUnsupportedUrl(lastError && lastError.message)) {
    try {
      sendToRenderer("download:log", "[Stufe 4/5] Kein Extractor – Versuch mit Generic-Extractor …");
      const filePath = await runDownloadWithCandidate(workingCandidate, normalized, {
        impersonate: deps.impersonateAvailable,
        extraArgs: ["--force-generic-extractor"]
      });
      await sendDownloadCompleted(normalized, filePath, workingCandidate, deps);
      return { ok: true };
    } catch (error) {
      lastError = error;
    }
  }

  // Stufe 5: Playwright-Fallback für JS-gerenderte Seiten (nur wenn per Setting aktiviert).
  // Greift nur wenn Stufe 4 weiterhin "Unsupported URL" liefert — nicht bei 4xx/anderen Fehlern.
  if (workingCandidate && normalized.playwrightFallback && isUnsupportedUrl(lastError && lastError.message)) {
    sendToRenderer("download:log", "[Stufe 5/5] Playwright-Fallback: headless Browser analysiert Seite …");
    try {
      const streamUrl = await findStreamWithPlaywright(
        normalized.url,
        (msg) => sendToRenderer("download:log", msg)
      );
      if (streamUrl) {
        sendToRenderer("download:log", `Playwright: Stream-URL gefunden – übergebe an yt-dlp …`);
        const filePath = await runDownloadWithCandidate(workingCandidate, { ...normalized, url: streamUrl }, {
          impersonate: deps.impersonateAvailable
        });
        await sendDownloadCompleted(normalized, filePath, workingCandidate, deps);
        return { ok: true };
      }
      lastError = Object.assign(new Error("Kein Stream gefunden"), { code: "PLAYWRIGHT_NO_STREAM" });
    } catch (error) {
      lastError = error;
    }
  }

  let message;
  if (lastError && lastError.code === "ENOENT") {
    message = "yt-dlp wurde nicht gefunden. Bitte installiere yt-dlp (z. B. \"pip install yt-dlp\") und stelle sicher, dass es im PATH liegt.";
  } else if (lastError && lastError.code === "PLAYWRIGHT_NO_STREAM") {
    message = "Seite nicht unterstützt (JS-Rendering, kein Stream gefunden).";
  } else if (lastError && (lastError.code === "PLAYWRIGHT_MISSING" || lastError.code === "PLAYWRIGHT_CHROMIUM_MISSING")) {
    message = lastError.message; // bereits klarer Hinweis aus findStreamWithPlaywright
  } else {
    message = lastError ? lastError.message : "Unbekannter Download-Fehler.";
    if (isUnsupportedUrl(message)) {
      message = "Diese Seite wird von yt-dlp nicht unterstützt. Es wurde kein passender Extractor gefunden und der Generic-Extractor konnte kein Video erkennen.";
      if (!normalized.playwrightFallback) {
        message += " Tipp: Den Playwright-Fallback in den Einstellungen aktivieren, um JS-gerenderte Seiten zu unterstützen.";
      }
    } else {
      if (!deps.ffmpegAvailable) {
        message += " Hinweis: ffmpeg wurde nicht gefunden – für die MP4-Zusammenführung und MP3-Konvertierung ist ffmpeg zwingend erforderlich.";
      }
      if (looksLikeBlock(message) || /sign in|login|age|verify|cookies?|private|members?-only/i.test(message)) {
        message += " Tipp: yt-dlp aktualisieren (pip install -U yt-dlp). Für anti-bot-geschützte Seiten Browser-Impersonation aktivieren (curl_cffi: pip install \"yt-dlp[default]\"). Für Login-/Altersschranken in den Einstellungen die Browser-Cookies wählen.";
      }
    }
  }
  sendToRenderer("download:failed", message);
  return { ok: false, error: message };
});

// Podcast: RSS-Feed-Link → Liste von Episoden {title, audioUrl, pubDate}.
// Lädt selbst nichts herunter, nur den Feed – der Download läuft danach ganz
// normal über download:start (jede Episode ist eine eigene MP3-URL).
ipcMain.handle("podcast:resolve", async (_event, url) => {
  try {
    const episodes = await resolvePodcastFeed(url);
    return { ok: true, episodes };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : "Podcast-Feed konnte nicht gelesen werden." };
  }
});

// Download cancel
ipcMain.handle("download:cancel", () => {
  cancelRequested = true;
  if (!activeDownload) {
    return { ok: true };
  }

  activeDownload.kill();
  activeDownload = null;
  sendToRenderer("download:failed", "Download abgebrochen.");
  return { ok: true };
});

// Folder open
ipcMain.handle("folder:open", async (_event, folderPath) => {
  const target = folderPath || getDefaultDownloadFolder();
  await shell.openPath(target);
  return { ok: true };
});

// Datei mit der Standard-App des Systems öffnen (z. B. MP3 im Player,
// Transkript-TXT im Texteditor) – für Notification-Klick und Auto-Open.
ipcMain.handle("file:open", async (_event, filePath) => {
  if (!filePath || typeof filePath !== "string") {
    return { ok: false, error: "Kein Dateipfad angegeben." };
  }
  const error = await shell.openPath(filePath);
  return error ? { ok: false, error } : { ok: true };
});

// Datei löschen (Verlauf-Eintrag entfernen soll auch die echte Datei löschen).
// fs.unlink wirkt nur auf Dateien, nie auf Verzeichnisse.
ipcMain.handle("file:delete", async (_event, filePath) => {
  if (!filePath || typeof filePath !== "string") {
    return { ok: false, error: "Kein Dateipfad angegeben." };
  }
  try {
    await fs.promises.unlink(filePath);
    return { ok: true };
  } catch (err) {
    if (err.code === "ENOENT") return { ok: true }; // bereits gelöscht
    return { ok: false, error: err.message };
  }
});

// Window controls (für Vela App Titelleiste)
ipcMain.on("window:minimize", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on("window:maximize", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on("window:close", () => {
  if (mainWindow) mainWindow.close();
});
