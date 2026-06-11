import { getServerSession } from "@/lib/auth/request-session";
import { refreshSessionTerritories } from "@/lib/auth/session-territories";
import { findUserById } from "@/lib/auth/user-store";
import { toPublicUser } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rawSession = await getServerSession();
  if (!rawSession) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  }

  const user = await findUserById(rawSession.userId);
  if (!user) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  }

  const session = refreshSessionTerritories(rawSession);

  return NextResponse.json({
    ok: true,
    authenticated: true,
    session,
    user: toPublicUser(user),
  });
}
