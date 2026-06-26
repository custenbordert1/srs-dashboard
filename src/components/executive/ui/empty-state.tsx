import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  children?: ReactNode;
  centered?: boolean;
  icon?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({
  title,
  description,
  children,
  centered = false,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className={["py-8", centered ? "flex flex-col items-center text-center" : ""].join(" ")}>
      {icon ? (
        <div className={["mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800/50 text-zinc-400", centered ? "" : ""].join(" ")}>
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {description ? (
        <p className={`mt-1.5 max-w-md text-xs leading-relaxed text-zinc-500 ${centered ? "mx-auto" : ""}`}>
          {description}
        </p>
      ) : null}
      {action ? <div className={`mt-4 ${centered ? "" : ""}`}>{action}</div> : null}
      {children ? <div className={`mt-4 w-full ${centered ? "max-w-2xl" : ""}`}>{children}</div> : null}
    </div>
  );
}
