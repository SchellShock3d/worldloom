import {
  Beer,
  BookOpen,
  Building2,
  CalendarClock,
  Castle,
  DoorClosed,
  Dna,
  Earth,
  Flag,
  Gem,
  Landmark,
  Languages,
  MapPin,
  MessageCircleQuestion,
  Mountain,
  Package,
  PawPrint,
  ScrollText,
  SearchCheck,
  Shapes,
  ShieldUser,
  Sparkles,
  Spline,
  Store,
  Sun,
  Swords,
  UserRound,
  Users,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { getEntityType, type EntityGroup } from "@/lib/entity-types";
import { cn } from "@/lib/utils";

export const ICONS: Record<string, LucideIcon> = {
  "user-round": UserRound,
  "shield-user": ShieldUser,
  "paw-print": PawPrint,
  earth: Earth,
  mountain: Mountain,
  flag: Flag,
  castle: Castle,
  "map-pin": MapPin,
  "door-closed": DoorClosed,
  dna: Dna,
  "wand-sparkles": WandSparkles,
  landmark: Landmark,
  store: Store,
  beer: Beer,
  swords: Swords,
  "building-2": Building2,
  sun: Sun,
  sparkles: Sparkles,
  users: Users,
  languages: Languages,
  package: Package,
  gem: Gem,
  "book-open": BookOpen,
  "calendar-clock": CalendarClock,
  "message-circle-question": MessageCircleQuestion,
  "scroll-text": ScrollText,
  spline: Spline,
  "search-check": SearchCheck,
  shapes: Shapes,
};

export const TONE_TEXT: Record<EntityGroup, string> = {
  people: "text-people",
  places: "text-places",
  powers: "text-powers",
  culture: "text-culture",
  things: "text-things",
  lore: "text-lore",
  play: "text-play",
};

export const TONE_VAR: Record<EntityGroup, string> = {
  people: "var(--type-people)",
  places: "var(--type-places)",
  powers: "var(--type-powers)",
  culture: "var(--type-culture)",
  things: "var(--type-things)",
  lore: "var(--type-lore)",
  play: "var(--type-play)",
};

export function TypeIcon({ type, className, plain }: { type: string; className?: string; plain?: boolean }) {
  const def = getEntityType(type);
  const Icon = ICONS[def.icon] ?? Shapes;
  return <Icon className={cn("size-4 shrink-0", !plain && TONE_TEXT[def.tone], className)} aria-hidden />;
}

/** Square glyph with tinted background, for list rows and headers. */
export function TypeGlyph({ type, size = "md", className }: { type: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const def = getEntityType(type);
  const Icon = ICONS[def.icon] ?? Shapes;
  const sizes = { sm: "size-6 rounded-[5px] [&_svg]:size-3.5", md: "size-8 rounded-md [&_svg]:size-4", lg: "size-12 rounded-lg [&_svg]:size-6" };
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", sizes[size], className)}
      style={{ background: `color-mix(in srgb, ${TONE_VAR[def.tone]} 14%, transparent)`, color: TONE_VAR[def.tone] }}
      aria-hidden
    >
      <Icon />
    </span>
  );
}
