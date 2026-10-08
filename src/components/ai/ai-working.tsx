"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shown while a long AI job runs, so a minute of waiting doesn't feel like a frozen app.
 * `live` false (the built-in engine) finishes in a moment, so nothing is shown.
 */
export function AiWorking({ active, live, what = "Claude is drafting", typical = "about a minute", className }: { active: boolean; live: boolean; what?: string; typical?: string; className?: string }) {
  const [seconds, setSeconds] = React.useState(0);
  React.useEffect(() => {
    if (!active) return;
    setSeconds(0);
    const started = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [active]);
  if (!active || !live) return null;
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <p className={cn("text-sm text-muted", className)} role="status" aria-live="polite">
      {what}… <span className="tabular text-fg">{clock}</span>
      <span className="text-faint">
        {" "}
        · usually {typical}. {seconds > 20 ? "You can keep working in another tab." : ""}
      </span>
    </p>
  );
}
