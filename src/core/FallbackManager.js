/**
 * FallbackManager: generische Pipeline aus nacheinander versuchten Stufen.
 *
 * Verallgemeinert die bestehende Kaskade der App
 *   (Impersonation -> Age-Gate-Bypass -> ohne Impersonation ->
 *    Generic-Extractor -> Playwright -> Fehler)
 * zu einem wiederverwendbaren Ablauf, den auch der ResolverManager nutzt.
 *
 * Eigenschaften:
 * - jede Stufe ist isoliert: ein Fehler beendet nicht die Pipeline,
 * - Stufen können per skip() übersprungen werden (Bedingung + Begründung),
 * - Fehler werden strukturiert gesammelt (ResolveError mit Code),
 * - terminale Fehler (Abbruch) stoppen sofort,
 * - jeder Schritt wird geloggt.
 */

const { toResolveError, pickMostRelevantError, TERMINAL_CODES } = require("./errors");
const { STEP, nullLogger } = require("./logger");

/**
 * @typedef {Object} FallbackStage
 * @property {string} name
 * @property {(state: Object) => (boolean|string)} [skip] true/Begründung = überspringen
 * @property {(state: Object) => Promise<any>} run       Ergebnis oder Wurf
 * @property {(value: any) => boolean} [accept]          Ergebnis gültig? (Default: != null)
 */

class FallbackManager {
  /**
   * @param {{ logger?: Object, stopOn?: (error: Object, state: Object) => boolean }} [options]
   */
  constructor(options = {}) {
    this.logger = options.logger || nullLogger();
    this.stopOn = typeof options.stopOn === "function" ? options.stopOn : null;
  }

  /**
   * Führt die Stufen der Reihe nach aus, bis eine ein gültiges Ergebnis liefert.
   *
   * @param {FallbackStage[]} stages
   * @param {Object} [state] Gemeinsamer, veränderbarer Zustand aller Stufen
   * @returns {Promise<{ok: boolean, value?: any, stage?: string, error?: Object, attempts: Array}>}
   */
  async run(stages, state = {}) {
    const attempts = [];
    const errors = [];

    for (const stage of stages || []) {
      if (!stage || typeof stage.run !== "function") continue;

      const skip = typeof stage.skip === "function" ? stage.skip(state) : false;
      if (skip) {
        const reason = typeof skip === "string" ? skip : "Bedingung nicht erfüllt";
        attempts.push({ stage: stage.name, skipped: true, reason });
        this.logger.step(STEP.FALLBACK, { resolver: stage.name, message: `übersprungen: ${reason}` });
        continue;
      }

      const startedAt = Date.now();
      this.logger.step(STEP.RESOLVER_TRY, { resolver: stage.name });
      try {
        const value = await stage.run(state);
        const accept = typeof stage.accept === "function"
          ? stage.accept(value)
          : (value !== null && value !== undefined && value !== false);
        if (accept) {
          attempts.push({ stage: stage.name, ok: true, ms: Date.now() - startedAt });
          this.logger.step(STEP.RESOLVER_OK, { resolver: stage.name, ms: Date.now() - startedAt });
          return { ok: true, value, stage: stage.name, attempts };
        }
        const empty = toResolveError(new Error("Kein Ergebnis."), { resolver: stage.name });
        errors.push(empty);
        attempts.push({ stage: stage.name, ok: false, code: empty.code, message: empty.message, ms: Date.now() - startedAt });
        this.logger.step(STEP.RESOLVER_FAIL, { resolver: stage.name, code: empty.code, message: empty.message });
      } catch (rawError) {
        const error = toResolveError(rawError, { resolver: stage.name });
        errors.push(error);
        attempts.push({ stage: stage.name, ok: false, code: error.code, message: error.message, ms: Date.now() - startedAt });
        this.logger.step(STEP.RESOLVER_FAIL, { resolver: stage.name, code: error.code, message: error.message });

        if (TERMINAL_CODES.has(error.code) || (this.stopOn && this.stopOn(error, state))) {
          return { ok: false, error, stage: stage.name, attempts };
        }
      }
    }

    return { ok: false, error: pickMostRelevantError(errors), attempts };
  }
}

module.exports = { FallbackManager };
