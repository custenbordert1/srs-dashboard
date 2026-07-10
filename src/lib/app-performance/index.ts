/**
 * P161.1 — Executive performance / fast snapshot layer.
 *
 * Serves pre-computed executive snapshots in <500ms while the expensive P159/P160
 * pipeline refreshes in the background.
 */
export * from "@/lib/app-performance/performance-metrics";
export * from "@/lib/app-performance/snapshot-store";
export * from "@/lib/app-performance/snapshot-cache";
export * from "@/lib/app-performance/snapshot-builder";
export * from "@/lib/app-performance/background-refresh";
export * from "@/lib/app-performance/serve-snapshot";
