import { BenchmarkMetrics } from "./metrics";

/**
 * Thrown manually when a state constraint fails before hitting the database.
 */
export class BusinessLogicError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "BusinessLogicError";
  }
}

/**
 * Robust Central Exception Handler
 * Classifies 'unknown' exceptions into structural database/logic metrics.
 */
export function handleBenchmarkError(
  exception: unknown,
  metrics: BenchmarkMetrics,
): never {
  const err = exception as any;
  const errMsg: string = err?.msg || String(exception);

  // CASE 1: Predefined application-level logic violation
  if (exception instanceof BusinessLogicError) {
    metrics.logicErrorCounter.add(1, { reason: err.reason });
  }
  // CASE 2: Native Database Engine Errors (Checked via SQLSTATE)
  else if (errMsg.includes("pq:")) {
    const parts = errMsg.split("pq:");
    const msg = parts[parts.length - 1];
    if (
      msg.match(/\((P0001|23503)\)/) ||
      msg.includes("could not obtain lock")
    ) {
      // Categorize as a safe concurrent business race condition
      metrics.logicErrorCounter.add(1, { reason: "lock_contention_retry" });
    } else {
      // Keep true hardware/pool drops isolated here
      metrics.serverErrorCounter.add(1, {
        type: "infrastructure_panic",
        msg: msg,
      });
      metrics.serverFailureRate.add(true);
    }
  }
  // CASE 3: Unprogrammed Script Exceptions (JS Typos, undefined variables, runtime bugs)
  else {
    // Sideloaded: Evaluated as a script configuration error, leaving infra telemetry clean.
    metrics.logicErrorCounter.add(1, {
      reason: "unprogrammed_script_exception",
      raw: exception?.toString() || "-",
    });
  }

  // Always bubble up unprogrammed error to allow k6 runtime loop boundaries to intercept it
  throw exception;
}
