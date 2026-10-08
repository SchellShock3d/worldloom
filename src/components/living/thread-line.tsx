import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  escalating: "var(--ember)",
  active: "var(--accent)",
  dormant: "var(--text-faint)",
  paused: "var(--text-faint)",
  resolved: "var(--brass)",
  failed: "var(--text-faint)",
};

/** Woven progress track: dashed warp, solid weft up to the knot (current progress), stage ticks. */
export function ThreadLine({ progress, status, stages = 0, stageIndex = 0, className }: { progress: number; status: string; stages?: number; stageIndex?: number; className?: string }) {
  const color = STATUS_COLOR[status] ?? "var(--accent)";
  return (
    <div className={cn("thread-line", className)} style={{ "--thread-color": color } as React.CSSProperties} role="meter" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${progress}% · ${status}`}>
      <div className="thread-fill" style={{ width: `${progress}%` }} />
      {stages > 1 &&
        Array.from({ length: stages - 1 }, (_, i) => {
          const at = ((i + 1) / stages) * 100;
          return <span key={i} className="absolute top-[2px] h-[6px] w-px" style={{ left: `${at}%`, background: i < stageIndex ? color : "var(--line-strong)" }} aria-hidden />;
        })}
      <div className="thread-knot" style={{ left: `${Math.max(1, Math.min(99, progress))}%` }} />
    </div>
  );
}

export function threadStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
