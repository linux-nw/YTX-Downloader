# Architektur: Media Resolution

Ziel dieser Struktur ist, neue Seiten und Hoster hinzufügen zu können, ohne
`src/main.js` oder den Downloader anzufassen.

```
Input URL
  -> SiteResolver        erkennt die Seite, findet Provider-/Hoster-Links
  -> Provider URL(s)
  -> ProviderResolver    löst eine Hoster-URL zu einer Medien-URL auf
  -> ResolvedMedia       einheitliches Ergebnis
  -> Downloader          yt-dlp-Kaskade, kennt nur ResolvedMedia
```

## Verzeichnisse

```
src/
  core/
    types.js            ResolvedMedia/MediaFormat + Normalisierung
    errors.js           ResolveError + Fehlercodes + Klassifikation
    ResolveContext.js   Auth, Header, Signal, Services, Logger, Cache
    registry.js         ResolverRegistry (Auswahl nach canHandle + Priorität)
    ResolverManager.js  Site -> Provider Pipeline
    FallbackManager.js  generische Stufen-Pipeline
    logger.js           strukturiertes Logging inkl. Redaction
    setup.js            baut die Standard-Pipeline zusammen
  sites/                SiteResolver (podcast-rss, generic-page)
  providers/            ProviderResolver (direct-media, yt-dlp, playwright-sniffer)
  auth/                 AuthContext, SessionStore (nur im Speicher)
  cache/                ResolverCache (kurze TTL, keine Auth-Daten)
  downloader/           yt-dlp-Argumente und die 5-stufige Download-Kaskade
tests/                  node:test, ohne zusätzliche Abhängigkeiten
```

## Einen neuen SiteResolver hinzufügen

Ein SiteResolver erkennt eine Übersichts- oder Videoseite und liefert
Media-Referenzen. Er lädt nichts herunter und löst noch keine Medien-URL auf.

1. Datei `src/sites/MeineSeiteSiteResolver.js` anlegen:

```js
const { SiteResolver } = require("./SiteResolver");
const { hostMatches } = require("../core/types");
const { ResolveError, ResolveErrorCode } = require("../core/errors");

class MeineSeiteSiteResolver extends SiteResolver {
  constructor() {
    // Höhere Priorität = wird vor allgemeineren Resolvern getestet.
    // Referenz: podcast-rss 90, generic-page 1.
    super({ name: "meine-seite", priority: 70 });
  }

  canHandle(url) {
    return hostMatches(url, ["meine-seite.example"]);
  }

  async resolve(url, context) {
    context.throwIfAborted();
    const res = await context.fetch(url);           // HTTP über den Context
    if (res.status === 403) {
      throw new ResolveError(ResolveErrorCode.AUTH_REQUIRED, "Login nötig.", { resolver: this.name, url });
    }
    const html = await res.text();

    // Mehrere Treffer sind erlaubt: ein Eintrag je gefundenem Hoster-Link.
    return [...html.matchAll(/data-embed="([^"]+)"/g)].map((m) => ({
      sourceUrl: url,
      providerUrl: m[1],
      title: "..."
    }));
  }
}

module.exports = { MeineSeiteSiteResolver };
```

2. In `src/sites/index.js` in `createSiteRegistry()` eintragen (vor
   `GenericPageSiteResolver`, die Reihenfolge im Array ist aber egal, es zählt
   `priority`).

3. Tests in `tests/` ergänzen: `canHandle` für Treffer und Nicht-Treffer,
   das Parsen mehrerer Links, sowie das erwartete Fehlerverhalten.

Rückgabefelder: `sourceUrl` (Pflicht), `providerUrl`, `title`, `thumbnail`,
`duration`, `meta`. Wer bereits eine fertige Medien-URL hat, setzt `mediaUrl` -
dann überspringt der Manager den Provider-Schritt.

## Einen neuen ProviderResolver hinzufügen

Ein ProviderResolver bekommt eine Hoster-URL und liefert genau ein
`ResolvedMedia` mit `mediaUrl`.

1. Datei `src/providers/MeinHosterProviderResolver.js` anlegen:

```js
const { ProviderResolver } = require("./ProviderResolver");
const { hostMatches } = require("../core/types");
const { requireAuth } = require("../auth/AuthContext");

class MeinHosterProviderResolver extends ProviderResolver {
  constructor() {
    // direct-media 80, yt-dlp 10 (Auffang), playwright-sniffer 5.
    // Wer mehr kann als yt-dlp, liegt darüber.
    super({ name: "mein-hoster", priority: 60 });
  }

  canHandle(url) {
    return hostMatches(url, ["hoster.example"]);
  }

  async resolve(url, context) {
    if (context.auth.type === "none" && /premium/.test(url)) {
      throw requireAuth("Dieses Video ist nur mit Login abrufbar.", { resolver: this.name, url });
    }
    return {
      sourceUrl: url,
      mediaUrl: "https://cdn.hoster.example/stream.m3u8",
      provider: "mein-hoster",
      formats: [{ ext: "m3u8", note: "HLS" }]
    };
  }
}

module.exports = { MeinHosterProviderResolver };
```

2. In `src/providers/index.js` in `createProviderRegistry()` eintragen.

3. Tests ergänzen: Erkennung, Normalisierung, und die Fehlercodes.

## Fehlercodes

Resolver werfen `ResolveError` mit einem Code, statt nur eine Textmeldung:

| Code | Bedeutung |
| --- | --- |
| `UNSUPPORTED_URL` | dieser Resolver ist nicht zuständig / kein Extractor |
| `AUTH_REQUIRED` | ohne Login/Cookies nicht abrufbar |
| `SESSION_EXPIRED` | vorhandene Session/Cookies sind abgelaufen |
| `CAPTCHA_REQUIRED` | Bot-Check steht davor |
| `GEO_RESTRICTED` | im aktuellen Land gesperrt |
| `PROVIDER_ERROR` | Hoster antwortet mit Fehler/Block (4xx, 5xx, Cloudflare) |
| `EXTRACTION_FAILED` | Seite erreichbar, aber nichts Verwertbares gefunden |
| `NETWORK_ERROR` | DNS/Timeout/Verbindung |
| `DEPENDENCY_MISSING` | yt-dlp/Playwright fehlt (Ergänzung für dieses Projekt) |
| `CANCELLED` | Nutzer hat abgebrochen, beendet die Pipeline sofort |

`classifyMessage()` in `src/core/errors.js` ordnet rohe yt-dlp-Meldungen diesen
Codes zu. Scheitern mehrere Resolver, wählt `pickMostRelevantError()` den für
den Nutzer hilfreichsten Fehler (Login-Hinweis schlägt "nichts gefunden").

## Fallback-Pipeline

`FallbackManager` führt Stufen nacheinander aus, isoliert deren Fehler und
protokolliert jeden Schritt. Verwendet wird er an zwei Stellen:

- `ResolverManager`: Resolver-Kandidaten nach Priorität durchprobieren.
- `src/downloader/YtDlpDownloader.js`: die bestehende Download-Kaskade

  1. yt-dlp-Kandidaten (mit Impersonation, falls curl_cffi vorhanden)
  2. Age-Gate-Bypass (nur wo bekannt, aktuell YouTube)
  3. ohne Impersonation
  4. `--force-generic-extractor` (nur bei "Unsupported URL")
  5. Browser-/Session-basierte Extraktion (nur wenn im UI aktiviert)

Die Log-Zeilen `[Stufe n/5] ...` sind unverändert geblieben.

## Auth

`ResolveContext.auth` ist optional und hat drei Formen: `none`, `cookies`,
`session`. Regeln:

- Resolver speichern nichts davon, sie bekommen es je Aufruf gereicht.
- Passwörter sind im `AuthContext` nicht vorgesehen; `createAuthContext()`
  weist Felder wie `password` oder `token` mit einem Fehler ab.
- Für Browser-Cookies wird nur der Browsername als Referenz gehalten
  (`cookiesFromBrowser: "chrome"`), yt-dlp liest die Cookies selbst.
- `SessionStore` hält Session-Material ausschließlich im Speicher, mit TTL und
  ohne jede Persistenz.
- Fehlt die Berechtigung, meldet der Resolver `AUTH_REQUIRED` bzw.
  `SESSION_EXPIRED`, statt einfach fehlzuschlagen.

## Cache

`ResolverCache` ist optional (`createDefaultResolverManager({ cache: null })`
schaltet ihn ab). Gecacht werden erkannte Zuständigkeiten (lange TTL) und
Auflösungsergebnisse (kurze TTL, weil signierte URLs schnell ablaufen).
`set()` weist Werte mit Cookies/Tokens/Session-Ids zurück, und bei aktivem
Auth-Context wird der Cache gar nicht erst benutzt.

## Logging

Jeder Schritt geht über `src/core/logger.js`:

```
input -> site-detected -> provider-detected -> resolver-try
      -> resolver-ok | resolver-fail -> fallback -> result
```

Vor der Ausgabe entfernt `redact()` Cookie-, Authorization- und Token-Werte
sowie Signaturparameter aus URLs. Die Test-Datei `tests/logging.test.js` prüft
das für einen kompletten Durchlauf.

## Was bewusst nicht getan wird

Es wird kein Zugriffsschutz umgangen und kein DRM entschlüsselt. Der
Playwright-Resolver beobachtet nur die Netzwerkanfragen, die die Seite ohnehin
stellt; verschlüsselte Streams laufen bewusst in einen Fehler.

## Tests

```
npm test     # node:test, alle Dateien unter tests/
npm run check  # Syntaxprüfung aller CommonJS-Dateien
```

Abgedeckt sind unter anderem: Resolver-Erkennung und -Priorität,
Fallback-Verhalten, Auth-/Session-/Netzwerkfehler, ungültige URLs, mehrere
Provider auf einer Seite, Normalisierung zu `ResolvedMedia`, die
Download-Kaskade Stufe für Stufe und die Redaction im Logging.
