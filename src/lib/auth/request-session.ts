import { cookies } from "next/headers";
import { verifySessionToken, sessionCookieName } from "@/lib/auth/session";
import type { AuthSession } from "@/lib/auth/types";

export async function getServerSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName())?.value;
  return verifySessionToken(token);
}

export function getSessionFromRequest(request: Request): AuthSession | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const name = sessionCookieName();
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  const token = decodeURIComponent(match.slice(name.length + 1));
  return verifySessionToken(token);
}
