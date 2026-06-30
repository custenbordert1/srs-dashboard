import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildTestCohortValidationFromStores } from "@/lib/test-cohort-validation";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/test-cohort-validation
 * P103 applicant test cohort validation — preview only, no sends.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const mtdOnly = url.searchParams.get("mtdOnly") !== "false";
  const includeApplicants = url.searchParams.get("includeApplicants") === "true";

  const report = await buildTestCohortValidationFromStores({ mtdOnly });

  return NextResponse.json({
    ok: true,
    previewMode: true,
    liveSend: false,
    validation: includeApplicants
      ? report
      : {
          ...report,
          applicants: report.applicants.map((entry) => ({
            applicantKey: entry.applicantKey,
            applicantName: entry.applicantName,
            matchStatus: entry.matchStatus,
            candidateId: entry.candidateId,
            duplicateStatus: entry.duplicateStatus,
            contact: entry.contact,
            paperworkSendEligible: entry.paperworkSendEligible,
            blockerReason: entry.blockerReason,
            recommendation: entry.recommendation,
          })),
        },
    warnings: [
      "P103 test cohort validation — preview only, no paperwork sends.",
      "No Breezy writes. No Dropbox Sign calls.",
      "Tyesha Evans email intentionally uses gmial.com typo for invalid-email test.",
    ],
  });
}
