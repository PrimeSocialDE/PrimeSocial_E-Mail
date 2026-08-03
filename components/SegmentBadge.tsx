import { clsx } from "clsx";
import type { Segment } from "@/types";
import { SEGMENT_LABELS, SEGMENT_COLORS, SEGMENT_DOT_COLORS } from "@/types";

interface Props {
  segment: Segment | null;
  showDot?: boolean;
  size?: "sm" | "md";
}

export function SegmentBadge({ segment, showDot = true, size = "md" }: Props) {
  if (!segment) return <span className="text-gray-600 text-xs">–</span>;

  return (
    <span className={clsx(
      "inline-flex items-center gap-1.5 rounded-full font-medium",
      size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
      SEGMENT_COLORS[segment]
    )}>
      {showDot && <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", SEGMENT_DOT_COLORS[segment])} />}
      {SEGMENT_LABELS[segment]}
    </span>
  );
}
