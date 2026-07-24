import {
  getFeatureReadiness,
  validateEnv,
  validateProductionConfig,
} from "@/lib/env-validation";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Server-only: reports variable names and readiness — never returns secret values. */
export async function GET() {
  const report = validateEnv();
  const production = validateProductionConfig();
  return NextResponse.json(
    {
      ...report,
      features: getFeatureReadiness(),
      deployment: {
        tier: production.tier,
        vercelEnv: production.vercelEnv,
        nodeEnv: production.nodeEnv,
      },
      mail: {
        mode: production.mail.mode,
        modeExplicit: production.mail.modeExplicit,
        hasResendApiKey: production.mail.hasResendApiKey,
        resendKeyLength: production.mail.resendKeyLength,
        recruitingFromSet: production.mail.recruitingFromSet,
        canLiveDeliver: production.mail.canLiveDeliver,
        okForLiveEmail: production.okForLiveEmail,
        failCount: production.failCount,
        warnCount: production.warnCount,
        blockers: production.mail.blockers,
        // Never include RESEND_API_KEY value
      },
    },
    {
      status: report.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
