"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createDemoWorldAction } from "@/server/actions/seed";

export function DemoWorldButton({ variant = "secondary", label = "Explore a demo world" }: { variant?: "secondary" | "ghost" | "primary"; label?: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  return (
    <Button
      variant={variant}
      loading={pending}
      onClick={async () => {
        setPending(true);
        const res = await createDemoWorldAction();
        setPending(false);
        if (!res.ok) return toast.error(res.error);
        toast.success("Demo world created", { description: "The Shattered Crown is ready to explore." });
        router.push(`/w/${res.data.worldId}`);
      }}
    >
      {!pending && <Compass />} {label}
    </Button>
  );
}
