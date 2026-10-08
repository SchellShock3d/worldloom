"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Create a new world from a Worldloom backup file. */
export function ImportWorld({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const run = async (file: File) => {
    setPending(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/import", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) return void toast.error(data.error ?? "Import failed");
    toast.success(data.skipped ? `World imported (${data.skipped} damaged records skipped)` : "World imported");
    router.push(`/w/${data.worldId}`);
  };
  return (
    <>
      <Button variant={compact ? "ghost" : "secondary"} className="self-start" loading={pending} onClick={() => input.current?.click()}>
        <Upload /> {pending ? "Importing…" : "Import from a backup"}
      </Button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void run(f);
        }}
      />
    </>
  );
}
