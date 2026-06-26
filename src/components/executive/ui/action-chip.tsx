import { executiveGlass, executiveMotion } from "@/components/executive/ui/executive-tokens";

export type ActionChipVariant = "prompt" | "followup" | "ghost";

const VARIANT_CLASS: Record<ActionChipVariant, string> = {
  prompt:
    "bg-sky-500/10 text-sky-100 ring-sky-500/20 hover:bg-sky-500/15 hover:ring-sky-400/30",
  followup:
    "bg-zinc-900/50 text-zinc-300 ring-white/[0.06] hover:bg-zinc-800/70 hover:text-zinc-100",
  ghost: "bg-zinc-800/30 text-zinc-300 ring-transparent hover:bg-zinc-800/60",
};

type ActionChipProps = {
  children: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: ActionChipVariant;
};

export function ActionChip({ children, onClick, disabled, variant = "prompt" }: ActionChipProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        executiveGlass.chip,
        executiveMotion.chip,
        "px-3.5 py-1.5 text-xs font-medium ring-1 ring-inset",
        "disabled:cursor-not-allowed disabled:opacity-40",
        VARIANT_CLASS[variant],
      ].join(" ")}
    >
      {children}
    </button>
  );
}
