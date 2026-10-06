const test = require("node:test");
const assert = require("node:assert/strict");

const { DirectMediaProviderResolver } = require("../src/providers/DirectMediaProviderResolver");
const { YtDlpProviderResolver } = require("../src/providers/YtDlpProviderResolver");
const { PlaywrightProviderResolver } = require("../src/providers/PlaywrightProviderResolver");
const { createProviderRegistry } = require("../src/providers");
const { createResolveContext } = require("../src/core/ResolveContext");
const { ResolveErrorCode } = require("../src/core/errors");

test("ProviderResolver-Erkennung: direkte Mediendateien", () => {
  const resolver = new DirectMediaProviderResolver();
  for (const url of [
    "https://cdn.example.com/folge1.mp3",
    "https://cdn.example.com/clip.mp4",
    "https://cdn.example.com/stream.m3u8",
    "https://cdn.example.com/stream.mpd?token=abc",
    "https://cdn.example.com/audio.m4a"
  ]) {
    assert.equal(resolver.canHandle(url), true, url);
  }
  for (const url of [
    "https://www.youtube.com/watch?v=abc",
    "https://example.com/seite.html",
    "https://example.com/",
    "kein-url-string"
  ]) {
    assert.equal(resolver.canHandle(url), false, url);
  }
});

test("direkte Medien werden zu ResolvedMedia normalisiert", async () => {
  const resolver = new DirectMediaProviderResolver();
  const media = await resolver.resolve("https://cdn.example.com/folge1.mp3");
  assert.equal(media.mediaUrl, "https://cdn.example.com/folge1.mp3");
  assert.equal(media.provider, "direct");
  assert.equal(media.formats[0].ext, "mp3");
});

test("der yt-dlp-Resolver übergibt die URL unverändert und probt nicht", async () => {
  const resolver = new YtDlpProviderResolver();
  assert.equal(resolver.canHandle("https://www.youtube.com/watch?v=abc"), true);
  const media = await resolver.resolve("https://www.youtube.com/watch?v=abc", { auth: { type: "cookies" } });
  assert.equal(media.mediaUrl, "https://www.youtube.com/watch?v=abc");
  assert.equal(media.provider, "yt-dlp");
  // Nur die Art der Auth, nie deren Inhalt.
  assert.equal(media.meta.authType, "cookies");
  assert.equal(media.meta.cookies, undefined);
});

test("die Browser-Extraktion läuft nur mit aktiviertem Schalter", async () => {
  const resolver = new PlaywrightProviderResolver({
    findStream: async () => "https://cdn.example.com/live.m3u8"
  });
  const aus = createResolveContext({ flags: { playwrightFallback: false } });
  await assert.rejects(
    () => resolver.resolve("https://example.com/video", aus),
    (err) => err.code === ResolveErrorCode.UNSUPPORTED_URL
  );

  const an = createResolveContext({ flags: { playwrightFallback: true } });
  const media = await resolver.resolve("https://example.com/video", an);
  assert.equal(media.mediaUrl, "https://cdn.example.com/live.m3u8");
  assert.equal(media.provider, "playwright");
});

test("kein Stream gefunden bleibt unterscheidbar", async () => {
  const resolver = new PlaywrightProviderResolver({ findStream: async () => null });
  const context = createResolveContext({ flags: { playwrightFallback: true } });
  await assert.rejects(
    () => resolver.resolve("https://example.com/video", context),
    (err) => {
      assert.equal(err.code, ResolveErrorCode.EXTRACTION_FAILED);
      assert.equal(err.details.reason, "PLAYWRIGHT_NO_STREAM");
      return true;
    }
  );
});

test("fehlendes Playwright-Setup wird als DEPENDENCY_MISSING gemeldet", async () => {
  const resolver = new PlaywrightProviderResolver({
    findStream: async () => {
      throw Object.assign(new Error("Playwright nicht installiert."), { code: "PLAYWRIGHT_MISSING" });
    }
  });
  const context = createResolveContext({ flags: { playwrightFallback: true } });
  await assert.rejects(
    () => resolver.resolve("https://example.com/video", context),
    (err) => {
      assert.equal(err.code, ResolveErrorCode.DEPENDENCY_MISSING);
      assert.equal(err.details.setup, "PLAYWRIGHT_MISSING");
      return true;
    }
  );
});

test("ein abgebrochener Vorgang startet keinen Browser", async () => {
  let gestartet = false;
  const resolver = new PlaywrightProviderResolver({
    findStream: async () => { gestartet = true; return null; }
  });
  const controller = new AbortController();
  controller.abort();
  const context = createResolveContext({
    flags: { playwrightFallback: true },
    signal: controller.signal
  });
  await assert.rejects(
    () => resolver.resolve("https://example.com/video", context),
    (err) => err.code === ResolveErrorCode.CANCELLED
  );
  assert.equal(gestartet, false);
});

test("Provider-Priorität: direkt vor yt-dlp vor Browser", () => {
  const registry = createProviderRegistry();
  assert.deepEqual(
    registry.match("https://cdn.example.com/folge1.mp3").map((r) => r.name),
    ["direct-media", "yt-dlp", "playwright-sniffer"]
  );
  assert.deepEqual(
    registry.match("https://www.youtube.com/watch?v=abc").map((r) => r.name),
    ["yt-dlp", "playwright-sniffer"]
  );
});
