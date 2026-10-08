"use client";

import { FastForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorld } from "@/components/shell/world-context";

export function AdvanceButton() {
  const w = useWorld();
  return (
    <Button variant="secondary" onClick={() => w.openAdvance()}>
      <FastForward /> Advance time
    </Button>
  );
}
