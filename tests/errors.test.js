const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ResolveError,
  ResolveErrorCode,
  classifyMessage,
  toResolveError,
  pickMostRelevantError,
  isUnsupportedUrl,
  looksLikeBlock
} = require("../src/core/errors");

test("classifyMessage erkennt Auth-Fehler", () => {
  assert.equal(
    classifyMessage("ERROR: Sign in to confirm your age. Use --cookies-from-browser"),
    ResolveErrorCode.AUTH_REQUIRED
  );
  assert.equal(
    classifyMessage("This video is private"),
    ResolveErrorCode.AUTH_REQUIRED
  );
});

test("classifyMessage erkennt abgelaufene Sessions", () => {
  assert.equal(
    classifyMessage("The provided YouTube account cookies are no longer valid"),
    ResolveErrorCode.SESSION_EXPIRED
  );
  assert.equal(classifyMessage("HTTP Error 401: Unauthorized"), ResolveErrorCode.SESSION_EXPIRED);
});

test("classifyMessage erkennt Captcha vor Auth", () => {
  // Enthält "Sign in", ist aber ein Bot-Check.
  assert.equal(
    classifyMessage("Sign in to confirm you're not a bot"),
    ResolveErrorCode.CAPTCHA_REQUIRED
  );
});

test("classifyMessage erkennt Geo-Sperren", () => {
  assert.equal(
    classifyMessage("The uploader has not made this video available in your country"),
    ResolveErrorCode.GEO_RESTRICTED
  );
});

test("classifyMessage erkennt Netzwerkfehler", () => {
  assert.equal(classifyMessage("getaddrinfo ENOTFOUND example.com"), ResolveErrorCode.NETWORK_ERROR);
  assert.equal(classifyMessage("fetch failed"), ResolveErrorCode.NETWORK_ERROR);
});

test("classifyMessage erkennt nicht unterstützte URLs", () => {
  assert.equal(
    classifyMessage("ERROR: Unsupported URL: https://example.com/page"),
    ResolveErrorCode.UNSUPPORTED_URL
  );
});

test("classifyMessage erkennt Provider-/Blockfehler", () => {
  assert.equal(classifyMessage("HTTP Error 410: Gone"), ResolveErrorCode.PROVIDER_ERROR);
  assert.equal(classifyMessage("Unable to download webpage"), ResolveErrorCode.PROVIDER_ERROR);
});

test("classifyMessage fällt auf EXTRACTION_FAILED zurück", () => {
  assert.equal(classifyMessage("irgendwas ging schief"), ResolveErrorCode.EXTRACTION_FAILED);
  assert.equal(classifyMessage(""), ResolveErrorCode.EXTRACTION_FAILED);
});

test("die bestehenden Heuristiken bleiben erhalten", () => {
  assert.equal(isUnsupportedUrl("ERROR: Unsupported URL: x"), true);
  assert.equal(isUnsupportedUrl("HTTP Error 403"), false);
  assert.equal(looksLikeBlock("HTTP Error 403: Forbidden"), true);
  assert.equal(looksLikeBlock("alles gut"), false);
});

test("toResolveError übernimmt Node-Fehlercodes", () => {
  const err = Object.assign(new Error("yt-dlp wurde nicht gefunden."), { code: "ENOENT" });
  const resolved = toResolveError(err, { resolver: "yt-dlp" });
  assert.equal(resolved.code, ResolveErrorCode.DEPENDENCY_MISSING);
  assert.equal(resolved.resolver, "yt-dlp");
  assert.equal(resolved.cause, err);
});

test("toResolveError lässt strukturierte Fehler unverändert", () => {
  const original = new ResolveError(ResolveErrorCode.AUTH_REQUIRED, "Login nötig");
  const resolved = toResolveError(original, { resolver: "x" });
  assert.equal(resolved, original);
  assert.equal(resolved.code, ResolveErrorCode.AUTH_REQUIRED);
  assert.equal(resolved.resolver, "x");
});

test("pickMostRelevantError bevorzugt die hilfreichste Aussage", () => {
  const picked = pickMostRelevantError([
    new ResolveError(ResolveErrorCode.UNSUPPORTED_URL, "nicht meine Baustelle"),
    new ResolveError(ResolveErrorCode.AUTH_REQUIRED, "Login nötig"),
    new ResolveError(ResolveErrorCode.EXTRACTION_FAILED, "kaputt")
  ]);
  assert.equal(picked.code, ResolveErrorCode.AUTH_REQUIRED);
  assert.equal(pickMostRelevantError([]), null);
});

test("unbekannte Codes werden auf EXTRACTION_FAILED normalisiert", () => {
  const err = new ResolveError("QUATSCH", "hm");
  assert.equal(err.code, ResolveErrorCode.EXTRACTION_FAILED);
});

test("Abbruch ist nicht wiederholbar", () => {
  const err = new ResolveError(ResolveErrorCode.CANCELLED, "Vorgang abgebrochen.");
  assert.equal(err.retryable, false);
});
