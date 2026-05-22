import type { RecruitingTabSourceKind } from "@/lib/recruiting-tab-source-labels";

const TAG_STYLES: Record<RecruitingTabSourceKind, string> = {
  "live-breezy": "text-teal-400/90",
  "live-mel": "text-sky-400/90",
  "live-workforce": "text-violet-400/90",
  "archive-sheet": "text-amber-400/90",
  demo: "text-zinc-500",
  system: "text-zinc-500",
  mixed: "text-amber-400/80",
  executive: "text-violet-400/90",
};

type RecruitingSourceNavBadgeProps = {
  sourceTag: string;
  kind: RecruitingTabSourceKind;
  active?: boolean;
};

export function RecruitingSourceNavBadge({
  sourceTag,
  kind,
  active = false,
}: RecruitingSourceNavBadgeProps) {
  return (
    <span
      className={[
        "text-[10px] font-normal leading-tight",
        active ? TAG_STYLES[kind] : "text-zinc-500",
      ].join(" ")}
    >
      {sourceTag}
    </span>
  );
}
