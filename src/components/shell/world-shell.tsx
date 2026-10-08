"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Clapperboard, Compass, LogOut, Menu, Plus, Search, Sparkles, Globe, SunMoon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from "@/components/ui/overlays";
import { ENTITY_TYPES } from "@/lib/entity-types";
import { TypeIcon } from "@/components/entity/type-icon";
import { QuickCreateDialog, type QuickCreateRequest } from "@/components/entity/quick-create";
import { setActiveCampaignAction, setThemeAction } from "@/server/actions/worlds";
import { logout } from "@/server/actions/auth";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "./command-palette";
import { WorldClock } from "./world-clock";
import { WorldShellProvider, type WorldShellValue } from "./world-context";
import { AssistantDrawer } from "@/components/ai/assistant-drawer";
import { AdvanceDialog } from "@/components/living/advance-dialog";

type ShellProps = Omit<WorldShellValue, "openQuickCreate" | "openPalette" | "openAssistant" | "openAdvance"> & {
  worlds: { id: string; name: string }[];
  pendingProposals: number;
  user: { name: string; email: string };
  children: React.ReactNode;
};

const QUICK_TYPES = ["npc", "settlement", "location", "faction", "quest", "item", "lore", "event", "world_thread", "rumour"];

export function WorldShell({ worlds, pendingProposals, user, children, ...value }: ShellProps) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [createReq, setCreateReq] = React.useState<QuickCreateRequest | null>(null);
  const [assistant, setAssistant] = React.useState<{ open: boolean; prompt?: string; focusEntityId?: string }>({ open: false });
  const [advanceOpen, setAdvanceOpen] = React.useState(false);
  const [mobileNav, setMobileNav] = React.useState(false);

  const ctx: WorldShellValue = React.useMemo(
    () => ({
      ...value,
      openQuickCreate: (opts) => setCreateReq(opts ?? {}),
      openPalette: () => setPaletteOpen(true),
      openAssistant: (opts) => setAssistant({ open: true, ...opts }),
      openAdvance: () => setAdvanceOpen(true),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value.worldId, value.activeCampaign?.id, value.activeCampaign?.currentAt, value.worldNow, value.campaigns, value.customTypes, value.calendar, value.worldName, value.aiProvider.live, value.aiProvider.problem, JSON.stringify(value.peopleNames)],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setAssistant((a) => ({ open: !a.open }));
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === "c") {
          e.preventDefault();
          setCreateReq({});
        } else if (e.key === "/") {
          e.preventDefault();
          setPaletteOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const c = value.activeCampaign;
  const base = `/w/${value.worldId}`;

  return (
    <WorldShellProvider value={ctx}>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar worlds={worlds} pendingProposals={pendingProposals} mobileOpen={mobileNav} onMobileClose={() => setMobileNav(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-bg px-2 sm:gap-2 sm:px-4">
            <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation">
              <Menu />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-sm hover:bg-surface-2" aria-label="Switch campaign">
                  {c ? <Compass className="size-4 shrink-0 text-brass" /> : <Globe className="size-4 shrink-0 text-faint" />}
                  <span className="hidden max-w-[7rem] truncate font-medium min-[440px]:inline sm:max-w-[12rem]">{c ? c.name : "World view"}</span>
                  <ChevronDown className="size-3.5 shrink-0 text-faint" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>Campaign context</DropdownMenuLabel>
                {value.campaigns.map((x) => (
                  <DropdownMenuItem
                    key={x.id}
                    onSelect={async () => {
                      await setActiveCampaignAction(value.worldId, x.id);
                      router.push(`${base}/campaigns/${x.id}`);
                    }}
                  >
                    <Compass />
                    <span className="flex-1 truncate">{x.name}</span>
                    {x.id === c?.id && <Check className="!text-accent" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  onSelect={async () => {
                    await setActiveCampaignAction(value.worldId, null);
                    router.refresh();
                  }}
                >
                  <Globe />
                  <span className="flex-1">World view (no campaign)</span>
                  {!c && <Check className="!text-accent" />}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push(`${base}/campaigns`)}>
                  <Compass />
                  All campaigns
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push(`${base}/campaigns/new`)}>
                  <Plus />
                  New campaign
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex-1" />

            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden h-8 w-64 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-sm text-faint hover:border-line-strong md:flex"
            >
              <Search className="size-4" />
              <span className="flex-1 text-left">Search or jump to…</span>
              <Kbd>⌘K</Kbd>
            </button>
            <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setPaletteOpen(true)} aria-label="Search">
              <Search />
            </Button>

            <WorldClock onAdvance={() => setAdvanceOpen(true)} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="md" aria-label="Create" className="shrink-0 max-sm:size-8 max-sm:px-0">
                  <Plus /> <span className="hidden sm:inline">Create</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {c && (
                  <DropdownMenuItem onSelect={() => setCreateReq({ type: "pc" })}>
                    <TypeIcon type="pc" /> Player character
                  </DropdownMenuItem>
                )}
                {QUICK_TYPES.map((k) => {
                  const t = ENTITY_TYPES.find((x) => x.key === k)!;
                  return (
                    <DropdownMenuItem key={k} onSelect={() => setCreateReq({ type: k })}>
                      <TypeIcon type={k} /> {t.label}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setCreateReq({})}>
                  <Plus /> Something else…
                  <span className="ml-auto text-xs text-faint">C</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {c && (
              <Tooltip content="Run session mode">
                <Button asChild variant="primary" size="md" className="shrink-0 max-sm:size-8 max-sm:px-0">
                  <Link href={`${base}/campaigns/${c.id}/run`} aria-label="Run session">
                    <Clapperboard /> <span className="hidden xl:inline">Run session</span>
                  </Link>
                </Button>
              </Tooltip>
            )}

            <Tooltip content="AI copilot" shortcut="⌘J">
              <Button variant="arcane" size="icon" className="shrink-0" onClick={() => setAssistant((a) => ({ open: !a.open }))} aria-label="Open AI copilot">
                <Sparkles />
              </Button>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-fg hover:ring-2 hover:ring-line-strong" aria-label="Account">
                  {user.name.slice(0, 1).toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="block font-medium text-fg">{user.name}</span>
                  <span className="block truncate">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push("/")}>
                  <Globe /> All worlds
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={async () => {
                    const dark = !document.documentElement.classList.contains("dark");
                    document.documentElement.classList.toggle("dark", dark);
                    await setThemeAction(dark ? "dark" : "light");
                  }}
                >
                  <SunMoon /> Switch theme
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => logout()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <main id="main" className="min-h-0 flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
        <AssistantDrawer
          open={assistant.open}
          initialPrompt={assistant.prompt}
          focusEntityId={assistant.focusEntityId}
          onOpenChange={(o) => setAssistant((a) => ({ ...a, open: o, prompt: o ? a.prompt : undefined }))}
        />
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <QuickCreateDialog request={createReq} onClose={() => setCreateReq(null)} />
      <AdvanceDialog open={advanceOpen} onOpenChange={setAdvanceOpen} campaignId={c?.id ?? null} />
    </WorldShellProvider>
  );
}
