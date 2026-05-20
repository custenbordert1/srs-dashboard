import { canCreateSessions, getAuthEnvStatus } from "@/lib/auth/auth-env";
import { writeAuditLog } from "@/lib/security/audit-log";
import { AUTH_RATE_LIMIT, checkRateLimit, clientIpFromRequest } from "@/lib/security/rate-limit";
import { loadConfig } from "@/lib/config";
import type { UserRole } from "@/lib/auth/types";
import { createSessionToken, sessionCookieName, sessionCookieOptions } from "@/lib/auth/session";
import { authenticateUser } from "@/lib/auth/user-store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type LoginSuccessBody = {
  ok: true;
  role: UserRole;
  redirect: string;
};

type LoginErrorBody = {
  ok: false;
  error: string;
};

function jsonResponse(body: LoginSuccessBody | LoginErrorBody, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function redirectForRole(role: UserRole): string {
  return role === "dm" ? "/dm" : "/";
}

function logAuth(event: string, details: Record<string, unknown>): void {
  console.info(`[auth/login] ${event}`, details);
}

async function parseLoginBody(request: Request): Promise<
  | { ok: true; email: string; password: string }
  | { ok: false; error: string }
> {
  let raw = "";
  try {
    raw = await request.text();
  } catch (err) {
    logAuth("body_read_failed", { error: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: "Could not read request body" };
  }

  if (!raw.trim()) {
    return { ok: false, error: "Request body is required" };
  }

  try {
    const body = JSON.parse(raw) as { email?: string; password?: string };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    return { ok: true, email, password };
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }
}

export async function GET(): Promise<NextResponse> {
  return jsonResponse({ ok: false, error: "Method not allowed. Use POST." }, 405);
}

export async function POST(request: Request): Promise<NextResponse> {
  const ip = clientIpFromRequest(request);
  const limited = checkRateLimit(`auth-login:${ip}`, AUTH_RATE_LIMIT);
  if (!limited.allowed) {
    writeAuditLog({
      userId: "anonymous",
      role: "anonymous",
      action: "login_failure",
      entityType: "user",
      entityId: ip,
      territory: "",
      metadata: { reason: "rate_limited" },
    });
    return jsonResponse({ ok: false, error: "Too many login attempts. Try again shortly." }, 429);
  }

  await loadConfig();
  const envStatus = getAuthEnvStatus();
  logAuth("request_received", {
    hasSessionSecret: envStatus.hasSessionSecret,
    hasBreezyApiKey: envStatus.hasBreezyApiKey,
    hasDmDefaultPassword: envStatus.hasDmDefaultPassword,
    sessionSecretSource: envStatus.sessionSecretSource,
  });

  if (!canCreateSessions()) {
    logAuth("auth_failure", {
      reason: "missing_session_secret",
      email: "(not checked)",
      hasSessionSecret: false,
      hasBreezyApiKey: envStatus.hasBreezyApiKey,
    });
    return jsonResponse(
      {
        ok: false,
        error:
          "Server auth is not configured. Set SESSION_SECRET or BREEZY_API_KEY in .env.local and restart the dev server.",
      },
      503,
    );
  }

  try {
    const parsed = await parseLoginBody(request);
    if (!parsed.ok) {
      logAuth("auth_failure", { reason: "invalid_body", error: parsed.error });
      return jsonResponse({ ok: false, error: parsed.error }, 400);
    }

    const { email, password } = parsed;
    logAuth("login_attempt", { email, passwordProvided: password.length > 0 });
    writeAuditLog({
      userId: "anonymous",
      role: "anonymous",
      action: "login_attempt",
      entityType: "user",
      entityId: email,
      territory: "",
      metadata: { ip },
    });

    if (!email || !password) {
      logAuth("auth_failure", { reason: "missing_credentials", email });
      return jsonResponse({ ok: false, error: "Email and password are required" }, 400);
    }

    const user = await authenticateUser(email, password);
    if (!user) {
      logAuth("auth_failure", { reason: "invalid_credentials", email, role: null });
      writeAuditLog({
        userId: "anonymous",
        role: "anonymous",
        action: "login_failure",
        entityType: "user",
        entityId: email,
        territory: "",
        metadata: { reason: "invalid_credentials" },
      });
      return jsonResponse({ ok: false, error: "Invalid email or password" }, 401);
    }

    logAuth("role_detected", { email, role: user.role, userId: user.id });

    const { token, session } = createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      dmName: user.dmName,
      territoryStates: user.territoryStates,
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });

    const redirect = redirectForRole(session.role);
    const response = jsonResponse({ ok: true, role: session.role, redirect }, 200);
    response.cookies.set(sessionCookieName(), token, sessionCookieOptions());

    logAuth("auth_success", { email, role: session.role, redirect });
    writeAuditLog({
      userId: session.userId,
      role: session.role,
      action: "login_success",
      entityType: "user",
      entityId: session.userId,
      territory: session.territoryStates.join(","),
      metadata: { email: session.email },
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    logAuth("auth_failure", {
      reason: "unhandled_error",
      error: message,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
