"use client";

import { CandidateOperationsApplicantDrawer } from "@/components/recruiting/candidate-operations-applicant-drawer";
import { CandidateOperationsConfirmModal } from "@/components/recruiting/candidate-operations-confirm-modal";
import { HiringWorkspacePaperworkPreviewModal } from "@/components/recruiting/hiring-workspace-paperwork-preview";
import {
  getLastOkTabCandidatesSnapshot,
  peekTabCandidatesCache,
} from "@/lib/breezy-candidates-client";
import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  fetchCandidateWorkflowBundle,
  persistWorkflowUpdate,
} from "@/lib/candidate-workflow-client";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import type { JobManagementRow } from "@/lib/job-management/job-management-rows";
import {
  JOB_COMMAND_CENTER_TABS,
  type JobCommandCenterTab,
} from "@/lib/p257-job-command-center";
import {
  buildBreezyCandidateDeepLink,
  buildDropboxSignManageLink,
  buildHiringWorkspaceApplicantInputs,
  buildHiringWorkspaceModel,
  buildMailtoLink,
  buildPaperworkPreviewModel,
  computeWindowSlice,
  copyTextToClipboard,
  filterApplicantsByPipeline,
  type HiringPipelineFilterId,
  type HiringWorkspaceModel,
  type PaperworkPreviewModel,
} from "@/lib/p258-hiring-workspace";
import {
  assertBulkActionAllowed,
  buildExportCsv,
  buildSmsLink,
  buildTelLink,
  CANDIDATE_OPS_BULK_ACTIONS,
  CANDIDATE_OPS_QUICK_FILTERS,
  CANDIDATE_OPS_ROW_ACTIONS,
  CANDIDATE_OPS_WRITE_POLICY,
  clearSelection,
  enrichCandidateOpsApplicants,
  filterApplicantsByQuickFilters,
  P260_LIVE_PAPERWORK_SEND_HOOK,
  selectAllVisible,
  selectionSummary,
  toggleQuickFilter,
  toggleSelection,
  type CandidateOpsApplicant,
  type CandidateOpsConfirmIntent,
  type CandidateOpsQuickFilterId,
} from "@/lib/p259-candidate-operations";
import { P260_CONFIRMATION_PHRASE } from "@/lib/p260-live-paperwork-workspace/types";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

type Props = {
  row: JobManagementRow;
  onClose: () => void;
  breezyCompanyId?: string | null;
};

const labelClass = "block text-[10px] font-medium uppercase tracking-wider text-zinc-500";
const ROW_HEIGHT = 72;
const LAZY_CHUNK = 60;

function formatDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
}

function formatShortDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString();
}

function MetricCard({
  label,
  value,
  hint,
  active,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = `rounded-xl border px-3 py-2.5 text-left ${
    active ? "border-teal-500/40 bg-teal-500/10" : "border-zinc-800/80 bg-zinc-950/50"
  } ${onClick ? "cursor-pointer hover:border-zinc-600" : ""}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        <p className={labelClass}>{label}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-50">{value}</p>
        {hint ? <p className="mt-0.5 text-[10px] text-zinc-600">{hint}</p> : null}
      </button>
    );
  }

  return (
    <div className={className}>
      <p className={labelClass}>{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-50">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-zinc-600">{hint}</p> : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={labelClass}>{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-100">{value}</dd>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

async function loadPositionCandidates(positionId: string): Promise<BreezyCandidate[]> {
  try {
    const res = await fetch(
      `/api/breezy/candidates?position_id=${encodeURIComponent(positionId)}&scan=fast`,
      { cache: "no-store" },
    );
    const parsed = (await res.json()) as {
      ok?: boolean;
      candidates?: BreezyCandidate[];
    };
    if (parsed.ok && Array.isArray(parsed.candidates)) return parsed.candidates;
  } catch {
    /* fall through to cache */
  }
  return [];
}

function collectCachedCandidates(): { candidates: BreezyCandidate[]; fromCache: boolean } {
  const peek = peekTabCandidatesCache();
  if (peek?.ok && peek.candidates.length > 0) {
    return { candidates: peek.candidates, fromCache: true };
  }
  const last = getLastOkTabCandidatesSnapshot();
  if (last?.ok && last.candidates.length > 0) {
    return { candidates: last.candidates, fromCache: true };
  }
  return { candidates: [], fromCache: false };
}

type PendingConfirm = {
  intent: CandidateOpsConfirmIntent;
  title: string;
  subtitle: string;
  warning: string;
  details: Array<{ label: string; value: string }>;
  confirmLabel: string;
  writeTone: boolean;
  requiredPhrase?: string;
  phraseHint?: string;
};

export function JobCommandCenterPanel({ row, onClose, breezyCompanyId = null }: Props) {
  const [tab, setTab] = useState<JobCommandCenterTab>("applicants");
  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState<HiringWorkspaceModel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pipelineFilter, setPipelineFilter] = useState<HiringPipelineFilterId | null>(null);
  const [quickFilters, setQuickFilters] = useState<CandidateOpsQuickFilterId[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reviewApplicant, setReviewApplicant] = useState<CandidateOpsApplicant | null>(null);
  const [paperworkPreview, setPaperworkPreview] = useState<PaperworkPreviewModel | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [rosters, setRosters] = useState<{ recruiters: string[]; dms: string[] }>({
    recruiters: [],
    dms: [],
  });
  const [toast, setToast] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(LAZY_CHUNK);
  const [scrollTop, setScrollTop] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();

    async function load() {
      setLoading(true);
      setLoadError(null);
      setVisibleCount(LAZY_CHUNK);
      if (reloadToken === 0) setSelectedIds([]);

      const shell = buildHiringWorkspaceModel({
        row,
        applicants: [],
        options: { candidatesFromCache: false, workflowsLoaded: false },
      });
      setModel(shell);

      const cached = collectCachedCandidates();
      let candidates = cached.candidates;
      let fromCache = cached.fromCache;
      let workflowsLoaded = false;
      let workflows: Awaited<ReturnType<typeof fetchCandidateWorkflowBundle>>["workflows"];

      try {
        const bundle = await fetchCandidateWorkflowBundle();
        if (bundle.ok && bundle.workflows) {
          workflows = bundle.workflows;
          workflowsLoaded = true;
        }
        if (bundle.ok && bundle.rosters) {
          setRosters({
            recruiters: bundle.rosters.recruiters ?? [],
            dms: bundle.rosters.dms ?? [],
          });
        }
      } catch {
        /* keep derived statuses */
      }

      if (row.breezyJobId) {
        const positionCandidates = await loadPositionCandidates(row.breezyJobId);
        if (positionCandidates.length > 0) {
          const byId = new Map<string, BreezyCandidate>();
          for (const c of [...candidates, ...positionCandidates]) {
            byId.set(c.candidateId || `${c.email}:${c.positionId}`, c);
          }
          candidates = [...byId.values()];
          fromCache = fromCache && positionCandidates.length === 0;
        }
      }

      if (cancelled) return;

      const applicants = row.breezyJobId
        ? buildHiringWorkspaceApplicantInputs({
            breezyJobId: row.breezyJobId,
            jobTitle: row.title,
            candidates,
            workflows,
          })
        : [];

      const next = buildHiringWorkspaceModel({
        row,
        applicants,
        options: {
          candidatesFromCache: fromCache,
          workflowsLoaded,
        },
      });

      if (
        next.ribbon.applicants === 0 &&
        typeof row.applicants === "number" &&
        row.applicants > 0
      ) {
        next.ribbon.applicants = row.applicants;
        next.overview.applicantCount = row.applicants;
        next.dataNotes.push(
          `Showing catalog applicant count (${row.applicants}) — per-applicant rows not in current snapshot.`,
        );
      }

      const elapsed = Math.round(performance.now() - started);
      if (elapsed > 500) {
        next.dataNotes.push(`Applicant hydrate took ${elapsed}ms (shell painted earlier).`);
      }

      startTransition(() => {
        setModel(next);
        setLoading(false);
      });
    }

    void load().catch((err) => {
      if (cancelled) return;
      setLoadError(err instanceof Error ? err.message : "Failed to load candidate operations");
      setLoading(false);
      setModel(
        buildHiringWorkspaceModel({
          row,
          applicants: [],
          options: { candidatesFromCache: false, workflowsLoaded: false },
        }),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [row, reloadToken]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const opsApplicants = useMemo(
    () => (model ? enrichCandidateOpsApplicants(model.applicants) : []),
    [model],
  );

  const filteredApplicants = useMemo(() => {
    const byPipeline = filterApplicantsByPipeline(opsApplicants, pipelineFilter);
    return filterApplicantsByQuickFilters(byPipeline, quickFilters);
  }, [opsApplicants, pipelineFilter, quickFilters]);

  const lazyApplicants = useMemo(
    () => filteredApplicants.slice(0, visibleCount),
    [filteredApplicants, visibleCount],
  );

  const viewportHeight = 440;
  const windowSlice = useMemo(
    () =>
      computeWindowSlice({
        total: lazyApplicants.length,
        scrollTop,
        viewportHeight,
        rowHeight: ROW_HEIGHT,
        overscan: 8,
      }),
    [lazyApplicants.length, scrollTop],
  );

  const visibleRows = lazyApplicants.slice(windowSlice.startIndex, windowSlice.endIndex);
  const visibleIds = lazyApplicants.map((a) => a.candidateId);
  const selection = selectionSummary(selectedIds, visibleIds);

  const ribbon = model?.ribbon;
  const overview = model?.overview;

  function openPipeline(filter: HiringPipelineFilterId) {
    setPipelineFilter((prev) => (prev === filter ? null : filter));
    setTab("applicants");
    setVisibleCount(LAZY_CHUNK);
  }

  async function handleCopy(value: string, label: string) {
    const ok = await copyTextToClipboard(value);
    setToast(ok ? `${label} copied` : `Nothing to copy for ${label.toLowerCase()}`);
  }

  function openExternal(url: string | null, missing: string) {
    if (!url) {
      setToast(missing);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function findApplicant(id: string): CandidateOpsApplicant | undefined {
    return opsApplicants.find((a) => a.candidateId === id);
  }

  function queueConfirm(pending: PendingConfirm) {
    setPendingConfirm(pending);
  }

  function requestAssignRecruiter(candidateIds: string[], recruiter?: string) {
    const name = recruiter?.trim();
    if (!name) {
      setToast("Pick a recruiter first");
      return;
    }
    queueConfirm({
      intent: { type: "assign_recruiter", candidateIds, recruiter: name },
      title: "Confirm assign recruiter",
      subtitle: `${candidateIds.length} candidate(s) → ${name}`,
      warning:
        "This writes assignedRecruiter via POST /api/candidates/workflows after you confirm. No paperwork send.",
      details: [
        { label: "Candidates", value: String(candidateIds.length) },
        { label: "Recruiter", value: name },
        { label: "API", value: "persistWorkflowUpdate → /api/candidates/workflows" },
      ],
      confirmLabel: "Confirm assign recruiter",
      writeTone: true,
    });
  }

  function requestAssignDm(candidateIds: string[], dm?: string) {
    const name = dm?.trim();
    if (!name) {
      setToast("Pick a DM first");
      return;
    }
    queueConfirm({
      intent: { type: "assign_dm", candidateIds, dm: name },
      title: "Confirm assign DM",
      subtitle: `${candidateIds.length} candidate(s) → ${name}`,
      warning:
        "This writes assignedDM via POST /api/candidates/workflows after you confirm. No paperwork send.",
      details: [
        { label: "Candidates", value: String(candidateIds.length) },
        { label: "DM", value: name },
        { label: "API", value: "persistWorkflowUpdate → /api/candidates/workflows" },
      ],
      confirmLabel: "Confirm assign DM",
      writeTone: true,
    });
  }

  function requestMoveStage(applicant: CandidateOpsApplicant, toStatus: CandidateWorkflowStatus) {
    queueConfirm({
      intent: {
        type: "move_stage",
        candidateId: applicant.candidateId,
        fromStatus: applicant.workflowStatus,
        toStatus,
      },
      title: "Confirm move stage",
      subtitle: `${applicant.displayName}: ${applicant.workflowStatus} → ${toStatus}`,
      warning:
        "This writes workflowStatus via POST /api/candidates/workflows after you confirm. Operator-initiated only.",
      details: [
        { label: "Candidate", value: applicant.displayName },
        { label: "From", value: applicant.workflowStatus },
        { label: "To", value: toStatus },
      ],
      confirmLabel: "Confirm stage move",
      writeTone: true,
    });
  }

  function requestPaperworkPreview(applicant: CandidateOpsApplicant) {
    queueConfirm({
      intent: { type: "send_paperwork_preview", candidateId: applicant.candidateId },
      title: "Preview Send Paperwork",
      subtitle: applicant.displayName,
      warning:
        "Opens the paperwork preview. A second confirmation with the production phrase is required before any Dropbox Sign packet is created (P260 — one candidate only).",
      details: [
        { label: "Candidate", value: applicant.displayName },
        { label: "Email", value: applicant.email || "—" },
        { label: "Eligibility", value: applicant.eligibility.verdict },
        { label: "liveSendWired", value: String(P260_LIVE_PAPERWORK_SEND_HOOK.wired) },
        { label: "API", value: P260_LIVE_PAPERWORK_SEND_HOOK.apiPath },
      ],
      confirmLabel: "Open preview",
      writeTone: false,
    });
  }

  function requestLivePaperworkSend(
    applicant: CandidateOpsApplicant,
    previewMeta?: { requiresTypedConfirm?: boolean; typedConfirmReasons?: string[]; canSend?: boolean; detail?: string },
  ) {
    const requiresTypedConfirm = previewMeta?.requiresTypedConfirm !== false;
    const reasons = previewMeta?.typedConfirmReasons ?? [];
    queueConfirm({
      intent: {
        type: "send_paperwork_live",
        candidateId: applicant.candidateId,
        requiresTypedConfirm,
        typedConfirmReasons: reasons,
      },
      title: "Confirm live paperwork send",
      subtitle: applicant.displayName,
      warning:
        previewMeta?.canSend === false
          ? `Blocked: ${previewMeta.detail ?? "Not eligible for production send."}`
          : "Creates ONE production Dropbox Sign packet. Fail-closed when quota is 0. No bulk/auto/reminder.",
      details: [
        { label: "Candidate", value: applicant.displayName },
        { label: "Email", value: applicant.email || "—" },
        { label: "Template", value: applicant.paperworkTemplateKey || "onboarding_packet" },
        { label: "Source", value: "Job Command Center" },
        {
          label: "Typed confirm reasons",
          value: reasons.length ? reasons.join(", ") : "standard (phrase still required)",
        },
      ],
      confirmLabel: "Send production packet",
      writeTone: true,
      requiredPhrase: P260_CONFIRMATION_PHRASE,
      phraseHint:
        reasons.length > 0
          ? `Typed confirmation required: ${reasons.join(", ")}.`
          : "Type the confirmation phrase to authorize one production packet.",
    });
  }

  function requestReminderPreview(applicant: CandidateOpsApplicant) {
    queueConfirm({
      intent: { type: "send_reminder_preview", candidateId: applicant.candidateId },
      title: "Preview Reminder",
      subtitle: applicant.displayName,
      warning: "Reminder engine (P261) is not wired. Confirm records preview intent only — no send.",
      details: [
        { label: "Candidate", value: applicant.displayName },
        { label: "Envelope", value: applicant.signatureRequestId || "—" },
        { label: "Reminder count", value: String(applicant.paperworkPanel.reminderCount) },
      ],
      confirmLabel: "Confirm preview (no send)",
      writeTone: false,
    });
  }

  async function executeConfirm(typedPhrase?: string) {
    if (!pendingConfirm) return;
    const { intent } = pendingConfirm;
    setConfirmBusy(true);
    try {
      switch (intent.type) {
        case "assign_recruiter": {
          for (const candidateId of intent.candidateIds) {
            await persistWorkflowUpdate({
              candidateId,
              assignedRecruiter: intent.recruiter,
            });
          }
          setToast(`Assigned recruiter ${intent.recruiter} to ${intent.candidateIds.length}`);
          setSelectedIds(clearSelection());
          setReloadToken((n) => n + 1);
          break;
        }
        case "assign_dm": {
          for (const candidateId of intent.candidateIds) {
            await persistWorkflowUpdate({
              candidateId,
              assignedDM: intent.dm,
            });
          }
          setToast(`Assigned DM ${intent.dm} to ${intent.candidateIds.length}`);
          setSelectedIds(clearSelection());
          setReloadToken((n) => n + 1);
          break;
        }
        case "move_stage": {
          await persistWorkflowUpdate({
            candidateId: intent.candidateId,
            workflowStatus: intent.toStatus,
          });
          setToast(`Moved ${intent.candidateId} → ${intent.toStatus}`);
          setReloadToken((n) => n + 1);
          break;
        }
        case "send_paperwork_preview": {
          const applicant = findApplicant(intent.candidateId);
          if (applicant) {
            const preview = buildPaperworkPreviewModel(applicant);
            setPaperworkPreview({
              ...preview,
              liveSendWired: true,
              action: "preview_then_live_confirm",
              confirmLabel: "Continue to live send confirm",
              warning:
                "Preview only so far. Confirming continues to the P260 production send confirmation (typed phrase required). Cancel stops with no Dropbox write.",
            });
          }
          break;
        }
        case "send_paperwork_live": {
          const phrase = (typedPhrase ?? "").trim();
          const send = await P260_LIVE_PAPERWORK_SEND_HOOK.executeLiveSend({
            candidateId: intent.candidateId,
            confirmationPhrase: phrase,
            typedConfirmation: phrase,
            operatorConfirmed: true,
          });
          if (!send.ok) {
            setToast(send.error ?? "Live paperwork send failed");
            setReloadToken((n) => n + 1);
            break;
          }
          setToast(
            send.signatureRequestId
              ? `Paperwork sent — ${send.signatureRequestId}`
              : "Paperwork sent",
          );
          setReloadToken((n) => n + 1);
          break;
        }
        case "send_reminder_preview":
        case "resend_preview": {
          setToast("Preview confirmed — no reminder/resend sent (P261 deferred).");
          break;
        }
        case "preview_paperwork": {
          setToast(
            `Paperwork preview for ${intent.candidateIds.length} candidate(s) — no bulk send.`,
          );
          setSelectedIds(clearSelection());
          break;
        }
        case "preview_reminder": {
          setToast(
            `Reminder preview for ${intent.candidateIds.length} candidate(s) — no bulk send.`,
          );
          setSelectedIds(clearSelection());
          break;
        }
        case "export": {
          const rows = opsApplicants.filter((a) => intent.candidateIds.includes(a.candidateId));
          const csv = buildExportCsv(rows);
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `p259-export-${row.breezyJobId || "job"}.csv`;
          anchor.click();
          URL.revokeObjectURL(url);
          setToast(`Exported ${rows.length} row(s)`);
          setSelectedIds(clearSelection());
          break;
        }
        default:
          break;
      }
      setPendingConfirm(null);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Action failed");
    } finally {
      setConfirmBusy(false);
    }
  }

  function runRowAction(applicant: CandidateOpsApplicant, actionId: (typeof CANDIDATE_OPS_ROW_ACTIONS)[number]["id"]) {
    switch (actionId) {
      case "review":
      case "history":
        setReviewApplicant(applicant);
        break;
      case "send_paperwork":
        requestPaperworkPreview(applicant);
        break;
      case "reminder":
        requestReminderPreview(applicant);
        break;
      case "open_breezy":
        openExternal(
          buildBreezyCandidateDeepLink({
            companyId: breezyCompanyId,
            positionId: applicant.positionId || row.breezyJobId,
            candidateId: applicant.candidateId,
          }),
          "Breezy link needs company + position IDs",
        );
        break;
      case "open_dropbox":
        openExternal(
          buildDropboxSignManageLink(applicant.signatureRequestId),
          "No Dropbox Sign request on file",
        );
        break;
      case "move_stage":
        setReviewApplicant(applicant);
        setToast("Use Workflow panel in the drawer to pick a stage (confirm required).");
        break;
      case "assign_recruiter":
        setReviewApplicant(applicant);
        setToast("Pick a recruiter in the drawer — confirm required before write.");
        break;
      case "assign_dm":
        setReviewApplicant(applicant);
        setToast("Pick a DM in the drawer — confirm required before write.");
        break;
      case "email":
        openExternal(buildMailtoLink(applicant.email), "No email on file");
        break;
      case "call":
        openExternal(buildTelLink(applicant.phone), "No phone on file");
        break;
      case "sms":
        openExternal(buildSmsLink(applicant.phone), "No phone on file");
        break;
      case "copy_email":
        void handleCopy(applicant.email, "Email");
        break;
      case "copy_phone":
        void handleCopy(applicant.phone, "Phone");
        break;
      default:
        break;
    }
  }

  function runBulkAction(actionId: (typeof CANDIDATE_OPS_BULK_ACTIONS)[number]["id"]) {
    const gate = assertBulkActionAllowed(actionId);
    if (!gate.ok) {
      setToast(gate.reason);
      return;
    }
    if (!selectedIds.length) {
      setToast("Select at least one applicant");
      return;
    }

    if (actionId === "assign_recruiter") {
      const recruiter = window.prompt("Assign recruiter name:");
      if (recruiter) requestAssignRecruiter(selectedIds, recruiter);
      return;
    }
    if (actionId === "assign_dm") {
      const dm = window.prompt("Assign DM name:");
      if (dm) requestAssignDm(selectedIds, dm);
      return;
    }
    if (actionId === "preview_paperwork") {
      queueConfirm({
        intent: { type: "preview_paperwork", candidateIds: [...selectedIds] },
        title: "Bulk preview paperwork",
        subtitle: `${selectedIds.length} selected — preview only`,
        warning: "Bulk sends are blocked. This confirms a preview pass only.",
        details: [
          { label: "Selected", value: String(selectedIds.length) },
          { label: "allowsSend", value: "false" },
        ],
        confirmLabel: "Confirm preview (no send)",
        writeTone: false,
      });
      return;
    }
    if (actionId === "preview_reminder") {
      queueConfirm({
        intent: { type: "preview_reminder", candidateIds: [...selectedIds] },
        title: "Bulk preview reminder",
        subtitle: `${selectedIds.length} selected — preview only`,
        warning: "Bulk reminder sends are blocked (P261 deferred).",
        details: [{ label: "Selected", value: String(selectedIds.length) }],
        confirmLabel: "Confirm preview (no send)",
        writeTone: false,
      });
      return;
    }
    if (actionId === "export") {
      queueConfirm({
        intent: { type: "export", candidateIds: [...selectedIds] },
        title: "Export selected applicants",
        subtitle: "Downloads a local CSV — no remote write",
        warning: "Export is local-only. Confirm to download.",
        details: [{ label: "Rows", value: String(selectedIds.length) }],
        confirmLabel: "Confirm export",
        writeTone: false,
      });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Candidate operations engine"
    >
      <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-xl">
        <header className="shrink-0 border-b border-zinc-800 px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-200/80">
                Candidate operations engine
              </p>
              <h3 className="mt-0.5 truncate text-lg font-semibold text-zinc-50">{row.title}</h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                {[row.city, row.state].filter(Boolean).join(", ") || "—"}
                {" · "}
                {row.statusLabel}
                {row.breezyJobId ? (
                  <>
                    {" · "}
                    <span className="font-mono text-zinc-400">{row.breezyJobId}</span>
                  </>
                ) : null}
              </p>
              <p className="mt-1 text-[10px] text-zinc-600">
                Operator-initiated only · no automatic writes · no bulk sends · live writes (
                {CANDIDATE_OPS_WRITE_POLICY.allowedLiveWrites.join(", ")}) require confirm
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Close
            </button>
          </div>

          <nav className="mt-3 flex flex-wrap gap-1" aria-label="Job detail tabs">
            {JOB_COMMAND_CENTER_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                  tab === item.id
                    ? "bg-teal-500/15 text-teal-200 ring-1 ring-teal-500/30"
                    : "text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300"
                }`}
              >
                {item.id === "applicants" ? "Operations" : item.label}
              </button>
            ))}
          </nav>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {loading ? (
            <p className="mb-4 text-sm text-zinc-500">Loading candidate operations…</p>
          ) : null}
          {loadError ? (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
            >
              {loadError}
            </p>
          ) : null}
          {toast ? (
            <p className="mb-3 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-[11px] text-zinc-300">
              {toast}
            </p>
          ) : null}

          {ribbon ? (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10">
              <MetricCard label="Applicants" value={ribbon.applicants.toLocaleString()} />
              <MetricCard
                label="Qualified"
                value={ribbon.qualified.toLocaleString()}
                active={pipelineFilter === "Qualified"}
                onClick={() => openPipeline("Qualified")}
              />
              <MetricCard
                label="Paperwork Needed"
                value={ribbon.paperworkNeeded.toLocaleString()}
                active={pipelineFilter === "Paperwork Needed"}
                onClick={() => openPipeline("Paperwork Needed")}
              />
              <MetricCard
                label="Paperwork Sent"
                value={ribbon.paperworkSent.toLocaleString()}
                active={pipelineFilter === "Paperwork Sent"}
                onClick={() => openPipeline("Paperwork Sent")}
              />
              <MetricCard
                label="Signed"
                value={ribbon.signed.toLocaleString()}
                active={pipelineFilter === "Signed"}
                onClick={() => openPipeline("Signed")}
              />
              <MetricCard
                label="Ready for MEL"
                value={ribbon.readyForMel.toLocaleString()}
                active={pipelineFilter === "Ready for MEL"}
                onClick={() => openPipeline("Ready for MEL")}
              />
              <MetricCard
                label="Avg distance"
                value={
                  ribbon.averageDistanceMiles != null
                    ? `${ribbon.averageDistanceMiles.toLocaleString()} mi`
                    : "—"
                }
              />
              <MetricCard label="Newest" value={formatShortDate(ribbon.newestApplicantAt)} />
              <MetricCard label="Oldest" value={formatShortDate(ribbon.oldestApplicantAt)} />
              <MetricCard label="Last sync" value={formatShortDate(ribbon.lastSync)} />
            </div>
          ) : null}

          {tab === "overview" && overview ? (
            <section className="space-y-4">
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Job title" value={overview.jobTitle} />
                <Field label="Project" value={overview.project} />
                <Field label="City" value={overview.city || "—"} />
                <Field label="State" value={overview.state || "—"} />
                <Field label="Published status" value={overview.publishedStatus} />
                <Field label="Published / Draft" value={overview.publishedOrDraft} />
                <Field label="Date posted" value={formatShortDate(overview.datePosted)} />
                <Field label="Last synced" value={formatDate(overview.lastSynced)} />
                <Field label="Breezy job ID" value={overview.breezyJobId || "—"} />
                <Field label="Applicant count" value={overview.applicantCount.toLocaleString()} />
              </dl>
              <div>
                <p className={labelClass}>Description</p>
                <p className="mt-1 max-h-48 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-3 text-xs text-zinc-300 whitespace-pre-wrap">
                  {overview.description || "No description available."}
                </p>
              </div>
              {model?.dataNotes.length ? (
                <ul className="space-y-1 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-[11px] text-zinc-500">
                  {model.dataNotes.map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {tab === "applicants" ? (
            <section className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {CANDIDATE_OPS_QUICK_FILTERS.map((filter) => {
                  const active = quickFilters.includes(filter.id);
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => {
                        setQuickFilters((prev) => toggleQuickFilter(prev, filter.id));
                        setVisibleCount(LAZY_CHUNK);
                      }}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                        active
                          ? "bg-teal-500/15 text-teal-200 ring-1 ring-teal-500/30"
                          : "bg-zinc-950 text-zinc-500 ring-1 ring-zinc-800 hover:text-zinc-300"
                      }`}
                    >
                      {filter.label}
                    </button>
                  );
                })}
                {quickFilters.length || pipelineFilter ? (
                  <button
                    type="button"
                    className="rounded-md px-2 py-0.5 text-[10px] text-zinc-400 underline"
                    onClick={() => {
                      setQuickFilters([]);
                      setPipelineFilter(null);
                    }}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>

              {selectedIds.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2">
                  <span className="text-[11px] text-zinc-300">
                    {selectedIds.length} selected
                  </span>
                  {CANDIDATE_OPS_BULK_ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => runBulkAction(action.id)}
                      className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
                    >
                      {action.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="text-[10px] text-zinc-500 underline"
                    onClick={() => setSelectedIds(clearSelection())}
                  >
                    Clear selection
                  </button>
                </div>
              ) : null}

              {!filteredApplicants.length ? (
                <p className="text-sm text-zinc-500">
                  No applicants match the current filters
                  {pipelineFilter ? ` (pipeline: ${pipelineFilter})` : ""}.
                </p>
              ) : (
                <>
                  <div
                    ref={listRef}
                    className="overflow-auto rounded-xl border border-zinc-800/80"
                    style={{ maxHeight: viewportHeight }}
                    onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
                  >
                    <div className="sticky top-0 z-10 grid grid-cols-[28px_minmax(120px,1fr)_52px_64px_minmax(200px,1.4fr)] gap-2 border-b border-zinc-800 bg-zinc-950/95 px-3 py-2 text-[9px] uppercase tracking-wider text-zinc-500">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selection.allVisibleSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = selection.someVisibleSelected;
                          }}
                          onChange={() => {
                            setSelectedIds((prev) =>
                              selection.allVisibleSelected
                                ? prev.filter((id) => !visibleIds.includes(id))
                                : selectAllVisible(visibleIds, prev),
                            );
                          }}
                          aria-label="Select visible applicants"
                        />
                      </label>
                      <span>Name / intelligence</span>
                      <span>Score</span>
                      <span>Dist</span>
                      <span>Actions</span>
                    </div>
                    <div style={{ height: windowSlice.totalHeight, position: "relative" }}>
                      <div
                        style={{
                          position: "absolute",
                          top: windowSlice.offsetY,
                          left: 0,
                          right: 0,
                        }}
                      >
                        {visibleRows.map((applicant) => (
                          <div
                            key={applicant.candidateId}
                            className="grid grid-cols-[28px_minmax(120px,1fr)_52px_64px_minmax(200px,1.4fr)] gap-2 border-b border-zinc-800/50 px-3 py-1.5 text-[11px] hover:bg-zinc-800/25"
                            style={{ height: ROW_HEIGHT }}
                          >
                            <div className="flex items-start pt-1">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(applicant.candidateId)}
                                onChange={() =>
                                  setSelectedIds((prev) =>
                                    toggleSelection(prev, applicant.candidateId),
                                  )
                                }
                                aria-label={`Select ${applicant.displayName}`}
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-zinc-100">
                                {applicant.displayName}
                              </p>
                              <p className="truncate text-[10px] text-zinc-500">
                                {applicant.workflowStatus} · {applicant.paperworkStatus} ·{" "}
                                {applicant.recruiter}/{applicant.dm}
                              </p>
                              <div className="mt-0.5 flex flex-wrap gap-0.5">
                                {applicant.intelligence.badges.slice(0, 4).map((badge) => (
                                  <span
                                    key={badge.id}
                                    className="rounded bg-zinc-800/80 px-1 text-[8px] text-zinc-400"
                                  >
                                    {badge.label.split(" ")[0]} {badge.value}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="tabular-nums text-zinc-200 pt-1">
                              {applicant.hiringScore}
                            </div>
                            <div className="tabular-nums text-zinc-400 pt-1">
                              {applicant.distanceMiles != null
                                ? `${Math.round(applicant.distanceMiles)}`
                                : "—"}
                            </div>
                            <div className="flex flex-wrap content-start gap-1 overflow-hidden">
                              {CANDIDATE_OPS_ROW_ACTIONS.map((action) => (
                                <ActionButton
                                  key={action.id}
                                  label={action.label}
                                  disabled={
                                    (action.id === "open_dropbox" &&
                                      !applicant.signatureRequestId) ||
                                    (action.id === "email" && !applicant.email) ||
                                    ((action.id === "call" || action.id === "sms") &&
                                      !applicant.phone)
                                  }
                                  onClick={() => runRowAction(applicant, action.id)}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {visibleCount < filteredApplicants.length ? (
                    <button
                      type="button"
                      className="mt-2 text-[11px] text-teal-200 underline"
                      onClick={() => setVisibleCount((n) => n + LAZY_CHUNK)}
                    >
                      Load more ({visibleCount}/{filteredApplicants.length})
                    </button>
                  ) : (
                    <p className="mt-2 text-[10px] text-zinc-600">
                      Showing {filteredApplicants.length} applicant
                      {filteredApplicants.length === 1 ? "" : "s"} · virtualized ·{" "}
                      {opsApplicants.length} enriched
                    </p>
                  )}
                </>
              )}
            </section>
          ) : null}

          {tab === "pipeline" ? (
            <section>
              {!model?.pipeline.length ? (
                <p className="text-sm text-zinc-500">No pipeline stages to show for this job yet.</p>
              ) : (
                <ul className="space-y-2">
                  {model.pipeline.map((bucket) => {
                    const total = model.ribbon.applicants || 1;
                    const pct = Math.round((bucket.count / total) * 100);
                    const active = pipelineFilter === bucket.id;
                    return (
                      <li key={bucket.id}>
                        <button
                          type="button"
                          onClick={() => openPipeline(bucket.id)}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left ${
                            active
                              ? "border-teal-500/40 bg-teal-500/10"
                              : "border-zinc-800/80 bg-zinc-950/40 hover:border-zinc-600"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-zinc-200">{bucket.label}</span>
                            <span className="tabular-nums text-zinc-400">
                              {bucket.count.toLocaleString()} · {pct}%
                            </span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-teal-500/70"
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}

          {tab === "activity" ? (
            <section>
              {!model?.activity.length ? (
                <p className="text-sm text-zinc-500">
                  No recent activity recorded. Sync timestamps, workflow, paperwork, reminders, and
                  operator notes appear here when available.
                </p>
              ) : (
                <ol className="space-y-2">
                  {model.activity.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-zinc-100">{item.title}</p>
                        <p className="text-[11px] text-zinc-500">{formatDate(item.at)}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-400">{item.detail}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-600">
                        {item.kind}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ) : null}
        </div>
      </div>

      {reviewApplicant ? (
        <CandidateOperationsApplicantDrawer
          applicant={reviewApplicant}
          onClose={() => setReviewApplicant(null)}
          recruiterOptions={rosters.recruiters}
          dmOptions={rosters.dms}
          onRequestMoveStage={(toStatus) => requestMoveStage(reviewApplicant, toStatus)}
          onRequestAssignRecruiter={(recruiter) =>
            requestAssignRecruiter([reviewApplicant.candidateId], recruiter)
          }
          onRequestAssignDm={(dm) => requestAssignDm([reviewApplicant.candidateId], dm)}
          onPaperworkAction={(actionId) => {
            if (actionId === "view_envelope") {
              openExternal(
                buildDropboxSignManageLink(reviewApplicant.signatureRequestId),
                "No Dropbox Sign request on file",
              );
              return;
            }
            if (actionId === "send_paperwork" || actionId === "preview_email") {
              requestPaperworkPreview(reviewApplicant);
              return;
            }
            if (actionId === "send_reminder") {
              requestReminderPreview(reviewApplicant);
              return;
            }
            if (actionId === "resend") {
              queueConfirm({
                intent: {
                  type: "resend_preview",
                  candidateId: reviewApplicant.candidateId,
                },
                title: "Preview Resend",
                subtitle: reviewApplicant.displayName,
                warning: "Live resend is not wired (P260). Confirm records preview only.",
                details: [
                  { label: "Envelope", value: reviewApplicant.signatureRequestId || "—" },
                ],
                confirmLabel: "Confirm preview (no send)",
                writeTone: false,
              });
              return;
            }
            if (actionId === "download_audit") {
              queueConfirm({
                intent: {
                  type: "resend_preview",
                  candidateId: reviewApplicant.candidateId,
                },
                title: "Download audit (preview)",
                subtitle: "Audit download not wired to Dropbox API in P259",
                warning: "No remote audit fetch. Confirm acknowledges preview-only intent.",
                details: [
                  { label: "Envelope", value: reviewApplicant.signatureRequestId || "—" },
                ],
                confirmLabel: "Acknowledge (no download)",
                writeTone: false,
              });
            }
          }}
        />
      ) : null}

      {paperworkPreview ? (
        <HiringWorkspacePaperworkPreviewModal
          preview={paperworkPreview}
          onClose={() => setPaperworkPreview(null)}
          onConfirmPreview={() => {
            const applicant = findApplicant(paperworkPreview.candidateId);
            setPaperworkPreview(null);
            if (!applicant) {
              setToast("Candidate no longer in list — reload and retry.");
              return;
            }
            // Pre-send server preview refresh, then typed confirm for live send.
            void (async () => {
              try {
                const res = await fetch("/api/recruiting/job-command-center/send-paperwork", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    mode: "preview",
                    candidateId: applicant.candidateId,
                  }),
                });
                const data = (await res.json()) as {
                  ok?: boolean;
                  error?: string;
                  result?: {
                    canSend?: boolean;
                    detail?: string;
                    eligibility?: {
                      requiresTypedConfirm?: boolean;
                      typedConfirmReasons?: string[];
                    };
                  };
                };
                requestLivePaperworkSend(applicant, {
                  canSend: data.result?.canSend,
                  detail: data.result?.detail ?? data.error,
                  requiresTypedConfirm: data.result?.eligibility?.requiresTypedConfirm !== false,
                  typedConfirmReasons: data.result?.eligibility?.typedConfirmReasons ?? [],
                });
              } catch (err) {
                setToast(err instanceof Error ? err.message : "P260 preview failed");
              }
            })();
          }}
        />
      ) : null}

      {pendingConfirm ? (
        <CandidateOperationsConfirmModal
          title={pendingConfirm.title}
          subtitle={pendingConfirm.subtitle}
          warning={pendingConfirm.warning}
          details={pendingConfirm.details}
          confirmLabel={pendingConfirm.confirmLabel}
          writeTone={pendingConfirm.writeTone}
          requiredPhrase={pendingConfirm.requiredPhrase}
          phraseHint={pendingConfirm.phraseHint}
          busy={confirmBusy}
          onClose={() => (confirmBusy ? undefined : setPendingConfirm(null))}
          onConfirm={(typedPhrase) => void executeConfirm(typedPhrase)}
        />
      ) : null}
    </div>
  );
}
