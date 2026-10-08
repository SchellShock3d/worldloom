"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!bg-surface !border !border-line !text-fg !rounded-lg !shadow-pop !font-sans",
          description: "!text-muted",
          actionButton: "!bg-accent !text-accent-fg",
          cancelButton: "!bg-surface-3 !text-fg",
          error: "!border-ember/40",
        },
      }}
    />
  );
}
