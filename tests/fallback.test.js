const test = require("node:test");
const assert = require("node:assert/strict");

const { FallbackManager } = require("../src/core/FallbackManager");
const { ResolveError, ResolveErrorCode } = require("../src/core/errors");
const { createLogger } = require("../src/core/logger");

const failingStage = (name, error) => ({ name, run: async () => { throw error; } });

test("die erste erfolgreiche Stufe gewinnt, spätere laufen nicht mehr", async () => {
  const calls = [];
  const fallback = new FallbackManager();
  const result = await fallback.run([
    { name: "primary", run: async () => { calls.push("primary"); throw new Error("Unable to download webpage"); } },
    { name: "secondary", run: async () => { calls.push("secondary"); return "ok"; } },
    { name: "browser", run: async () => { calls.push("browser"); return "zu spät"; } }
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.value, "ok");
  assert.equal(result.stage, "secondary");
  assert.deepEqual(calls, ["primary", "secondary"]);
});

test("scheitern alle Stufen, kommt der aussagekräftigste Fehler zurück", async () => {
  const fallback = new FallbackManager();
  const result = await fallback.run([
    failingStage("primary", new ResolveError(ResolveErrorCode.UNSUPPORTED_URL, "kein Extractor")),
    failingStage("secondary", new ResolveError(ResolveErrorCode.AUTH_REQUIRED, "Login nötig")),
    failingStage("browser", new ResolveError(ResolveErrorCode.EXTRACTION_FAILED, "nichts gefunden"))
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, ResolveErrorCode.AUTH_REQUIRED);
  assert.equal(result.attempts.length, 3);
  assert.deepEqual(result.attempts.map((a) => a.code), [
    ResolveErrorCode.UNSUPPORTED_URL,
    ResolveErrorCode.AUTH_REQUIRED,
    ResolveErrorCode.EXTRACTION_FAILED
  ]);
});

test("übersprungene Stufen werden mit Begründung protokolliert", async () => {
  const fallback = new FallbackManager();
  const result = await fallback.run([
    { name: "age-gate", skip: () => "kein Age-Gate-Bypass bekannt", run: async () => "nie" },
    { name: "generic", run: async () => "ok" }
  ]);

  assert.equal(result.value, "ok");
  assert.equal(result.attempts[0].skipped, true);
  assert.equal(result.attempts[0].reason, "kein Age-Gate-Bypass bekannt");
});

test("ein Abbruch stoppt die Pipeline sofort", async () => {
  const calls = [];
  const fallback = new FallbackManager();
  const result = await fallback.run([
    { name: "primary", run: async () => { calls.push("primary"); throw new ResolveError(ResolveErrorCode.CANCELLED, "Vorgang abgebrochen."); } },
    { name: "secondary", run: async () => { calls.push("secondary"); return "ok"; } }
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, ResolveErrorCode.CANCELLED);
  assert.deepEqual(calls, ["primary"]);
});

test("stopOn beendet die Pipeline nach Wunsch des Aufrufers", async () => {
  const calls = [];
  const fallback = new FallbackManager({
    stopOn: (error) => error.code === ResolveErrorCode.AUTH_REQUIRED
  });
  const result = await fallback.run([
    failingStage("primary", new ResolveError(ResolveErrorCode.AUTH_REQUIRED, "Login nötig")),
    { name: "secondary", run: async () => { calls.push("secondary"); return "ok"; } }
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(calls, []);
});

test("ein leeres Ergebnis gilt als Fehlschlag", async () => {
  const fallback = new FallbackManager();
  const result = await fallback.run([
    { name: "leer", run: async () => null },
    { name: "voll", run: async () => ["treffer"] }
  ]);
  assert.equal(result.stage, "voll");
});

test("die Stufen teilen sich einen Zustand", async () => {
  const fallback = new FallbackManager();
  const result = await fallback.run([
    { name: "eins", run: async (state) => { state.kandidat = "yt-dlp"; throw new Error("Unsupported URL"); } },
    { name: "zwei", skip: (state) => !state.kandidat, run: async (state) => state.kandidat }
  ], {});
  assert.equal(result.value, "yt-dlp");
});

test("jeder Schritt wird strukturiert geloggt", async () => {
  const lines = [];
  const logger = createLogger({ sink: (line) => lines.push(line) });
  const fallback = new FallbackManager({ logger });
  await fallback.run([
    failingStage("primary", new Error("Unsupported URL")),
    { name: "secondary", run: async () => "ok" }
  ]);

  const steps = logger.entries().map((e) => e.step);
  assert.deepEqual(steps, ["resolver-try", "resolver-fail", "resolver-try", "resolver-ok"]);
  assert.ok(lines.some((l) => l.includes("resolver=primary")));
});
