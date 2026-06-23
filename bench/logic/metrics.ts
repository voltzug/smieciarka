import { Counter, Rate } from "k6/metrics";

/**
 * Minimal configuration interface containing the k6 metrics
 * that the handler must increment during evaluation.
 */
export interface BenchmarkMetrics {
  serverErrorCounter: Counter;
  serverFailureRate: Rate;
  logicErrorCounter: Counter;
  raceErrorCounter: Counter;
}

/**
 * Tracks critical server-side operational failure footprints.
 * Incremented during driver timeouts, pool exhaustion, or infrastructure drops.
 */
export const dbServerErrorCounter = new Counter("db_server_errors");
/**
 * Tracks the raw percentage rate of server failures against total operations.
 * Highly useful for setting strict Service Level Objective (SLO) thresholds.
 */
export const dbServerFailureRate = new Rate("db_server_failure_rate");
/**
 * Tracks business logic rule denials, input validation issues, and state walls.
 * Incremented when data hits expected structural constraints (e.g., uniqueness rules).
 */
export const dbLogicErrorCounter = new Counter("db_logic_errors");
export const raceErrorCounter = new Counter("race_errors");

export const benchmarkMetricsContext: BenchmarkMetrics = {
  serverErrorCounter: dbServerErrorCounter,
  serverFailureRate: dbServerFailureRate,
  logicErrorCounter: dbLogicErrorCounter,
  raceErrorCounter: raceErrorCounter,
};
