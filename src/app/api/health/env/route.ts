import { getFeatureReadiness, validateEnv } from "@/lib/env-validation";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Server-only: reports variable names and readiness — never returns secret values. */
export async function GET() {
  const report = validateEnv();
  return NextResponse.json(
    { ...report, features: getFeatureReadiness() },
    {
      status: report.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
