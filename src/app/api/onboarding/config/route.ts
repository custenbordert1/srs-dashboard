import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import {
  hasConfiguredOnboardingTemplates,
  listOnboardingTemplates,
} from "@/lib/onboarding-template-registry";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    requireTerritory: true,
    auditAction: "onboarding_config_read",
  });
  if (isGuardFailure(guard)) return guard;

  const config = readDropboxSignConfig();
  const templates = listOnboardingTemplates();

  const templatesAvailable = hasConfiguredOnboardingTemplates();

  return NextResponse.json({
    ok: true,
    configured: Boolean(config),
    templatesAvailable,
    testMode: config?.testMode ?? false,
    templates: templates.map((t) => ({
      key: t.key,
      label: t.label,
      configured: t.configured,
    })),
  });
}
