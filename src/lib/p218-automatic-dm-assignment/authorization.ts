import type {
  P218Mode,
  P218ModeAuthorization,
} from "@/lib/p218-automatic-dm-assignment/types";

export function parseP218Mode(argv: string[]): P218Mode {
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
 * Live mode requires three independent, explicit signals:
 * --live --operator-approved --approved-by=<operator>
 */
export function authorizeP218Mode(argv: string[]): P218ModeAuthorization {
  const mode = parseP218Mode(argv);
  if (mode === "preview") {
    return { mode, approved: true, approvedBy: null, failures: [] };
  }

  const failures: string[] = [];
  const operatorApproved = argv.includes("--operator-approved");
  const approvedBy = readArgValue(argv, "--approved-by");
  if (!operatorApproved) failures.push("--operator-approved is required for live mode");
  if (!approvedBy) failures.push("--approved-by=<operator> is required for live mode");

  return {
    mode,
    approved: failures.length === 0,
    approvedBy: approvedBy || null,
    failures,
  };
}

export function assertP218LiveAuthorized(
  authorization: P218ModeAuthorization,
): void {
  if (authorization.mode !== "live") return;
  if (!authorization.approved) {
    throw new Error(
      `P218 live mode is not authorized: ${authorization.failures.join("; ")}`,
    );
  }
}
