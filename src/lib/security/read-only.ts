import { auditFromSession, writeAuditLog } from "@/lib/security/audit-log";
import type { AuthSession } from "@/lib/auth/types";
import { NextResponse } from "next/server";

/** External systems that must remain read-only in this phase. */
export const READ_ONLY_SYSTEMS = ["breezy", "mel", "hellosign_external"] as const;

export type ReadOnlySystem = (typeof READ_ONLY_SYSTEMS)[number];

export function assertReadOnlyMethod(
  request: Request,
  system: ReadOnlySystem,
  session: AuthSession | null = null,
): NextResponse | null {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;

  auditFromSession(session, {
    action: "read_only_blocked",
    entityType: "system",
    entityId: system,
    metadata: { method, path: new URL(request.url).pathname },
  });

  return NextResponse.json(
    {
      ok: false,
      error: `${system} is read-only in this environment. ${method} is not permitted.`,
      readOnly: true,
    },
    { status: 405 },
  );
}

export function blockMelWriteRoute(request: Request, session: AuthSession | null): NextResponse | null {
  return assertReadOnlyMethod(request, "mel", session);
}

export function blockBreezyWriteRoute(request: Request, session: AuthSession | null): NextResponse | null {
  return assertReadOnlyMethod(request, "breezy", session);
}

export function logReadOnlyGuardInstalled(system: ReadOnlySystem): void {
  writeAuditLog({
    userId: "system",
    role: "anonymous",
    action: "api_access",
    entityType: "system",
    entityId: system,
    territory: "",
    metadata: { event: "read_only_guard_active" },
  });
}
