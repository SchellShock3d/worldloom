import { cn } from "@/lib/utils";

/** Loom mark: three warp threads crossed by a weft that rises like a horizon. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-6", className)} fill="none" aria-hidden>
      <path d="M8 5v22M16 5v22M24 5v22" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 20c4-6 8-6 12 0s8 6 12 0" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="11" r="2.4" fill="var(--brass)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-serif text-xl font-semibold tracking-[-0.01em]">Worldloom</span>
    </span>
  );
}
