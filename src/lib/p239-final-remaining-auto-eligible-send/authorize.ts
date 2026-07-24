import {
  P239_APPROVED_BY,
  P239_MAX_BATCH,
  type P239Mode,
  type P239ModeAuthorization,
} from "@/lib/p239-final-remaining-auto-eligible-send/types";

export function parseP239Mode(argv: string[]): P239Mode {
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
 */
export function authorizeP239Mode(argv: string[]): P239ModeAuthorization {
  const mode = parseP239Mode(argv);
  if (mode === "preview") {
    return { mode, approved: true, approvedBy: null, failures: [] };
  }

  const failures: string[] = [];
  const operatorApproved = argv.includes("--operator-approved");
  const approvedBy = readArgValue(argv, "--approved-by");
  if (!operatorApproved) failures.push("--operator-approved is required for live mode");
  if (!approvedBy) failures.push("--approved-by=<operator> is required for live mode");
  if (approvedBy && approvedBy !== P239_APPROVED_BY) {
    failures.push(`--approved-by must be exactly "${P239_APPROVED_BY}"`);
  }

  return {
    mode,
    approved: failures.length === 0,
    approvedBy: approvedBy || null,
    failures,
  };
}

export function assertP239LiveAuthorized(authorization: P239ModeAuthorization): void {
  if (authorization.mode !== "live") {
    throw new Error("P239 live execution requires --live.");
  }
  if (!authorization.approved) {
    throw new Error(`P239 live mode is not authorized: ${authorization.failures.join("; ")}`);
  }
}

export function assertP239WriteBudget(plannedWrites: number): void {
  if (plannedWrites > P239_MAX_BATCH) {
    throw new Error(
      `P239 write budget exceeded: planned=${plannedWrites} max=${P239_MAX_BATCH}`,
    );
  }
}
