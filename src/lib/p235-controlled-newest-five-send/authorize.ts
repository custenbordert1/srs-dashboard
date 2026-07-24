import {
  P235_APPROVED_BY,
  P235_MAX_BATCH,
  type P235Mode,
  type P235ModeAuthorization,
} from "@/lib/p235-controlled-newest-five-send/types";

export function parseP235Mode(argv: string[]): P235Mode {
  return argv.includes("--live") ? "live" : "preview";
}

function readArgValue(argv: string[], name: string): string {
  const prefix = `${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim();
  const index = argv.indexOf(name);
  return index >= 0 ? String(argv[index + 1] ?? "").trim() : "";
}

/**
 * Live mode requires:
 * --live --operator-approved --approved-by="Taylor Custenborder"
 *
 * Does NOT permanently enable unattended automation.
 */
export function authorizeP235Mode(argv: string[]): P235ModeAuthorization {
  const mode = parseP235Mode(argv);
  if (mode === "preview") {
    return { mode, approved: true, approvedBy: null, failures: [] };
  }

  const failures: string[] = [];
  const operatorApproved = argv.includes("--operator-approved");
  const approvedBy = readArgValue(argv, "--approved-by");
  if (!operatorApproved) failures.push("--operator-approved is required for live mode");
  if (!approvedBy) failures.push("--approved-by=<operator> is required for live mode");
  if (approvedBy && approvedBy !== P235_APPROVED_BY) {
    failures.push(`--approved-by must be exactly "${P235_APPROVED_BY}"`);
  }

  return {
    mode,
    approved: failures.length === 0,
    approvedBy: approvedBy || null,
    failures,
  };
}

export function assertP235LiveAuthorized(authorization: P235ModeAuthorization): void {
  if (authorization.mode !== "live") {
    throw new Error("P235 live execution requires --live.");
  }
  if (!authorization.approved) {
    throw new Error(`P235 live mode is not authorized: ${authorization.failures.join("; ")}`);
  }
}

export function assertP235WriteBudget(plannedWrites: number): void {
  if (plannedWrites > P235_MAX_BATCH) {
    throw new Error(
      `P235 write budget exceeded: planned=${plannedWrites} max=${P235_MAX_BATCH}`,
    );
  }
}
