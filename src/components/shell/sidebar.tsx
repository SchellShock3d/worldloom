"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  Clapperboard,
  Compass,
  Dices,
  Gem,
  GitBranch,
  History,
  Inbox,
  LayoutDashboard,
  Map as MapIcon,
  Mountain,
  Music,
  Newspaper,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  PawPrint,
  Plus,
  Route,
  ScrollText,
  SearchCheck,
  Settings,
  ShieldUser,
  Sparkles,
  Spline,
  Swords,
  TriangleAlert,
  UserRound,
  Waypoints,
  type LucideIcon, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo";
import { useWorld } from "./world-context";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip } from "@/components/ui/overlays";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  exact?: boolean;
}

function useCollapsed() {
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("wl_sidebar") === "collapsed");
    } catch {}
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("wl_sidebar", c ? "open" : "collapsed");
      } catch {}
      return !c;
    });
  return [collapsed, toggle] as const;
}

export function Sidebar({ worlds, pendingProposals, mobileOpen, onMobileClose }: { worlds: { id: string; name: string }[]; pendingProposals: number; mobileOpen: boolean; onMobileClose: () => void }) {
  const w = useWorld();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, toggle] = useCollapsed();
  const base = `/w/${w.worldId}`;
  const c = w.activeCampaign;
  const cbase = c ? `${base}/campaigns/${c.id}` : null;

  const worldNav: NavItem[] = [
    { href: base, label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: `${base}/wiki`, label: "Wiki", icon: BookOpen },
    { href: `${base}/characters`, label: "Characters", icon: UserRound },
    { href: `${base}/locations`, label: "Places", icon: Mountain },
    { href: `${base}/factions`, label: "Factions & faiths", icon: Swords },
    { href: `${base}/items`, label: "Items", icon: Gem },
    { href: `${base}/bestiary`, label: "Bestiary", icon: PawPrint },
    { href: `${base}/maps`, label: "Maps", icon: MapIcon },
    { href: `${base}/timeline`, label: "Timeline", icon: History },
    { href: `${base}/calendar`, label: "Calendar", icon: CalendarDays },
    { href: `${base}/graph`, label: "Relationships", icon: Waypoints },
  ];
  const livingNav: NavItem[] = [
    { href: `${base}/threads`, label: "World threads", icon: Spline },
    { href: `${base}/news`, label: "World news", icon: Newspaper },
    { href: `${base}/proposals`, label: "Proposals", icon: Inbox, badge: pendingProposals },
    { href: `${base}/continuity`, label: "Continuity", icon: TriangleAlert },
  ];
  const campaignNav: NavItem[] = cbase
    ? [
        { href: cbase, label: "Campaign", icon: Compass, exact: true },
        { href: `${cbase}/sessions`, label: "Sessions", icon: Clapperboard },
        { href: `${cbase}/party`, label: "Party", icon: ShieldUser },
        { href: `${cbase}/quests`, label: "Quests", icon: ScrollText },
        { href: `${cbase}/mysteries`, label: "Mysteries", icon: SearchCheck },
        { href: `${cbase}/consequences`, label: "Consequences", icon: GitBranch },
        { href: `${cbase}/travel`, label: "Travel", icon: Route },
        { href: `${cbase}/notes`, label: "Notes", icon: NotebookPen },
      ]
    : [];
  const toolsNav: NavItem[] = [
    { href: `${base}/ai`, label: "AI assistant", icon: Sparkles },
    { href: `${base}/encounters`, label: "Encounters", icon: Swords },
    { href: `${base}/generators`, label: "Generators", icon: Dices },
    { href: `${base}/music`, label: "Music & ambience", icon: Music },
    { href: `${base}/settings`, label: "World settings", icon: Settings },
  ];

  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/"));

  const content = (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-12 shrink-0 items-center gap-1 border-b border-line", collapsed ? "justify-center px-1" : "px-2")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn("flex min-w-0 items-center gap-2 rounded-md py-1 text-left hover:bg-surface-2", collapsed ? "px-1" : "flex-1 px-1.5")}
              aria-label="Switch world"
            >
              <LogoMark className="size-6 shrink-0" />
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate font-serif text-[1.05rem] font-semibold">{w.worldName}</span>
                  <ChevronDown className="size-3.5 shrink-0 text-faint" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Worlds</DropdownMenuLabel>
            {worlds.map((x) => (
              <DropdownMenuItem key={x.id} onSelect={() => router.push(`/w/${x.id}`)} className={x.id === w.worldId ? "font-semibold" : ""}>
                <LogoMark className="size-4" />
                <span className="truncate">{x.name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push(`/play/${w.worldId}${w.activeCampaign ? `?c=${w.activeCampaign.id}` : ""}`)}>
              <Eye />
              Preview the player portal
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/onboarding?new=1")}>
              <Plus />
              New world
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/")}>
              <LayoutDashboard />
              All worlds
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {!collapsed && (
          <button onClick={toggle} className="hidden size-7 items-center justify-center rounded-md text-faint hover:bg-surface-2 hover:text-fg lg:flex" aria-label="Collapse sidebar">
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label="World navigation">
        <NavGroup items={worldNav} collapsed={collapsed} isActive={isActive} onNavigate={onMobileClose} />
        <NavGroup title="Living world" items={livingNav} collapsed={collapsed} isActive={isActive} onNavigate={onMobileClose} />
        {c ? (
          <NavGroup title={c.name} items={campaignNav} collapsed={collapsed} isActive={isActive} onNavigate={onMobileClose} accent />
        ) : (
          !collapsed && (
            <div className="mt-5 px-2">
              <p className="mb-1.5 text-xs font-medium text-faint">Campaign</p>
              <Link href={`${base}/campaigns/new`} className="flex items-center gap-2 rounded-md border border-dashed border-line px-2 py-2 text-sm text-muted hover:border-line-strong hover:text-fg">
                <Plus className="size-4" /> Start a campaign
              </Link>
            </div>
          )
        )}
        <NavGroup title="Tools" items={toolsNav} collapsed={collapsed} isActive={isActive} onNavigate={onMobileClose} />
      </nav>
      {collapsed && (
        <button onClick={toggle} className="m-2 hidden size-8 items-center justify-center self-center rounded-md text-faint hover:bg-surface-2 hover:text-fg lg:flex" aria-label="Expand sidebar">
          <PanelLeftOpen className="size-4" />
        </button>
      )}
    </div>
  );

  return (
    <>
      <aside className={cn("hidden shrink-0 border-r border-line bg-bg-subtle lg:block", collapsed ? "w-14" : "w-60")}>{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[var(--overlay)]" onClick={onMobileClose} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-line bg-bg-subtle animate-drawer">{content}</aside>
        </div>
      )}
    </>
  );
}

function NavGroup({
  title,
  items,
  collapsed,
  isActive,
  onNavigate,
  accent,
}: {
  title?: string;
  items: NavItem[];
  collapsed: boolean;
  isActive: (i: NavItem) => boolean;
  onNavigate: () => void;
  accent?: boolean;
}) {
  return (
    <div className={cn(title && "mt-5")}>
      {title && !collapsed && (
        <p className={cn("mb-1 truncate px-2 text-xs font-medium", accent ? "text-brass" : "text-faint")}>{title}</p>
      )}
      {title && collapsed && <div className="mx-2 mb-2 border-t border-line" />}
      <ul className="flex flex-col gap-px">
        {items.map((item) => {
          const active = isActive(item);
          const link = (
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex h-8 items-center gap-2.5 rounded-md text-[0.84rem] transition-colors",
                collapsed ? "justify-center px-0" : "px-2",
                active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg",
              )}
            >
              <item.icon className={cn("size-4 shrink-0", active ? "text-accent" : "text-faint group-hover:text-muted")} />
              {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
              {!collapsed && !!item.badge && (
                <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-arcane px-1 text-2xs font-semibold text-white">{item.badge}</span>
              )}
            </Link>
          );
          return (
            <li key={item.href} className="relative">
              {collapsed ? (
                <Tooltip content={item.label} side="right">
                  {link}
                </Tooltip>
              ) : (
                link
              )}
              {collapsed && !!item.badge && <span className="absolute right-1.5 top-1 size-2 rounded-full bg-arcane" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
