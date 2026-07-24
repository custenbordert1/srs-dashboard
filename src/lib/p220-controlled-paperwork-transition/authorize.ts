import type { P220Mode, P220ModeAuthorization } from "@/lib/p220-controlled-paperwork-transition/types";
import { P220_APPROVED_BY } from "@/lib/p220-controlled-paperwork-transition/types";

export function parseP220Mode(argv: string[]): P220Mode {
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
 * Live mode requires three independent signals:
 * --live --operator-approved --approved-by="Taylor Custenborder"
 */
export function authorizeP220Mode(argv: string[]): P220ModeAuthorization {
  const mode = parseP220Mode(argv);
  if (mode === "preview") {
    return { mode, approved: true, approvedBy: null, failures: [] };
  }

  const failures: string[] = [];
  const operatorApproved = argv.includes("--operator-approved");
  const approvedBy = readArgValue(argv, "--approved-by");
  if (!operatorApproved) failures.push("--operator-approved is required for live mode");
  if (!approvedBy) failures.push("--approved-by=<operator> is required for live mode");
  if (approvedBy && approvedBy !== P220_APPROVED_BY) {
    failures.push(`--approved-by must be exactly "${P220_APPROVED_BY}"`);
  }

  return {
    mode,
    approved: failures.length === 0,
    approvedBy: approvedBy || null,
    failures,
  };
}

export function assertP220LiveAuthorized(authorization: P220ModeAuthorization): void {
  if (authorization.mode !== "live") {
    throw new Error("P220 requires --live. Preview is not a valid execution mode for this phase.");
  }
  if (!authorization.approved) {
    throw new Error(`P220 live mode is not authorized: ${authorization.failures.join("; ")}`);
  }
}
