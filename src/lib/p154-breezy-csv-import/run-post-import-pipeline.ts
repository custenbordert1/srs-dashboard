import type { AuthSession } from "@/lib/auth/types";
import { assignRecruiters } from "@/lib/p151-autonomous-recruiter-assignment/assign-recruiters";
import { executeImmediatePaperworkPolicy } from "@/lib/p152-immediate-paperwork-policy/execute-immediate-paperwork-policy";
import type { BreezyCsvPipelineReport } from "@/lib/p154-breezy-csv-import/types";

export async function runPostCsvImportPipeline(input: {
  session: AuthSession;
  userId?: string;
}): Promise<BreezyCsvPipelineReport> {
  process.env.P151_AUTONOMOUS_ADVANCEMENT_ENABLED = "true";
  process.env.P152_IMMEDIATE_PAPERWORK_ENABLED = "false";

  const assignment = await assignRecruiters({
    session: input.session,
    dryRun: false,
    userId: input.userId ?? input.session.userId,
  });

  const paperworkEligibility = await executeImmediatePaperworkPolicy({
    session: input.session,
    dryRun: true,
    userId: input.userId ?? input.session.userId,
    userEmail: input.session.email,
  });

  return { assignment, paperworkEligibility };
}
