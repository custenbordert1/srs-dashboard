import type { P221Mode, P221ModeAuthorization } from "@/lib/p221-controlled-dropbox-sign-send/types";
import { P221_APPROVED_BY } from "@/lib/p221-controlled-dropbox-sign-send/types";

export function parseP221Mode(argv: string[]): P221Mode {
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
export function authorizeP221Mode(argv: string[]): P221ModeAuthorization {
  const mode = parseP221Mode(argv);
  if (mode === "preview") {
    return { mode, approved: true, approvedBy: null, failures: [] };
  }

  const failures: string[] = [];
  const operatorApproved = argv.includes("--operator-approved");
  const approvedBy = readArgValue(argv, "--approved-by");
  if (!operatorApproved) failures.push("--operator-approved is required for live mode");
  if (!approvedBy) failures.push("--approved-by=<operator> is required for live mode");
  if (approvedBy && approvedBy !== P221_APPROVED_BY) {
    failures.push(`--approved-by must be exactly "${P221_APPROVED_BY}"`);
  }

  return {
    mode,
    approved: failures.length === 0,
    approvedBy: approvedBy || null,
    failures,
  };
}

export function assertP221LiveAuthorized(authorization: P221ModeAuthorization): void {
  if (authorization.mode !== "live") {
    throw new Error("P221 requires --live. Preview is not a valid execution mode for this phase.");
  }
  if (!authorization.approved) {
    throw new Error(`P221 live mode is not authorized: ${authorization.failures.join("; ")}`);
  }
}
