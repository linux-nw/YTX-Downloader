/**
 * Downloader-Schicht.
 *
 * Arbeitet ausschließlich mit normalisierten ResolvedMedia-Objekten und den
 * Nutzeroptionen. Welcher Site- oder ProviderResolver das Medium geliefert
 * hat, spielt hier keine Rolle mehr.
 */

const { runDownloadCascade, buildFailureMessage } = require("./YtDlpDownloader");
const ytDlpArgs = require("./ytDlpArgs");

module.exports = {
  runDownloadCascade,
  buildFailureMessage,
  ...ytDlpArgs
};
