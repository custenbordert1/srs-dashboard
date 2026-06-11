import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { roleHasPermission } from "@/lib/production-readiness";
import {
  createManagedUser,
  listUserProfiles,
  updateManagedUser,
} from "@/lib/production-readiness";
import type { UserRole } from "@/lib/auth/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VALID_ROLES = new Set<string>(["admin", "executive", "recruiter", "dm"]);

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive"],
    auditAction: "admin_users_read",
  });
  if (isGuardFailure(guard)) return guard;
  if (!roleHasPermission(guard.session.role, "manage_users")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const users = await listUserProfiles(true);
  return NextResponse.json({ ok: true, users });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin"],
    auditAction: "admin_users_create",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as {
    email?: string;
    name?: string;
    role?: string;
    password?: string;
    territoryStates?: string[];
    dmName?: string;
  };

  if (!body.email || !body.name || !body.password || !body.role || !VALID_ROLES.has(body.role)) {
    return NextResponse.json({ ok: false, error: "Invalid user payload" }, { status: 400 });
  }

  try {
    const user = await createManagedUser({
      email: body.email,
      name: body.name,
      role: body.role as UserRole,
      password: body.password,
      territoryStates: body.territoryStates,
      dmName: body.dmName,
    });
    return NextResponse.json({ ok: true, user });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Create failed" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin"],
    auditAction: "admin_users_update",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as {
    userId?: string;
    name?: string;
    role?: string;
    active?: boolean;
    territoryStates?: string[];
  };

  if (!body.userId) {
    return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  }

  const user = await updateManagedUser(body.userId, {
    name: body.name,
    role: body.role && VALID_ROLES.has(body.role) ? (body.role as UserRole) : undefined,
    active: body.active,
    territoryStates: body.territoryStates,
  });

  if (!user) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  return NextResponse.json({ ok: true, user });
}
