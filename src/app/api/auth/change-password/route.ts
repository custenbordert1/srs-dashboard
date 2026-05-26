import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { findUserById, updateUserPassword } from "@/lib/auth/user-store";
import { validatePasswordStrength, verifyPassword } from "@/lib/auth/password";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = (await request.json()) as { currentPassword?: string; newPassword?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";
  const strength = validatePasswordStrength(newPassword);
  if (!strength.ok) {
    return NextResponse.json({ ok: false, error: strength.error }, { status: 400 });
  }

  const user = await findUserById(session.userId);
  if (!user) {
    return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
  }

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    auditFromSession(session, {
      action: "login_failure",
      entityType: "user",
      entityId: session.userId,
      metadata: { reason: "password_change_invalid_current" },
    });
    return NextResponse.json({ ok: false, error: "Current password is incorrect." }, { status: 401 });
  }

  await updateUserPassword(session.userId, newPassword);

  auditFromSession(session, {
    action: "api_access",
    entityType: "user",
    entityId: session.userId,
    metadata: { event: "password_changed" },
  });

  return NextResponse.json({ ok: true });
}
