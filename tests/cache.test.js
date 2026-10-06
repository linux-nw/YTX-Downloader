const test = require("node:test");
const assert = require("node:assert/strict");

const { ResolverCache, assertCacheable } = require("../src/cache/ResolverCache");

test("Werte laufen nach der TTL ab", () => {
  let jetzt = 0;
  const cache = new ResolverCache({ ttlMs: 100, now: () => jetzt });
  cache.set("provider:https://x.de/1", { provider: "direct" });

  assert.deepEqual(cache.get("provider:https://x.de/1"), { provider: "direct" });
  jetzt = 101;
  assert.equal(cache.get("provider:https://x.de/1"), undefined);
});

test("die erkannte Zuständigkeit hält länger als das Ergebnis", () => {
  let jetzt = 0;
  const cache = new ResolverCache({ ttlMs: 100, detectionTtlMs: 10_000, now: () => jetzt });
  cache.set("provider:https://x.de/1", { provider: "direct" });
  cache.rememberDetection("site", "https://x.de/1", "podcast-rss");

  jetzt = 500;
  assert.equal(cache.get("provider:https://x.de/1"), undefined);
  assert.equal(cache.recallDetection("site", "https://x.de/1"), "podcast-rss");
});

test("Auth-Material wird nicht gecacht", () => {
  const cache = new ResolverCache();
  assert.throws(() => cache.set("k", { cookies: [{ name: "sid", value: "x" }] }), /Auth-Material/);
  assert.throws(() => cache.set("k", { meta: { token: "abc" } }), /Auth-Material/);
  assert.throws(() => cache.set("k", { a: { b: { sessionId: "s" } } }), /Auth-Material/);
  assert.doesNotThrow(() => cache.set("k", { provider: "direct", title: "Folge 1" }));
});

test("assertCacheable prüft auch Listen", () => {
  assert.throws(() => assertCacheable([{ ok: 1 }, { password: "x" }]), /Auth-Material/);
});

test("der Cache gibt Kopien heraus", () => {
  const cache = new ResolverCache();
  const original = { provider: "direct", formats: [{ ext: "mp4" }] };
  cache.set("k", original);
  const geholt = cache.get("k");
  geholt.formats[0].ext = "verändert";
  assert.equal(cache.get("k").formats[0].ext, "mp4");
});

test("der Cache begrenzt seine Größe", () => {
  const cache = new ResolverCache({ maxEntries: 3 });
  for (let i = 0; i < 5; i++) cache.set(`k${i}`, { i });
  assert.equal(cache.stats().size, 3);
  assert.equal(cache.get("k0"), undefined);
  assert.deepEqual(cache.get("k4"), { i: 4 });
});

test("Treffer und Fehlschläge werden gezählt", () => {
  const cache = new ResolverCache();
  cache.set("k", { a: 1 });
  cache.get("k");
  cache.get("weg");
  assert.deepEqual(cache.stats(), { size: 1, hits: 1, misses: 1 });
  cache.clear();
  assert.deepEqual(cache.stats(), { size: 0, hits: 0, misses: 0 });
});

test("der Schlüssel ignoriert das Fragment", () => {
  assert.equal(
    ResolverCache.keyFor("site", "https://x.de/1#t=10"),
    ResolverCache.keyFor("site", "https://x.de/1")
  );
});

test("TTL 0 speichert nichts", () => {
  const cache = new ResolverCache({ ttlMs: 0 });
  cache.set("k", { a: 1 });
  assert.equal(cache.get("k"), undefined);
});
