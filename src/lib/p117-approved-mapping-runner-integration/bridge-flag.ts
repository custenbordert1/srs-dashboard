export const P117_SOURCE_PHASE = "P117";
export const P117_BRIDGE_ENV_FLAG = "USE_APPROVED_MAPPING_BRIDGE_DRY_RUN";

/** Dry-run bridge is enabled only when env is exactly "true". */
export function isApprovedMappingBridgeDryRunEnabled(): boolean {
  return process.env[P117_BRIDGE_ENV_FLAG] === "true";
}

/** Bridge never applies outside dryRun engine/runner mode. */
export function isApprovedMappingBridgeActive(input: {
  engineMode: "dryRun" | "executeOne" | "executeSafeSingles";
}): boolean {
  return isApprovedMappingBridgeDryRunEnabled() && input.engineMode === "dryRun";
}
