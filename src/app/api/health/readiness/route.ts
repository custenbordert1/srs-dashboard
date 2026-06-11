import { canCreateSessions } from "@/lib/auth/auth-env";
import { validateEnv } from "@/lib/env-validation";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = validateEnv();
  const ready = env.ok && canCreateSessions();
  return NextResponse.json(
    {
      ok: ready,
      envOk: env.ok,
      authOk: canCreateSessions(),
      missingRequired: env.missingRequired.map((row) => row.name),
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  );
}
