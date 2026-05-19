import { resolveSessionSecret } from "@/lib/auth/auth-env";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthSession, UserPublic } from "@/lib/auth/types";

const SESSION_COOKIE = "srs_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sessionSecret(): string {
  const secret = resolveSessionSecret();
  if (!secret) {
    throw new Error("SESSION_SECRET or BREEZY_API_KEY must be configured for auth sessions.");
  }
  return secret;
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");
}

export function createSessionToken(user: UserPublic): { token: string; session: AuthSession } {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const session: AuthSession = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    dmName: user.dmName,
    territoryStates: user.territoryStates,
    expiresAt,
  };
  const encodedPayload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = signPayload(encodedPayload);
  return { token: `${encodedPayload}.${signature}`, session };
}

export function verifySessionToken(token: string | undefined | null): AuthSession | null {
  if (!token?.includes(".")) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expected = signPayload(encodedPayload);
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as AuthSession;
    if (!session.userId || !session.role || !session.expiresAt) return null;
    if (new Date(session.expiresAt).getTime() < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionCookieName(): string {
  return SESSION_COOKIE;
}

export function sessionCookieOptions(maxAgeSeconds = SESSION_TTL_MS / 1000) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  role: AuthSession["role"];
  dmName?: string;
  territoryStates: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}): UserPublic {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    dmName: user.dmName,
    territoryStates: user.territoryStates,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
