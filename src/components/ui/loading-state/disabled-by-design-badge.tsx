type DisabledByDesignBadgeProps = {
  label?: string;
  mode?: "disabled" | "manual" | "observation";
};

const MODE_COPY = {
  disabled: "Disabled by design",
  manual: "Manual mode",
  observation: "Observation mode",
} as const;

export function DisabledByDesignBadge({
  label,
  mode = "disabled",
}: DisabledByDesignBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-zinc-600/50 bg-zinc-800/60 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
      {MODE_COPY[mode]}
      {label ? <span className="text-zinc-500">· {label}</span> : null}
    </span>
  );
}
