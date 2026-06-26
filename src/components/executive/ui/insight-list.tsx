import Link from "next/link";

export type InsightListItem = {
  id: string;
  text: string;
  href?: string;
  detail?: string;
};

type InsightListProps = {
  items: InsightListItem[];
  emptyMessage?: string;
  bulletClassName?: string;
};

export function InsightList({
  items,
  emptyMessage = "Nothing flagged right now.",
  bulletClassName = "text-teal-400/80",
}: InsightListProps) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.id} className="flex gap-2.5 text-sm leading-snug text-zinc-300">
          <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current ${bulletClassName}`} aria-hidden />
          <span>
            {item.href ? (
              <Link href={item.href} className="hover:text-teal-200 hover:underline">
                {item.text}
              </Link>
            ) : (
              item.text
            )}
            {item.detail ? <span className="mt-0.5 block text-xs text-zinc-500">{item.detail}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
