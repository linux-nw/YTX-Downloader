const test = require("node:test");
const assert = require("node:assert/strict");

const { ResolverRegistry } = require("../src/core/registry");

const stub = (name, priority, canHandle = () => true) => ({
  name,
  priority,
  canHandle,
  resolve: async () => ({ sourceUrl: "https://example.com", mediaUrl: "https://example.com/a.mp4" })
});

test("Resolver werden nach Priorität sortiert getestet", () => {
  const registry = new ResolverRegistry({ kind: "SiteResolver" });
  registry.registerAll([stub("niedrig", 1), stub("hoch", 90), stub("mittel", 50)]);
  assert.deepEqual(
    registry.match("https://example.com/x").map((r) => r.name),
    ["hoch", "mittel", "niedrig"]
  );
  assert.equal(registry.find("https://example.com/x").name, "hoch");
});

test("gleiche Priorität behält die Registrierungsreihenfolge", () => {
  const registry = new ResolverRegistry();
  registry.registerAll([stub("a", 10), stub("b", 10), stub("c", 10)]);
  assert.deepEqual(registry.list().map((r) => r.name), ["a", "b", "c"]);
});

test("nur passende Resolver werden zurückgegeben", () => {
  const registry = new ResolverRegistry();
  registry.registerAll([
    stub("podcast", 90, (url) => url.endsWith(".xml")),
    stub("generic", 1)
  ]);
  assert.deepEqual(registry.match("https://x.de/feed.xml").map((r) => r.name), ["podcast", "generic"]);
  assert.deepEqual(registry.match("https://x.de/video").map((r) => r.name), ["generic"]);
});

test("ein fehlerhaftes canHandle blockiert die anderen Resolver nicht", () => {
  const registry = new ResolverRegistry();
  const logged = [];
  registry.registerAll([
    stub("kaputt", 99, () => { throw new Error("boom"); }),
    stub("heil", 10)
  ]);
  const matches = registry.match("https://example.com", {
    logger: { step: (name, data) => logged.push({ name, ...data }) }
  });
  assert.deepEqual(matches.map((r) => r.name), ["heil"]);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].resolver, "kaputt");
});

test("Registrierung prüft die Resolver-Form", () => {
  const registry = new ResolverRegistry({ kind: "SiteResolver" });
  assert.throws(() => registry.register({}), /name/);
  assert.throws(() => registry.register({ name: "x" }), /canHandle/);
  assert.throws(() => registry.register({ name: "x", canHandle: () => true }), /resolve/);
});

test("Namen sind eindeutig", () => {
  const registry = new ResolverRegistry();
  registry.register(stub("a", 1));
  assert.throws(() => registry.register(stub("a", 2)), /bereits registriert/);
});

test("Resolver lassen sich wieder entfernen", () => {
  const registry = new ResolverRegistry();
  registry.registerAll([stub("a", 1), stub("b", 2)]);
  assert.equal(registry.unregister("a"), true);
  assert.equal(registry.unregister("a"), false);
  assert.equal(registry.size, 1);
  assert.equal(registry.get("b").name, "b");
  assert.equal(registry.get("a"), null);
});

test("describe() zeigt Namen und Prioritäten", () => {
  const registry = new ResolverRegistry();
  registry.registerAll([stub("a", 1), stub("b", 2)]);
  assert.deepEqual(registry.describe(), [
    { name: "b", priority: 2 },
    { name: "a", priority: 1 }
  ]);
});
