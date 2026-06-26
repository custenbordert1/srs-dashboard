export type ExecutiveButtonVariant = "primary" | "secondary" | "ghost";

const VARIANT_CLASS: Record<ExecutiveButtonVariant, string> = {
  primary: "bg-sky-600 text-white hover:bg-sky-500 border-transparent",
  secondary: "border-zinc-700/80 bg-zinc-900/40 text-zinc-200 hover:bg-zinc-800/80",
  ghost: "border-transparent text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200",
};

type ExecutiveButtonProps = {
  children: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  variant?: ExecutiveButtonVariant;
};

export function ExecutiveButton({
  children,
  onClick,
  type = "button",
  disabled,
  variant = "secondary",
}: ExecutiveButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-50",
        VARIANT_CLASS[variant],
      ].join(" ")}
    >
      {children}
    </button>
  );
}
