import type {
  CandidateOpsFutureHooks,
  P260LivePaperworkSendHook,
  P261ReminderEngineHook,
  P262RecruitingInboxHook,
} from "@/lib/p259-candidate-operations/types";

const P260_API = "/api/recruiting/job-command-center/send-paperwork" as const;

/**
 * P260 live send is wired through the Job Command Center API.
 * Reminder / inbox remain stubs (P261–P262).
 */
export const P260_LIVE_PAPERWORK_SEND_HOOK: P260LivePaperworkSendHook = {
  id: "p260_live_paperwork_send",
  wired: true,
  apiPath: P260_API,
  async previewSend(input) {
    try {
      const res = await fetch(P260_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", candidateId: input.candidateId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error ?? "P260 preview failed" };
      }
      return { ok: true, previewId: `p260-preview:${input.candidateId}` };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "P260 preview failed",
      };
    }
  },
  async executeLiveSend(input) {
    try {
      const res = await fetch(P260_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "send",
          candidateId: input.candidateId,
          confirmationPhrase: input.confirmationPhrase,
          typedConfirmation: input.typedConfirmation ?? input.confirmationPhrase,
          operatorConfirmed: true,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        result?: { signatureRequestId?: string | null; detail?: string };
      };
      if (!res.ok || !data.ok) {
        return {
          ok: false,
          error: data.error ?? data.result?.detail ?? "P260 send failed",
        };
      }
      return {
        ok: true,
        signatureRequestId: data.result?.signatureRequestId ?? undefined,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "P260 send failed",
      };
    }
  },
};

export const P261_REMINDER_ENGINE_HOOK: P261ReminderEngineHook = {
  id: "p261_reminder_engine",
  wired: false,
  async previewReminder() {
    return {
      ok: false,
      error: "P261 Reminder Engine is not implemented. Preview-only in P259.",
    };
  },
};

export const P262_RECRUITING_INBOX_HOOK: P262RecruitingInboxHook = {
  id: "p262_recruiting_inbox",
  wired: false,
};

export const CANDIDATE_OPS_FUTURE_HOOKS: CandidateOpsFutureHooks = {
  paperworkSend: P260_LIVE_PAPERWORK_SEND_HOOK,
  reminderEngine: P261_REMINDER_ENGINE_HOOK,
  recruitingInbox: P262_RECRUITING_INBOX_HOOK,
};
