"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CircleCheck, Hourglass, MessageSquareText, Sparkles, TriangleAlert, OctagonAlert, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { TypeIcon } from "@/components/entity/type-icon";
import { useWorld } from "@/components/shell/world-context";
import { AiWorking } from "@/components/ai/ai-working";
import { continuityAction } from "@/server/actions/ai";
import type { Insight } from "@/server/services/insights";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  dates: "Timeline conflict",
  dead_appears: "Dead but active",
  duplicate: "Possible duplicate",
  knowledge: "Knows too much",
  location: "Location conflict",
  relationship: "Relationship conflict",
  travel: "Impossible travel",
  promise: "Overdue promise",
  quest: "Quiet quest",
  thread: "Unattended thread",
  mystery: "Stalled mystery",
  npc: "Unanswered NPC",
  reaction: "No reaction yet",
  ai: "AI review",
};

const SEVERITY = {
  high: { icon: OctagonAlert, text: "text-ember", label: "Needs attention" },
  warn: { icon: TriangleAlert, text: "text-brass", label: "Worth a look" },
  info: { icon: Info, text: "text-muted", label: "For your notes" },
} as const;

export function ContinuityView({ issues: initial, forgotten, campaign, canEdit }: { issues: Insight[]; forgotten: Insight[]; campaign: { id: string; name: string } | null; canEdit: boolean }) {
  const w = useWorld();
  const [issues, setIssues] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const [reviewed, setReviewed] = React.useState<string | null>(null);
  React.useEffect(() => setIssues(initial), [initial]);

  const deep = async () => {
    setPending(true);
    const res = await continuityAction(w.worldId, { campaignId: campaign?.id ?? null, deep: true });
    setPending(false);
    if (!res.ok) return void toast.error(res.error);
    setIssues(res.data.issues);
    setReviewed(res.data.provider);
    const found = res.data.issues.filter((i) => i.kind === "ai").length;
    if (res.data.provider === "offline") toast.info("Rule checks re-run. Connect an AI provider for a deeper read of your lore.");
    else toast.success(found ? `The AI found ${found} more thing${found === 1 ? "" : "s"} to check.` : "The AI found nothing new.");
  };

  const sorted = [...issues].sort((a, b) => rank(b.severity) - rank(a.severity));
  return (
    <div className="flex flex-col gap-10">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-md font-semibold">
            Contradictions <span className="font-normal text-faint">{issues.length}</span>
          </h2>
          {canEdit && (
            <Button variant="secondary" size="sm" onClick={deep} loading={pending}>
              <Sparkles className="text-arcane" /> {reviewed ? "Review again" : "Deep review with AI"}
            </Button>
          )}
        </div>
        <AiWorking active={pending} live={w.aiProvider.live} what="Claude is reviewing your records" typical="under a minute" />
        {sorted.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
            {sorted.map((i) => (
              <IssueRow key={i.id} i={i} />
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
            <CircleCheck className="size-4 text-accent" /> No contradictions found in dates, deaths, locations, relationships or knowledge.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-md font-semibold">
          Forgotten threads <span className="font-normal text-faint">{forgotten.length}</span>
        </h2>
        <p className="mb-3 text-sm text-muted">{campaign ? `Things in ${campaign.name} worth resurfacing: quiet quests, overdue promises, stalled mysteries, NPCs who haven't reacted.` : "Choose a campaign to see what its players may have forgotten."}</p>
        {forgotten.length > 0 && (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
            {forgotten.map((i) => (
              <IssueRow key={i.id} i={i} icon={Hourglass} />
            ))}
          </ul>
        )}
        {campaign && forgotten.length === 0 && (
          <p className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
            <CircleCheck className="size-4 text-accent" /> Nothing has gone quiet for too long.
          </p>
        )}
      </section>
    </div>
  );
}

function rank(s: Insight["severity"]) {
  return s === "high" ? 2 : s === "warn" ? 1 : 0;
}

function IssueRow({ i, icon }: { i: Insight; icon?: typeof Hourglass }) {
  const w = useWorld();
  const sev = SEVERITY[i.severity];
  const Icon = icon ?? sev.icon;
  return (
    <li className="flex gap-3 px-4 py-3">
      <Icon className={cn("mt-0.5 size-4 shrink-0", sev.text)} aria-label={sev.label} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="font-medium">{i.title}</p>
          <Badge tone={i.kind === "ai" ? "arcane" : "outline"}>{KIND_LABEL[i.kind] ?? i.kind}</Badge>
        </div>
        {i.detail && <p className="mt-0.5 text-sm text-muted">{i.detail}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {i.entityIds.map((e) => (
            <Link key={e.id} href={`/w/${w.worldId}/e/${e.id}`} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-muted hover:text-fg">
              <TypeIcon type={e.type} className="size-3" /> {e.name}
            </Link>
          ))}
          {i.link && (
            <Link href={i.link} className="text-accent hover:underline">
              Open
            </Link>
          )}
          <button
            onClick={() => w.openAssistant({ prompt: `Help me resolve this continuity issue: ${i.title}. ${i.detail} Suggest two or three ways to fix it that fit the rest of the world, and say which records would need to change.`, focusEntityId: i.entityIds[0]?.id })}
            className="inline-flex items-center gap-1 text-arcane hover:underline"
          >
            <MessageSquareText className="size-3" /> Talk it through
          </button>
        </div>
      </div>
    </li>
  );
}
