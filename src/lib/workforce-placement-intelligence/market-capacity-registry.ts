/**
 * Extensible capacity planning defaults — preview only, not persisted.
 * Adjust targets here to tune hiring recommendations without changing calculator code.
 */
export const MARKET_CAPACITY_CONFIG = {
  /** Stores per rep at or below this level is considered healthy coverage. */
  healthyStoresPerRep: 4,
  /** Target stores per rep when calculating ideal workforce size. */
  planningTargetStoresPerRep: 3.2,
  /** Minimum open stores before capacity planning recommends hires. */
  minOpenStoresForHiring: 1,
} as const;

export type MarketCapacityConfig = typeof MARKET_CAPACITY_CONFIG;
