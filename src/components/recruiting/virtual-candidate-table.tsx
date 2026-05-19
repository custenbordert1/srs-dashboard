"use client";

import { Fragment, useCallback, useRef, useState, type ReactNode } from "react";

const ROW_HEIGHT_PX = 34;
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

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT_PX) + OVERSCAN * 2;
  const endIndex = Math.min(rows.length, startIndex + visibleCount);
  const topSpacer = startIndex * ROW_HEIGHT_PX;
  const bottomSpacer = Math.max(0, (rows.length - endIndex) * ROW_HEIGHT_PX);
  const visibleRows = rows.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className={`overflow-auto ${maxHeightClass}`}
    >
      <table className="min-w-[1580px] w-full text-left">
        {header}
        <tbody className="divide-y divide-zinc-800/60">
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

export { ROW_HEIGHT_PX };
