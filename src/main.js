const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");

let mainWindow;
let activeDownload = null;

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
const buildYtDlpArgs = ({ url, format, quality, audioQuality, playlistMode, outputFolder, cookiesBrowser, impersonate }) => {
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
    args.push("--embed-subs", "--embed-metadata");
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
const checkCommand = (command, args) => new Promise((resolve) => {
  try {
    const child = spawn(command, args, { windowsHide: true });
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
      resolve();
      return;
    }
    reject(new Error(lastErrorLine || `yt-dlp wurde mit Code ${code} beendet.`));
  });
});

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

  const normalized = {
    url: String(options.url || "").trim(),
    format: options.format === "mp3" ? "mp3" : "mp4",
    quality: options.quality ? String(options.quality) : undefined,
    audioQuality: options.audioQuality ? String(options.audioQuality) : undefined,
    playlistMode: options.playlistMode || "single-video",
    outputFolder: options.outputFolder || getDefaultDownloadFolder(),
    encoding: normalizeEncoding(options.encoding),
    cookiesBrowser: ALLOWED_BROWSERS.has(options.cookiesBrowser) ? options.cookiesBrowser : "none",
    playwrightFallback: !!options.playwrightFallback
  };

  if (!normalized.url) {
    return { ok: false, error: "Bitte eine URL eingeben." };
  }

  sendToRenderer("download:started", normalized);

  const deps = await getDependencyStatus();
  let lastError;
  let workingCandidate = null;

  // Stufe 1: MIT Impersonation (wenn curl_cffi verfügbar), sonst direkt ohne.
  for (const candidate of getYtDlpCandidates()) {
    try {
      sendToRenderer("download:log", `[Stufe 1/5] Starte mit ${candidate.command}${candidate.argsPrefix.length ? ` ${candidate.argsPrefix.join(" ")}` : ""}${deps.impersonateAvailable ? " (Impersonation: chrome)" : ""}`);
      await runDownloadWithCandidate(candidate, normalized, { impersonate: deps.impersonateAvailable });
      sendToRenderer("download:completed", { outputFolder: normalized.outputFolder });
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
        await runDownloadWithCandidate(workingCandidate, normalized, {
          impersonate: true,
          extraArgs: ageGateArgs
        });
        sendToRenderer("download:completed", { outputFolder: normalized.outputFolder });
        return { ok: true };
      } catch (error) {
        lastError = error;
      }
    }

    // Stufe 3: Fallback ohne Impersonation (für Seiten, die curl_cffi-TLS ablehnen).
    try {
      sendToRenderer("download:log", "[Stufe 3/5] Fallback: Versuch ohne Browser-Impersonation …");
      await runDownloadWithCandidate(workingCandidate, normalized, { impersonate: false });
      sendToRenderer("download:completed", { outputFolder: normalized.outputFolder });
      return { ok: true };
    } catch (error) {
      lastError = error;
    }
  }

  // Stufe 4: Kein Extractor gefunden → Generic-Extractor erzwingen (Standard-Embeds).
  if (workingCandidate && isUnsupportedUrl(lastError && lastError.message)) {
    try {
      sendToRenderer("download:log", "[Stufe 4/5] Kein Extractor – Versuch mit Generic-Extractor …");
      await runDownloadWithCandidate(workingCandidate, normalized, {
        impersonate: deps.impersonateAvailable,
        extraArgs: ["--force-generic-extractor"]
      });
      sendToRenderer("download:completed", { outputFolder: normalized.outputFolder });
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
        await runDownloadWithCandidate(workingCandidate, { ...normalized, url: streamUrl }, {
          impersonate: deps.impersonateAvailable
        });
        sendToRenderer("download:completed", { outputFolder: normalized.outputFolder });
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

// Download cancel
ipcMain.handle("download:cancel", () => {
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
