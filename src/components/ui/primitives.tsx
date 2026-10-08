"use client";

import * as React from "react";
import { Tabs as TabsP, Switch as SwitchP, Checkbox as CheckboxP, Slider as SliderP, Select as SelectP } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Tabs ---------------------------------------------------------------------
export const Tabs = TabsP.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsP.List>) {
  return <TabsP.List className={cn("flex items-center gap-1 border-b border-line", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsP.Trigger>) {
  return (
    <TabsP.Trigger
      className={cn(
        "-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-sm font-medium text-muted transition-colors hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}
export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsP.Content>) {
  return <TabsP.Content className={cn("focus:outline-none", className)} {...props} />;
}

// Segmented control ---------------------------------------------------------
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" className={cn("inline-flex rounded-md border border-line bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[5px] px-2.5 font-medium text-muted transition-colors hover:text-fg aria-checked:bg-surface aria-checked:text-fg aria-checked:shadow-sm",
            size === "sm" ? "h-6 text-xs" : "h-7 text-sm",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Switch -------------------------------------------------------------------
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchP.Root>) {
  return (
    <SwitchP.Root
      className={cn(
        "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-line-strong bg-surface-3 transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <SwitchP.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-fg/80 transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent-fg" />
    </SwitchP.Root>
  );
}

// Checkbox -----------------------------------------------------------------
export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxP.Root>) {
  return (
    <CheckboxP.Root
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-line-strong bg-surface transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg",
        className,
      )}
      {...props}
    >
      <CheckboxP.Indicator>
        <Check className="size-3" strokeWidth={3} />
      </CheckboxP.Indicator>
    </CheckboxP.Root>
  );
}

// Slider -------------------------------------------------------------------
export function Slider({ className, ...props }: React.ComponentProps<typeof SliderP.Root>) {
  return (
    <SliderP.Root className={cn("relative flex h-5 w-full touch-none select-none items-center", className)} {...props}>
      <SliderP.Track className="relative h-1 grow rounded-full bg-surface-3">
        <SliderP.Range className="absolute h-full rounded-full bg-accent" />
      </SliderP.Track>
      {(props.value ?? props.defaultValue ?? [0]).map((_, i) => (
        <SliderP.Thumb
          key={i}
          className="block size-3.5 rounded-full border-2 border-accent bg-surface shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
      ))}
    </SliderP.Root>
  );
}

// Select (Radix) -----------------------------------------------------------
export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  size = "md",
  ariaLabel,
}: {
  value: string | undefined;
  onValueChange: (v: string) => void;
  options: { value: string; label: React.ReactNode }[];
  placeholder?: string;
  className?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  return (
    <SelectP.Root value={value} onValueChange={onValueChange}>
      <SelectP.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-2.5 text-fg hover:border-line-strong focus:border-accent focus:outline-none data-[placeholder]:text-faint",
          size === "sm" ? "h-7 text-sm" : "h-8 text-base",
          className,
        )}
      >
        <SelectP.Value placeholder={placeholder} />
        <SelectP.Icon>
          <ChevronDown className="size-4 text-faint" />
        </SelectP.Icon>
      </SelectP.Trigger>
      <SelectP.Portal>
        <SelectP.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-pop"
        >
          <SelectP.Viewport>
            {options.map((o) => (
              <SelectP.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-default select-none items-center rounded-md py-1.5 pl-7 pr-2 text-base outline-none data-[highlighted]:bg-surface-2"
              >
                <SelectP.ItemIndicator className="absolute left-2">
                  <Check className="size-3.5 text-accent" />
                </SelectP.ItemIndicator>
                <SelectP.ItemText>{o.label}</SelectP.ItemText>
              </SelectP.Item>
            ))}
          </SelectP.Viewport>
        </SelectP.Content>
      </SelectP.Portal>
    </SelectP.Root>
  );
}
