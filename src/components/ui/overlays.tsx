"use client";

import * as React from "react";
import { Dialog as D, DropdownMenu as DM, Popover as P, Tooltip as T, AlertDialog as AD, ContextMenu as CM, HoverCard as HC } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  size = "md",
  hideClose,
  ...props
}: React.ComponentProps<typeof D.Content> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  hideClose?: boolean;
}) {
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px] data-[state=open]:animate-in" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-[8vh] z-50 flex max-h-[84vh] w-[calc(100vw-2rem)] -translate-x-1/2 flex-col rounded-xl border border-line bg-surface shadow-pop data-[state=open]:animate-in focus:outline-none",
          widths[size],
          className,
        )}
        {...props}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-2">
            <div className="min-w-0">
              {title ? <D.Title className="font-serif text-xl font-semibold leading-tight">{title}</D.Title> : <D.Title className="sr-only">Dialog</D.Title>}
              {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">Dialog</D.Description>}
            </div>
            {!hideClose && (
              <D.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close">
                  <X />
                </Button>
              </D.Close>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mt-5 flex items-center justify-end gap-2", className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Sheet (side drawer)
// ---------------------------------------------------------------------------

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;

export function SheetContent({
  className,
  children,
  title,
  side = "right",
  width = "md",
  ...props
}: React.ComponentProps<typeof D.Content> & { title?: React.ReactNode; side?: "right" | "left"; width?: "sm" | "md" | "lg" }) {
  const widths = { sm: "w-[min(100vw,22rem)]", md: "w-[min(100vw,30rem)]", lg: "w-[min(100vw,44rem)]" };
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />
      <D.Content
        className={cn(
          "fixed top-0 z-50 flex h-full flex-col border-line bg-surface shadow-pop animate-drawer focus:outline-none",
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          widths[width],
          className,
        )}
        {...props}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <D.Title className="font-serif text-lg font-semibold">{title}</D.Title>
          <D.Description className="sr-only">Panel</D.Description>
          <D.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X />
            </Button>
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

// ---------------------------------------------------------------------------
// Dropdown menu
// ---------------------------------------------------------------------------

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export const DropdownMenuGroup = DM.Group;
export const DropdownMenuSub = DM.Sub;

const menuContent =
  "z-50 min-w-44 overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-pop data-[state=open]:animate-in";
const menuItem =
  "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-base text-fg outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted";

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content sideOffset={sideOffset} className={cn(menuContent, className)} {...props} />
    </DM.Portal>
  );
}

export function DropdownMenuItem({
  className,
  danger,
  ...props
}: React.ComponentProps<typeof DM.Item> & { danger?: boolean }) {
  return <DM.Item className={cn(menuItem, danger && "text-ember [&_svg]:text-ember data-[highlighted]:bg-ember-soft", className)} {...props} />;
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("px-2 pt-1.5 pb-1 text-xs font-medium text-faint", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />;
}

export function DropdownMenuSubTrigger({ className, ...props }: React.ComponentProps<typeof DM.SubTrigger>) {
  return <DM.SubTrigger className={cn(menuItem, "data-[state=open]:bg-surface-2", className)} {...props} />;
}

export function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof DM.SubContent>) {
  return (
    <DM.Portal>
      <DM.SubContent className={cn(menuContent, className)} {...props} />
    </DM.Portal>
  );
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

export const ContextMenu = CM.Root;
export const ContextMenuTrigger = CM.Trigger;
export function ContextMenuContent({ className, ...props }: React.ComponentProps<typeof CM.Content>) {
  return (
    <CM.Portal>
      <CM.Content className={cn(menuContent, className)} {...props} />
    </CM.Portal>
  );
}
export function ContextMenuItem({ className, danger, ...props }: React.ComponentProps<typeof CM.Item> & { danger?: boolean }) {
  return <CM.Item className={cn(menuItem, danger && "text-ember [&_svg]:text-ember", className)} {...props} />;
}
export function ContextMenuSeparator() {
  return <CM.Separator className="-mx-1 my-1 h-px bg-line" />;
}

// ---------------------------------------------------------------------------
// Popover, hover card, tooltip
// ---------------------------------------------------------------------------

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;
export function PopoverContent({ className, sideOffset = 6, align = "start", ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={sideOffset}
        align={align}
        className={cn("z-50 rounded-lg border border-line bg-surface p-3 shadow-pop data-[state=open]:animate-in focus:outline-none", className)}
        {...props}
      />
    </P.Portal>
  );
}

export const HoverCard = HC.Root;
export const HoverCardTrigger = HC.Trigger;
export function HoverCardContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof HC.Content>) {
  return (
    <HC.Portal>
      <HC.Content
        sideOffset={sideOffset}
        className={cn("z-50 w-80 rounded-lg border border-line bg-surface p-3 shadow-pop data-[state=open]:animate-in", className)}
        {...props}
      />
    </HC.Portal>
  );
}

export const TooltipProvider = T.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
  shortcut,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  shortcut?: string;
}) {
  return (
    <T.Root delayDuration={350}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-[60] flex items-center gap-2 rounded-md bg-fg px-2 py-1 text-xs font-medium text-bg shadow-pop data-[state=delayed-open]:animate-in"
        >
          {content}
          {shortcut && <span className="opacity-60">{shortcut}</span>}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog for destructive actions
// ---------------------------------------------------------------------------

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  destructive = true,
  open,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  return (
    <AD.Root open={isOpen} onOpenChange={setOpen}>
      {trigger && <AD.Trigger asChild>{trigger}</AD.Trigger>}
      <AD.Portal>
        <AD.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />
        <AD.Content className="fixed left-1/2 top-[20vh] z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-line bg-surface p-5 shadow-pop data-[state=open]:animate-in">
          <AD.Title className="font-serif text-lg font-semibold">{title}</AD.Title>
          {description ? (
            <AD.Description className="mt-2 text-sm text-muted">{description}</AD.Description>
          ) : (
            <AD.Description className="sr-only">{title}</AD.Description>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <AD.Cancel asChild>
              <Button variant="ghost">Cancel</Button>
            </AD.Cancel>
            <Button
              variant={destructive ? "danger" : "primary"}
              loading={pending}
              onClick={async () => {
                setPending(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } finally {
                  setPending(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}
