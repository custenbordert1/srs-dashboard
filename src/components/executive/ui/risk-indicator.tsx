import { executiveSemantic, type ExecutiveSemanticTone } from "@/components/executive/ui/executive-tokens";

type RiskIndicatorProps = {
  tone?: ExecutiveSemanticTone;
  label: string;
  detail?: string;
};

export function RiskIndicator({ tone = "neutral", label, detail }: RiskIndicatorProps) {
  const styles = executiveSemantic[tone];
  return (
    <div className={["rounded-xl px-4 py-3", styles.bg].join(" ")}>
      <p className={["text-sm font-medium", styles.text].join(" ")}>{label}</p>
      {detail ? <p className="mt-1 text-sm leading-relaxed text-zinc-400">{detail}</p> : null}
    </div>
  );
}
