import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-2xs font-semibold [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-surface-3 text-muted",
        accent: "bg-accent-soft text-accent",
        brass: "bg-brass-soft text-brass",
        arcane: "bg-arcane-soft text-arcane",
        ember: "bg-ember-soft text-ember",
        outline: "border border-line text-muted",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** A bordered region. Not every grouping needs one; use for interactive or dense blocks. */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-surface", className)} {...props} />;
}

export function PanelHeader({
  title,
  action,
  icon,
  className,
  description,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-4 pt-3.5 pb-2", className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-md font-semibold text-fg [&_svg]:size-4 [&_svg]:text-faint">
          {icon}
          {title}
        </h2>
        {description && <p className="mt-0.5 text-xs text-faint">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-2", className)}>
      <h3 className="text-sm font-semibold text-muted">{children}</h3>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  icon,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 font-serif text-3xl font-semibold leading-tight tracking-[-0.01em] [&_svg]:size-6 [&_svg]:text-faint">
          {icon}
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-[68ch] text-md text-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
  compact,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-line text-center",
        compact ? "gap-1.5 px-4 py-6" : "gap-2 px-6 py-12",
        className,
      )}
    >
      {icon && <div className="mb-1 text-faint [&_svg]:size-6">{icon}</div>}
      <p className={cn("font-medium text-fg", compact ? "text-sm" : "text-md")}>{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-3", className)} />;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-line", className)} />;
}

/** Small key/value row used in entity sidebars. */
export function Meta({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[7.5rem_1fr] gap-3 py-1.5 text-sm", className)}>
      <dt className="text-faint">{label}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </div>
  );
}

/** Horizontal meter, e.g. reputation or a metric. */
export function Meter({
  value,
  min = 0,
  max = 100,
  tone = "accent",
  className,
  label,
}: {
  value: number;
  min?: number;
  max?: number;
  tone?: "accent" | "brass" | "arcane" | "ember";
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const colors = { accent: "bg-accent", brass: "bg-brass", arcane: "bg-arcane", ember: "bg-ember" };
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
      role="meter"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={label}
    >
      <div className={cn("h-full rounded-full", colors[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}
