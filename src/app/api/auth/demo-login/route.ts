import { canCreateSessions, getConfiguredDefaultPassword } from "@/lib/auth/auth-env";
import { authConfigErrorMessage } from "@/lib/env-validation";
import { isMockDmLoginEnabled, MOCK_DM_LOGINS } from "@/lib/auth/mock-dm-logins";
import { createSessionToken, sessionCookieName, sessionCookieOptions } from "@/lib/auth/session";
import { authenticateUser, findUserByEmail } from "@/lib/auth/user-store";
import { writeAuditLog } from "@/lib/security/audit-log";
import { AUTH_RATE_LIMIT, checkRateLimit, clientIpFromRequest } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type DemoLoginBody = {
  email?: string;
};

export async function POST(request: Request): Promise<NextResponse> {
  if (!isMockDmLoginEnabled()) {
    return NextResponse.json({ ok: false, error: "Demo login is disabled." }, { status: 403 });
  }

  const ip = clientIpFromRequest(request);
  const limited = checkRateLimit(`auth-demo-login:${ip}`, AUTH_RATE_LIMIT);
  if (!limited.allowed) {
    return NextResponse.json({ ok: false, error: "Too many login attempts. Try again shortly." }, { status: 429 });
  }

  if (!canCreateSessions()) {
    return NextResponse.json({ ok: false, error: authConfigErrorMessage() }, { status: 503 });
  }

  let body: DemoLoginBody;
  try {
    body = (await request.json()) as DemoLoginBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email) {
    return NextResponse.json({ ok: false, error: "email is required." }, { status: 400 });
  }

  const allowed = MOCK_DM_LOGINS.some((mock) => mock.email.toLowerCase() === email);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Unknown demo DM account." }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user || user.role !== "dm") {
    return NextResponse.json({ ok: false, error: "Demo DM account not found." }, { status: 404 });
  }

  const password = getConfiguredDefaultPassword();
  const authenticated = await authenticateUser(email, password);
  if (!authenticated) {
    return NextResponse.json(
      { ok: false, error: "Demo password mismatch — check DM_DEFAULT_PASSWORD in .env.local." },
      { status: 401 },
    );
  }

  const { token, session } = createSessionToken({
    id: authenticated.id,
    email: authenticated.email,
    name: authenticated.name,
    role: authenticated.role,
    dmName: authenticated.dmName,
    territoryStates: authenticated.territoryStates,
    active: authenticated.active,
    createdAt: authenticated.createdAt,
    updatedAt: authenticated.updatedAt,
  });

  writeAuditLog({
    userId: session.userId,
    role: session.role,
    action: "login_success",
    entityType: "user",
    entityId: session.userId,
    territory: session.territoryStates.join(","),
    metadata: { email: session.email, demoLogin: true },
  });

  const response = NextResponse.json({ ok: true, role: session.role, redirect: "/dm" });
  response.cookies.set(sessionCookieName(), token, sessionCookieOptions());
  return response;
}
