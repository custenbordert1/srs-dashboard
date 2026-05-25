/** Checkbox column width — keep in sync with table colgroup / sticky offsets. */
export const CANDIDATE_TABLE_STICKY_CHECKBOX_PX = 40;
/** Identity column width (name, workflow, ownership, signals). */
export const CANDIDATE_TABLE_STICKY_IDENTITY_PX = 272;

const stickyBase =
  "sticky z-[3] backdrop-blur-sm transition-colors duration-150";

export function stickyCheckboxHeaderClass(baseThClass: string): string {
  return `${baseThClass} ${stickyBase} left-0 z-[4] bg-zinc-900/95 after:pointer-events-none after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-zinc-800/80`;
}

export function stickyIdentityHeaderClass(baseThClass: string): string {
  return `${baseThClass} ${stickyBase} left-[40px] z-[4] bg-zinc-900/95 after:pointer-events-none after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-zinc-800/80 shadow-[4px_0_12px_-2px_rgba(0,0,0,0.35)]`;
}

export function stickyCheckboxCellClass(
  baseTdClass: string,
  opts: { selected: boolean; rowBg: string },
): string {
  const bg = opts.selected ? "bg-teal-500/10" : opts.rowBg;
  return `${baseTdClass} ${stickyBase} left-0 ${bg} group-hover:bg-zinc-800/50 ${
    opts.selected ? "group-hover:bg-teal-500/14" : ""
  } after:pointer-events-none after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-zinc-800/60`;
}

export function stickyIdentityCellClass(
  baseTdClass: string,
  opts: { selected: boolean; rowBg: string },
): string {
  const bg = opts.selected ? "bg-teal-500/10" : opts.rowBg;
  return `${baseTdClass} ${stickyBase} left-[40px] ${bg} group-hover:bg-zinc-800/50 ${
    opts.selected ? "group-hover:bg-teal-500/14 ring-1 ring-inset ring-teal-500/25" : ""
  } after:pointer-events-none after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-zinc-800/60 shadow-[4px_0_12px_-2px_rgba(0,0,0,0.45)]`;
}
