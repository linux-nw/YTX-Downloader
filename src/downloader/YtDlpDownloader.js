/**
 * Download-Kaskade.
 *
 * Dieselben fünf Stufen wie bisher, nur als FallbackManager-Pipeline statt
 * als verschachtelte if/try-Blöcke. Die Log-Ausgaben in der App bleiben Wort
 * für Wort gleich.
 *
 *   1. yt-dlp-Kandidaten durchprobieren (mit Impersonation, falls verfügbar)
 *   2. Age-Gate-Bypass (nur wo bekannt)
 *   3. ohne Impersonation
 *   4. Generic-Extractor erzwingen (nur bei "Unsupported URL")
 *   5. Browser-/Session-basierte Extraktion (nur wenn aktiviert)
 *
 * Die Schicht kennt ausschließlich ResolvedMedia und die Nutzeroptionen,
 * nicht die konkreten Provider.
 */

const { FallbackManager } = require("../core/FallbackManager");
const { nullLogger } = require("../core/logger");
const { downloadUrlOf } = require("../core/types");
const { isUnsupportedUrl, looksLikeBlock } = require("../core/errors");
const { getAgeGateExtraArgs } = require("./ytDlpArgs");

/**
 * Schreibt jeden Fehler in die Historie des Pipeline-Zustands.
 *
 * Bewusst die ganze Historie und nicht nur der letzte Fehler: eine Stufe kann
 * mit einer anderen Meldung scheitern als die davor. Würden die späteren
 * Stufen nur den letzten Fehler ansehen, blieben sie liegen, obwohl sie noch
 * an der Reihe wären.
 */
const track = (state, fn) => async () => {
  try {
    return await fn(state);
  } catch (err) {
    state.lastError = err;
    state.errors.push(err);
    throw err;
  }
};

const messageOf = (error) => (error && error.message) ? error.message : "";

/** Deutete irgendein bisheriger Fehler auf einen fehlenden Extractor hin? */
const sahUnsupportedUrl = (state) => state.errors.some((err) => isUnsupportedUrl(messageOf(err)));

/**
 * Führt den Download für ein aufgelöstes Medium aus.
 *
 * @param {Object} params
 * @param {Object} params.media        ResolvedMedia
 * @param {Object} params.options      Normalisierte Nutzeroptionen (Format, Qualität ...)
 * @param {Object} params.deps         { impersonateAvailable, ffmpegAvailable, ... }
 * @param {Array}  params.candidates   yt-dlp-Kandidaten [{command, argsPrefix}]
 * @param {(candidate: Object, options: Object, runOpts: Object) => Promise<string|null>} params.runDownload
 * @param {(url: string) => Promise<Object|null>} [params.resolveStream] Stufe 5
 * @param {() => boolean} [params.isCancelled] Hat der Nutzer abgebrochen?
 * @param {(line: string) => void} [params.log] Ausgabe in die App
 * @param {Object} [params.logger]     Strukturierter Logger
 * @returns {Promise<{ok: boolean, filePath?: string|null, candidate?: Object, error?: Error, stage?: string}>}
 */
const runDownloadCascade = async ({
  media,
  options,
  deps,
  candidates,
  runDownload,
  resolveStream,
  isCancelled,
  log = () => {},
  logger = nullLogger()
}) => {
  const downloadUrl = downloadUrlOf(media);
  const downloadOptions = { ...options, url: downloadUrl };
  const state = { workingCandidate: null, lastError: null, errors: [] };
  const abgebrochen = typeof isCancelled === "function" ? isCancelled : () => false;

  // Gründe, die jede Folgestufe betreffen. Nach einem Abbruch darf keine
  // weitere Stufe mehr starten, sonst lädt die App nach dem Klick auf
  // "Abbrechen" munter weiter.
  const gemeinsamerSkip = (s) => {
    if (abgebrochen()) return "Vorgang abgebrochen";
    if (!s.workingCandidate) return "kein lauffähiges yt-dlp";
    return false;
  };

  const stages = [
    {
      name: "yt-dlp",
      run: track(state, async (s) => {
        let lastError;
        for (const candidate of candidates) {
          if (abgebrochen()) break;
          log(`[Stufe 1/5] Starte mit ${candidate.command}${candidate.argsPrefix.length ? ` ${candidate.argsPrefix.join(" ")}` : ""}${deps.impersonateAvailable ? " (Impersonation: chrome)" : ""}`);
          try {
            const filePath = await runDownload(candidate, downloadOptions, { impersonate: deps.impersonateAvailable });
            return { filePath, candidate };
          } catch (error) {
            lastError = error;
            if (error.code !== "ENOENT") {
              // Kandidat läuft, der Fehler kommt von der Seite: nicht weiter
              // nach anderen yt-dlp-Installationen suchen.
              s.workingCandidate = candidate;
              throw error;
            }
            log(error.message);
          }
        }
        throw lastError || new Error("Kein yt-dlp-Kandidat verfügbar.");
      })
    },
    {
      name: "age-gate",
      skip: (s) => gemeinsamerSkip(s)
        || (!deps.impersonateAvailable && "Impersonation nicht verfügbar")
        || (!getAgeGateExtraArgs(downloadUrl) && "kein Age-Gate-Bypass für diese Seite bekannt"),
      run: track(state, async (s) => {
        log("[Stufe 2/5] Erneuter Versuch mit Age-Gate-Bypass …");
        const filePath = await runDownload(s.workingCandidate, downloadOptions, {
          impersonate: true,
          extraArgs: getAgeGateExtraArgs(downloadUrl)
        });
        return { filePath, candidate: s.workingCandidate };
      })
    },
    {
      name: "ohne-impersonation",
      skip: (s) => gemeinsamerSkip(s)
        || (!deps.impersonateAvailable && "es lief ohnehin ohne Impersonation"),
      run: track(state, async (s) => {
        log("[Stufe 3/5] Fallback: Versuch ohne Browser-Impersonation …");
        const filePath = await runDownload(s.workingCandidate, downloadOptions, { impersonate: false });
        return { filePath, candidate: s.workingCandidate };
      })
    },
    {
      name: "generic-extractor",
      skip: (s) => gemeinsamerSkip(s)
        || (!sahUnsupportedUrl(s) && "kein Fehler deutet auf einen fehlenden Extractor"),
      run: track(state, async (s) => {
        log("[Stufe 4/5] Kein Extractor – Versuch mit Generic-Extractor …");
        const filePath = await runDownload(s.workingCandidate, downloadOptions, {
          impersonate: deps.impersonateAvailable,
          extraArgs: ["--force-generic-extractor"]
        });
        return { filePath, candidate: s.workingCandidate };
      })
    },
    {
      name: "browser-session",
      skip: (s) => gemeinsamerSkip(s)
        || (typeof resolveStream !== "function" && "keine Browser-Extraktion verfügbar")
        || (!options.playwrightFallback && "Playwright-Fallback nicht aktiviert")
        || (!sahUnsupportedUrl(s) && "kein Fehler deutet auf einen fehlenden Extractor"),
      run: track(state, async (s) => {
        log("[Stufe 5/5] Playwright-Fallback: headless Browser analysiert Seite …");
        const streamMedia = await resolveStream(downloadUrl);
        const streamUrl = streamMedia ? downloadUrlOf(streamMedia) : null;
        if (!streamUrl) {
          throw Object.assign(new Error("Kein Stream gefunden"), { code: "PLAYWRIGHT_NO_STREAM" });
        }
        log("Playwright: Stream-URL gefunden – übergebe an yt-dlp …");
        const filePath = await runDownload(s.workingCandidate, { ...downloadOptions, url: streamUrl }, {
          impersonate: deps.impersonateAvailable
        });
        return { filePath, candidate: s.workingCandidate };
      })
    }
  ];

  // stopOn greift zusätzlich zu den skip-Bedingungen: bricht der Nutzer
  // mitten in einer laufenden Stufe ab, endet die Kaskade sofort.
  const fallback = new FallbackManager({ logger, stopOn: () => abgebrochen() });
  const result = await fallback.run(stages, state);

  if (result.ok) {
    return {
      ok: true,
      filePath: result.value.filePath,
      candidate: result.value.candidate,
      stage: result.stage,
      attempts: result.attempts
    };
  }

  return {
    ok: false,
    // state.lastError ist der Originalfehler (mit .code wie ENOENT), der für
    // die Meldung an den Nutzer gebraucht wird.
    error: state.lastError || result.error,
    attempts: result.attempts
  };
};

/**
 * Baut die Fehlermeldung für die UI. Unverändert übernommen, nur um die
 * strukturierten Fehler der Browser-Stufe ergänzt.
 *
 * @param {Error} lastError
 * @param {{ options: Object, deps: Object }} context
 * @returns {string}
 */
const buildFailureMessage = (lastError, { options = {}, deps = {} } = {}) => {
  const details = (lastError && lastError.details) || {};
  const code = lastError && lastError.code;

  if (code === "ENOENT") {
    return "yt-dlp wurde nicht gefunden. Bitte installiere yt-dlp (z. B. \"pip install yt-dlp\") und stelle sicher, dass es im PATH liegt.";
  }
  if (code === "PLAYWRIGHT_NO_STREAM" || details.reason === "PLAYWRIGHT_NO_STREAM") {
    return "Seite nicht unterstützt (JS-Rendering, kein Stream gefunden).";
  }
  if (code === "PLAYWRIGHT_MISSING" || code === "PLAYWRIGHT_CHROMIUM_MISSING"
    || details.setup === "PLAYWRIGHT_MISSING" || details.setup === "PLAYWRIGHT_CHROMIUM_MISSING") {
    return lastError.message; // bereits klarer Hinweis aus dem Stream-Finder
  }

  let message = lastError ? lastError.message : "Unbekannter Download-Fehler.";
  if (isUnsupportedUrl(message)) {
    message = "Diese Seite wird von yt-dlp nicht unterstützt. Es wurde kein passender Extractor gefunden und der Generic-Extractor konnte kein Video erkennen.";
    if (!options.playwrightFallback) {
      message += " Tipp: Den Playwright-Fallback in den Einstellungen aktivieren, um JS-gerenderte Seiten zu unterstützen.";
    }
    return message;
  }

  if (!deps.ffmpegAvailable) {
    message += " Hinweis: ffmpeg wurde nicht gefunden – für die MP4-Zusammenführung und MP3-Konvertierung ist ffmpeg zwingend erforderlich.";
  }
  if (looksLikeBlock(message) || /sign in|login|age|verify|cookies?|private|members?-only/i.test(message)) {
    message += " Tipp: yt-dlp aktualisieren (pip install -U yt-dlp). Für anti-bot-geschützte Seiten Browser-Impersonation aktivieren (curl_cffi: pip install \"yt-dlp[default]\"). Für Login-/Altersschranken in den Einstellungen die Browser-Cookies wählen.";
  }
  return message;
};

module.exports = { runDownloadCascade, buildFailureMessage };
