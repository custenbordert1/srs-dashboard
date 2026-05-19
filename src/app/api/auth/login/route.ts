import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, sessionCookieName, sessionCookieOptions, toPublicUser } from "@/lib/auth/session";
import { findUserByEmail } from "@/lib/auth/user-store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim() ?? "";
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Email and password are required" }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ ok: false, error: "Invalid email or password" }, { status: 401 });
  }

  const publicUser = toPublicUser(user);
  const { token, session } = createSessionToken(publicUser);

  const response = NextResponse.json({
    ok: true,
    user: publicUser,
    session,
    redirectTo: session.role === "dm" ? "/dm" : "/",
  });

  response.cookies.set(sessionCookieName(), token, sessionCookieOptions());
  return response;
}
