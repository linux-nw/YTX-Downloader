/**
 * Browser-/Session-basierte Extraktion: startet headless Chromium via
 * Playwright, lauscht auf Netzwerk-Responses und gibt die erste gefundene
 * Media-URL (.m3u8 / .mp4 / .ts) zurück, oder null.
 *
 * Unverändert aus main.js übernommen (nur Logging optional gemacht), damit
 * die letzte Fallback-Stufe sich exakt wie bisher verhält.
 *
 * Es wird ausschließlich beobachtet, was die Seite ohnehin lädt. Kein Umgehen
 * von Zugriffsschutz, keine DRM-Entschlüsselung.
 *
 * Wirft mit .code PLAYWRIGHT_MISSING / PLAYWRIGHT_CHROMIUM_MISSING bei
 * fehlendem Setup.
 */

const findStreamWithPlaywright = async (url, sendLog = () => {}) => {
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

module.exports = { findStreamWithPlaywright };
