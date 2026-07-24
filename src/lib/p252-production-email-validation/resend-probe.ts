import { verifyResendSenderDomain } from "@/lib/p248-resend-live-reminder-campaign/config-check";
import type { P252ResendProbe } from "@/lib/p252-production-email-validation/types";

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

/**
 * Authenticate with Resend and verify From domain. Never logs the API key.
 * Quota/limits: Resend public API does not expose plan quotas; report that explicitly.
 */
export async function probeResendProduction(input: {
  apiKey: string | null;
  fromEmail: string;
}): Promise<P252ResendProbe> {
  const blockers: string[] = [];
  const domain = domainOf(input.fromEmail) || null;

  if (!input.apiKey) {
    blockers.push("RESEND_API_KEY is missing from the runtime environment (.env.local)");
    return {
      attempted: false,
      authenticated: null,
      httpStatus: null,
      domain,
      domainStatus: null,
      domainVerified: null,
      fromAuthorized: null,
      quotaAvailable: null,
      quotaDetail: "Skipped — RESEND_API_KEY unavailable",
      detail: "Resend probe skipped — API key missing",
      blockers,
    };
  }

  try {
    const res = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (res.status === 401 || res.status === 403) {
      blockers.push(`Resend authentication failed (${res.status})`);
      return {
        attempted: true,
        authenticated: false,
        httpStatus: res.status,
        domain,
        domainStatus: null,
        domainVerified: null,
        fromAuthorized: null,
        quotaAvailable: null,
        quotaDetail: "Unavailable — authentication failed",
        detail: `Resend authentication failed (${res.status})`,
        blockers,
      };
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      const detail =
        typeof body.message === "string"
          ? body.message
          : `Resend domains lookup failed (${res.status})`;
      blockers.push(detail);
      return {
        attempted: true,
        authenticated: null,
        httpStatus: res.status,
        domain,
        domainStatus: null,
        domainVerified: null,
        fromAuthorized: null,
        quotaAvailable: null,
        quotaDetail: "Unavailable — domains API error",
        detail,
        blockers,
      };
    }

    const domainProbe = await verifyResendSenderDomain({
      apiKey: input.apiKey,
      fromEmail: input.fromEmail,
    });

    if (!domainProbe.ok) {
      blockers.push(`Sender domain verification failed: ${domainProbe.detail}`);
    }

    return {
      attempted: true,
      authenticated: true,
      httpStatus: res.status,
      domain,
      domainStatus: domainProbe.domainStatus,
      domainVerified: domainProbe.domainVerified,
      fromAuthorized: domainProbe.ok,
      quotaAvailable: null,
      quotaDetail:
        "Resend public API does not expose plan quota/rate-limit remaining; monitor Resend dashboard",
      detail: domainProbe.detail,
      blockers,
    };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Resend probe failed";
    blockers.push(detail);
    return {
      attempted: true,
      authenticated: false,
      httpStatus: null,
      domain,
      domainStatus: null,
      domainVerified: null,
      fromAuthorized: null,
      quotaAvailable: null,
      quotaDetail: "Unavailable — probe exception",
      detail,
      blockers,
    };
  }
}
