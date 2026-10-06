const test = require("node:test");
const assert = require("node:assert/strict");

const { runDownloadCascade, buildFailureMessage } = require("../src/downloader/YtDlpDownloader");

const KANDIDATEN = [
  { command: "yt-dlp", argsPrefix: [] },
  { command: "python", argsPrefix: ["-m", "yt_dlp"] }
];

const optionen = {
  url: "https://www.youtube.com/watch?v=abc",
  format: "mp4",
  outputFolder: "C:/Downloads",
  playlistMode: "single-video",
  playwrightFallback: false
};

const mediaFuer = (url) => ({ sourceUrl: url, mediaUrl: url, provider: "yt-dlp" });

/**
 * Baut einen runDownload-Ersatz, der die Aufrufe mitschreibt und je Aufruf
 * das nächste Ergebnis aus `verlauf` liefert (Error = Wurf).
 */
const fakeRunner = (verlauf) => {
  const aufrufe = [];
  let i = 0;
  const runDownload = async (candidate, opts, runOpts) => {
    aufrufe.push({ command: candidate.command, url: opts.url, ...runOpts });
    const ergebnis = verlauf[Math.min(i++, verlauf.length - 1)];
    if (ergebnis instanceof Error) throw ergebnis;
    return ergebnis;
  };
  return { runDownload, aufrufe };
};

const fehler = (message, code) => Object.assign(new Error(message), code ? { code } : {});

test("Stufe 1: Erfolg beim ersten Kandidaten, keine weiteren Stufen", async () => {
  const { runDownload, aufrufe } = fakeRunner(["C:/Downloads/video.mp4"]);
  const logs = [];
  const result = await runDownloadCascade({
    media: mediaFuer(optionen.url),
    options: optionen,
    deps: { impersonateAvailable: true, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    log: (l) => logs.push(l)
  });

  assert.equal(result.ok, true);
  assert.equal(result.filePath, "C:/Downloads/video.mp4");
  assert.equal(result.candidate.command, "yt-dlp");
  assert.equal(aufrufe.length, 1);
  assert.equal(aufrufe[0].impersonate, true);
  assert.match(logs[0], /^\[Stufe 1\/5\] Starte mit yt-dlp \(Impersonation: chrome\)$/);
});

test("Stufe 1: fehlendes yt-dlp führt zum nächsten Kandidaten", async () => {
  const { runDownload, aufrufe } = fakeRunner([
    fehler("yt-dlp wurde nicht gefunden.", "ENOENT"),
    "C:/Downloads/video.mp4"
  ]);
  const result = await runDownloadCascade({
    media: mediaFuer(optionen.url),
    options: optionen,
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload
  });

  assert.equal(result.ok, true);
  assert.deepEqual(aufrufe.map((a) => a.command), ["yt-dlp", "python"]);
});

test("kein einziges yt-dlp gefunden: ENOENT bleibt erhalten", async () => {
  const { runDownload } = fakeRunner([fehler("nicht gefunden", "ENOENT")]);
  const result = await runDownloadCascade({
    media: mediaFuer(optionen.url),
    options: optionen,
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "ENOENT");
  assert.match(buildFailureMessage(result.error, { options: optionen, deps: {} }), /yt-dlp wurde nicht gefunden/);
});

test("Stufe 2 und 3: Age-Gate-Bypass, danach ohne Impersonation", async () => {
  const { runDownload, aufrufe } = fakeRunner([
    fehler("ERROR: Sign in to confirm your age"),
    fehler("ERROR: Sign in to confirm your age"),
    "C:/Downloads/video.mp4"
  ]);
  const logs = [];
  const result = await runDownloadCascade({
    media: mediaFuer("https://www.youtube.com/watch?v=abc"),
    options: optionen,
    deps: { impersonateAvailable: true, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    log: (l) => logs.push(l)
  });

  assert.equal(result.ok, true);
  assert.equal(aufrufe.length, 3);
  assert.deepEqual(aufrufe[1].extraArgs, ["--extractor-args", "youtube:skip=age_gate"]);
  assert.equal(aufrufe[2].impersonate, false);
  assert.ok(logs.some((l) => l.startsWith("[Stufe 2/5]")));
  assert.ok(logs.some((l) => l.startsWith("[Stufe 3/5]")));
});

test("ohne bekannten Age-Gate-Bypass wird Stufe 2 übersprungen", async () => {
  const { runDownload, aufrufe } = fakeRunner([
    fehler("HTTP Error 410: Gone"),
    "C:/Downloads/video.mp4"
  ]);
  const logs = [];
  await runDownloadCascade({
    media: mediaFuer("https://beispiel.example/video/1"),
    options: optionen,
    deps: { impersonateAvailable: true, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    log: (l) => logs.push(l)
  });

  assert.equal(aufrufe.length, 2);
  assert.ok(!logs.some((l) => l.startsWith("[Stufe 2/5]")));
  assert.ok(logs.some((l) => l.startsWith("[Stufe 3/5]")));
});

test("ohne Impersonation entfallen die Stufen 2 und 3", async () => {
  const { runDownload, aufrufe } = fakeRunner([fehler("HTTP Error 403: Forbidden")]);
  const logs = [];
  const result = await runDownloadCascade({
    media: mediaFuer("https://www.youtube.com/watch?v=abc"),
    options: optionen,
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    log: (l) => logs.push(l)
  });

  assert.equal(result.ok, false);
  assert.equal(aufrufe.length, 1);
  assert.ok(!logs.some((l) => l.startsWith("[Stufe 2/5]") || l.startsWith("[Stufe 3/5]")));
});

test("Stufe 4 greift nur bei Unsupported URL", async () => {
  const { runDownload, aufrufe } = fakeRunner([
    fehler("ERROR: Unsupported URL: https://beispiel.example/video/1"),
    fehler("ERROR: Unsupported URL: https://beispiel.example/video/1"),
    "C:/Downloads/video.mp4"
  ]);
  const logs = [];
  const result = await runDownloadCascade({
    media: mediaFuer("https://beispiel.example/video/1"),
    options: optionen,
    deps: { impersonateAvailable: true, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    log: (l) => logs.push(l)
  });

  assert.equal(result.ok, true);
  assert.deepEqual(aufrufe[2].extraArgs, ["--force-generic-extractor"]);
  assert.ok(logs.some((l) => l.startsWith("[Stufe 4/5]")));
});

test("Stufe 5 nutzt die aufgelöste Stream-URL", async () => {
  const nichtUnterstuetzt = fehler("ERROR: Unsupported URL: https://beispiel.example/video/1");
  const { runDownload, aufrufe } = fakeRunner([
    nichtUnterstuetzt, nichtUnterstuetzt, nichtUnterstuetzt, "C:/Downloads/video.mp4"
  ]);
  const logs = [];
  const result = await runDownloadCascade({
    media: mediaFuer("https://beispiel.example/video/1"),
    options: { ...optionen, playwrightFallback: true },
    deps: { impersonateAvailable: true, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    resolveStream: async () => ({
      sourceUrl: "https://beispiel.example/video/1",
      mediaUrl: "https://cdn.beispiel.example/stream.m3u8",
      provider: "playwright"
    }),
    log: (l) => logs.push(l)
  });

  assert.equal(result.ok, true);
  assert.equal(aufrufe[3].url, "https://cdn.beispiel.example/stream.m3u8");
  assert.ok(logs.some((l) => l.startsWith("[Stufe 5/5]")));
});

test("Stufe 5 bleibt aus, wenn der Fallback nicht aktiviert ist", async () => {
  let gefragt = false;
  const { runDownload } = fakeRunner([fehler("ERROR: Unsupported URL: x")]);
  const result = await runDownloadCascade({
    media: mediaFuer("https://beispiel.example/video/1"),
    options: { ...optionen, playwrightFallback: false },
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    resolveStream: async () => { gefragt = true; return null; }
  });

  assert.equal(result.ok, false);
  assert.equal(gefragt, false);
});

test("kein Stream gefunden ergibt die passende Meldung", async () => {
  const nichtUnterstuetzt = fehler("ERROR: Unsupported URL: x");
  const { runDownload } = fakeRunner([nichtUnterstuetzt]);
  const result = await runDownloadCascade({
    media: mediaFuer("https://beispiel.example/video/1"),
    options: { ...optionen, playwrightFallback: true },
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    resolveStream: async () => null
  });

  assert.equal(result.ok, false);
  assert.equal(
    buildFailureMessage(result.error, { options: optionen, deps: {} }),
    "Seite nicht unterstützt (JS-Rendering, kein Stream gefunden)."
  );
});

test("Fehlermeldung: nicht unterstützte Seite mit Hinweis auf den Fallback", () => {
  const message = buildFailureMessage(fehler("ERROR: Unsupported URL: x"), {
    options: { playwrightFallback: false },
    deps: { ffmpegAvailable: true }
  });
  assert.match(message, /wird von yt-dlp nicht unterstützt/);
  assert.match(message, /Playwright-Fallback in den Einstellungen aktivieren/);

  const ohneHinweis = buildFailureMessage(fehler("ERROR: Unsupported URL: x"), {
    options: { playwrightFallback: true },
    deps: { ffmpegAvailable: true }
  });
  assert.doesNotMatch(ohneHinweis, /Playwright-Fallback in den Einstellungen/);
});

test("Fehlermeldung: fehlendes ffmpeg und Block-Tipps", () => {
  const message = buildFailureMessage(fehler("HTTP Error 403: Forbidden"), {
    options: { playwrightFallback: false },
    deps: { ffmpegAvailable: false }
  });
  assert.match(message, /ffmpeg wurde nicht gefunden/);
  assert.match(message, /Browser-Impersonation aktivieren/);
});

test("Fehlermeldung: Playwright-Setupfehler wird durchgereicht", () => {
  const setupFehler = Object.assign(new Error("Playwright nicht installiert. Bitte ausführen: npm install playwright"), {
    code: "EXTRACTION_FAILED",
    details: { setup: "PLAYWRIGHT_MISSING" }
  });
  assert.equal(
    buildFailureMessage(setupFehler, { options: {}, deps: {} }),
    "Playwright nicht installiert. Bitte ausführen: npm install playwright"
  );
});

test("Stufe 5 läuft auch, wenn Stufe 4 mit einer anderen Meldung scheitert", async () => {
  // Genau der Fall aus der Praxis: Stufe 4 findet ein eingebettetes Video und
  // scheitert daran, die Meldung hat mit "Unsupported URL" nichts mehr zu tun.
  // Trotzdem muss die Browser-Stufe noch drankommen.
  let aufruf = 0;
  const aufrufe = [];
  const result = await runDownloadCascade({
    media: mediaFuer("https://beispiel.example/video/1"),
    options: { ...optionen, playwrightFallback: true },
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload: async (_c, opts, runOpts) => {
      aufrufe.push({ url: opts.url, ...runOpts });
      aufruf++;
      if (aufruf === 1) throw fehler("ERROR: Unsupported URL: https://beispiel.example/video/1");
      if (aufruf === 2) throw fehler("[youtube] Su1LOpjvdZ4: This video is not available");
      return "C:/Downloads/video.mp4";
    },
    resolveStream: async () => ({
      sourceUrl: "https://beispiel.example/video/1",
      mediaUrl: "https://cdn.beispiel.example/stream.m3u8"
    })
  });

  assert.equal(result.ok, true);
  assert.equal(aufrufe.length, 3);
  assert.deepEqual(aufrufe[1].extraArgs, ["--force-generic-extractor"]);
  assert.equal(aufrufe[2].url, "https://cdn.beispiel.example/stream.m3u8");
});

test("ohne Hinweis auf einen fehlenden Extractor bleiben Stufe 4 und 5 aus", async () => {
  let gefragt = false;
  const { runDownload, aufrufe } = fakeRunner([fehler("HTTP Error 403: Forbidden")]);
  const result = await runDownloadCascade({
    media: mediaFuer("https://beispiel.example/video/1"),
    options: { ...optionen, playwrightFallback: true },
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload,
    resolveStream: async () => { gefragt = true; return null; }
  });

  assert.equal(result.ok, false);
  assert.equal(aufrufe.length, 1);
  assert.equal(gefragt, false);
});

test("ein Abbruch stoppt die Kaskade, statt die nächste Stufe zu starten", async () => {
  let abgebrochen = false;
  const aufrufe = [];
  const result = await runDownloadCascade({
    media: mediaFuer("https://www.youtube.com/watch?v=abc"),
    options: optionen,
    deps: { impersonateAvailable: true, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload: async (_c, opts) => {
      aufrufe.push(opts.url);
      abgebrochen = true; // der Nutzer klickt während des Downloads auf Abbrechen
      throw fehler("yt-dlp wurde mit Code 1 beendet.");
    },
    isCancelled: () => abgebrochen
  });

  assert.equal(result.ok, false);
  assert.equal(aufrufe.length, 1, "keine weitere Stufe nach dem Abbruch");
});

test("nach einem Abbruch wird kein weiterer yt-dlp-Kandidat probiert", async () => {
  let abgebrochen = false;
  const aufrufe = [];
  await runDownloadCascade({
    media: mediaFuer("https://www.youtube.com/watch?v=abc"),
    options: optionen,
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload: async (candidate) => {
      aufrufe.push(candidate.command);
      abgebrochen = true;
      throw fehler("yt-dlp wurde nicht gefunden.", "ENOENT");
    },
    isCancelled: () => abgebrochen
  });

  assert.deepEqual(aufrufe, ["yt-dlp"]);
});

test("die Downloader-Schicht nutzt die Medien-URL, nicht die Quell-URL", async () => {
  const { runDownload, aufrufe } = fakeRunner(["C:/Downloads/folge1.mp3"]);
  await runDownloadCascade({
    media: {
      sourceUrl: "https://feeds.example.com/show",
      providerUrl: "https://cdn.example.com/folge1.mp3",
      mediaUrl: "https://cdn.example.com/folge1.mp3",
      provider: "direct"
    },
    options: { ...optionen, format: "mp3" },
    deps: { impersonateAvailable: false, ffmpegAvailable: true },
    candidates: KANDIDATEN,
    runDownload
  });

  assert.equal(aufrufe[0].url, "https://cdn.example.com/folge1.mp3");
});
