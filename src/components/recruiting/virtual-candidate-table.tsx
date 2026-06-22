"use client";

import { Fragment, useCallback, useRef, useState, type ReactNode } from "react";

/** Must match `CANDIDATE_TABLE_ROW_HEIGHT_PX` in candidates-section (virtual spacer math). */
export const CANDIDATE_TABLE_ROW_HEIGHT_PX = 54;
const OVERSCAN = 6;

type VirtualCandidateTableProps<T> = {
  rows: T[];
  colSpan: number;
  maxHeightClass?: string;
  header: ReactNode;
  renderRow: (row: T, index: number) => ReactNode;
  getRowKey: (row: T) => string;
};

export function VirtualCandidateTable<T>({
  rows,
  colSpan,
  maxHeightClass = "max-h-[min(70vh,960px)]",
  header,
  renderRow,
  getRowKey,
}: VirtualCandidateTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);

  const onScroll = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    setScrollTop(node.scrollTop);
    setViewportHeight(node.clientHeight);
  }, []);

  const startIndex = Math.max(0, Math.floor(scrollTop / CANDIDATE_TABLE_ROW_HEIGHT_PX) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / CANDIDATE_TABLE_ROW_HEIGHT_PX) + OVERSCAN * 2;
  const endIndex = Math.min(rows.length, startIndex + visibleCount);
  const topSpacer = startIndex * CANDIDATE_TABLE_ROW_HEIGHT_PX;
  const bottomSpacer = Math.max(0, (rows.length - endIndex) * CANDIDATE_TABLE_ROW_HEIGHT_PX);
  const visibleRows = rows.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className={`overflow-auto ${maxHeightClass}`}
    >
      <table className="min-w-[960px] w-full table-fixed text-left">
        {header}
        <tbody className="divide-y divide-zinc-800/40">
          {topSpacer > 0 ? (
            <tr aria-hidden>
              <td colSpan={colSpan} style={{ height: topSpacer, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {visibleRows.map((row, offset) => (
            <Fragment key={getRowKey(row)}>{renderRow(row, startIndex + offset)}</Fragment>
          ))}
          {bottomSpacer > 0 ? (
            <tr aria-hidden>
              <td colSpan={colSpan} style={{ height: bottomSpacer, padding: 0, border: 0 }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export { CANDIDATE_TABLE_ROW_HEIGHT_PX as ROW_HEIGHT_PX };
