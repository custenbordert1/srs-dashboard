"use client";

import type { JobDraft, JobVariantQueueStatus } from "@/lib/job-management/job-draft-types";
import {
  filterVariantDrafts,
  type JobVariantQueueTab,
} from "@/lib/job-management/job-variant-queue";

type JobVariantQueueSectionProps = {
  drafts: JobDraft[];
  onEdit: (draftId: string) => void;
  onPush: (draftId: string) => void;
  onRefresh: () => Promise<void>;
};

const TABS: Array<{ id: JobVariantQueueTab; label: string }> = [
  { id: "pending", label: "Pending variants" },
  { id: "approved", label: "Approved" },
  { id: "published", label: "Published" },
  { id: "archived", label: "Archived" },
];

async function patchQueue(draftId: string, queueStatus: JobVariantQueueStatus): Promise<string | null> {
  const res = await fetch(`/api/job-management/drafts/${draftId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queueStatus }),
  });
  const parsed = (await res.json()) as { ok?: boolean; error?: string };
  if (!parsed.ok) return parsed.error ?? "Queue update failed";
  return null;
}

export function JobVariantQueueSection({
  drafts,
  onEdit,
  onPush,
  onRefresh,
}: JobVariantQueueSectionProps) {
  const variantDrafts = drafts.filter((draft) => draft.variant);
  if (variantDrafts.length === 0) return null;

  return (
    <section className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 sm:p-5">
      <header className="mb-4">
        <h3 className="text-base font-semibold text-zinc-50">Ad variant review queue</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Review wording variants before push. Approve, edit, publish, or archive — no auto-publish.
        </p>
      </header>

      <div className="space-y-4">
        {TABS.map((tab) => {
          const rows = filterVariantDrafts(variantDrafts, tab.id);
          return (
            <div key={tab.id} className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {tab.label} ({rows.length})
              </p>
              {rows.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600">None in this lane.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {rows.map((draft) => (
                    <li
                      key={draft.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-100">{draft.title}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {draft.variant?.generatedTitle} · {draft.variant?.cityTarget},{" "}
                          {draft.usState} · DM {draft.variant?.dmOwner} · #
                          {draft.variant?.variantIndex}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <QueueButton label="Edit" onClick={() => onEdit(draft.id)} />
                        {draft.variant?.queueStatus === "pending" ? (
                          <QueueButton
                            label="Approve"
                            onClick={() =>
                              void patchQueue(draft.id, "approved").then(async (err) => {
                                if (!err) await onRefresh();
                              })
                            }
                          />
                        ) : null}
                        {draft.variant?.queueStatus === "approved" && draft.status === "draft" ? (
                          <QueueButton label="Push" onClick={() => onPush(draft.id)} />
                        ) : null}
                        {draft.variant?.queueStatus !== "archived" &&
                        draft.variant?.queueStatus !== "rejected" ? (
                          <QueueButton
                            label="Archive"
                            onClick={() =>
                              void patchQueue(draft.id, "archived").then(async (err) => {
                                if (!err) await onRefresh();
                              })
                            }
                          />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function QueueButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-300 hover:bg-zinc-800"
    >
      {label}
    </button>
  );
}
