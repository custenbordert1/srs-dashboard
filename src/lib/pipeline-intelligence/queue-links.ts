import type { RecruiterQuickFilterId } from "@/lib/recruiter-action-queue-filters";

export type PipelineQueueLinkId =
  | "needs-review"
  | "contact-today"
  | "interview-needed"
  | "paperwork-pending"
  | "ready-mel";

export type PipelineQueueLink = {
  id: PipelineQueueLinkId;
  label: string;
  filter: RecruiterQuickFilterId;
  href: string;
};

export const PIPELINE_QUEUE_LINKS: PipelineQueueLink[] = [
  {
    id: "needs-review",
    label: "Needs Review",
    filter: "needs-review",
    href: "/?tab=candidates&queue=needs-review",
  },
  {
    id: "contact-today",
    label: "Contact Today",
    filter: "needs-follow-up",
    href: "/?tab=candidates&queue=needs-follow-up",
  },
  {
    id: "interview-needed",
    label: "Interview Needed",
    filter: "interview-needed",
    href: "/?tab=candidates&queue=interview-needed",
  },
  {
    id: "paperwork-pending",
    label: "Paperwork Pending",
    filter: "paperwork-pending",
    href: "/?tab=candidates&queue=paperwork-pending",
  },
  {
    id: "ready-mel",
    label: "Ready For MEL",
    filter: "ready-mel",
    href: "/?tab=candidates&queue=ready-mel",
  },
];

export function pipelineQueueHref(filter: RecruiterQuickFilterId): string {
  return `/?tab=candidates&queue=${encodeURIComponent(filter)}`;
}

export function parsePipelineQueueParam(value: string | null): RecruiterQuickFilterId | null {
  if (!value) return null;
  const allowed: RecruiterQuickFilterId[] = [
    "all",
    "my-owned",
    "needs-follow-up",
    "no-response",
    "paperwork-pending",
    "interview-needed",
    "ready-mel",
    "priority",
    "needs-review",
  ];
  return allowed.includes(value as RecruiterQuickFilterId) ? (value as RecruiterQuickFilterId) : null;
}
