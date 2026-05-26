import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import { listOnboardingTemplates } from "@/lib/onboarding-template-registry";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = readDropboxSignConfig();
  const templates = listOnboardingTemplates().filter((t) => t.configured);
  return NextResponse.json({
    ok: true,
    provider: "Dropbox Sign",
    configured: Boolean(config),
    sendEnabled: Boolean(config && templates.length > 0),
    statusLabel: config
      ? templates.length > 0
        ? "Dropbox Sign ready"
        : "API key set — configure template IDs"
      : "Waiting on DROPBOX_SIGN_API_KEY",
    message: config
      ? "Use Actions → Send paperwork or the Paperwork tab. Sends use /api/onboarding/send-packet (local workflow only)."
      : "Add DROPBOX_SIGN_API_KEY and template IDs to .env.local for the SRS Recruiting Operations app.",
  });
}
