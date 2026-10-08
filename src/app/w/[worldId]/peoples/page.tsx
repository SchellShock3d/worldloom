import { Dna } from "lucide-react";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { listPeoples } from "@/server/services/peoples";
import { PageHeader } from "@/components/ui/display";
import { CORE_CLASSES, CORE_RACES, defaultClassPrevalence, defaultRacePrevalence } from "@/lib/peoples";
import { PeoplesView } from "./peoples-view";

export const metadata = { title: "Races & classes" };

export default async function PeoplesPage({ params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const { world, role } = await requireWorld(worldId);
  const db = await getDb();
  const { races, classes } = await listPeoples(db, worldId);
  const canEdit = role === "owner" || role === "editor";
  const traits = { genre: world.genre, tone: world.tone, magicLevel: world.magicLevel, techLevel: world.techLevel, text: world.description };
  const haveRace = new Set(races.map((r) => r.name.toLowerCase()));
  const haveClass = new Set(classes.map((c) => c.name.toLowerCase()));
  const raceDefaults = defaultRacePrevalence(traits);
  const classDefaults = defaultClassPrevalence(traits);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<Dna />}
        title="Races & classes"
        description="Who lives in this world and which adventuring paths exist, from the D&D core set to homebrew that grows out of your setting. The AI and the generators use these, and how common each one is, whenever they create people and places."
      />
      <PeoplesView
        worldId={worldId}
        canEdit={canEdit}
        races={races}
        classes={classes}
        missingRaces={CORE_RACES.filter((r) => !haveRace.has(r.name.toLowerCase())).map((r) => ({ name: r.name, summary: r.summary, suggested: raceDefaults[r.name] ?? "Uncommon" }))}
        missingClasses={CORE_CLASSES.filter((c) => !haveClass.has(c.name.toLowerCase())).map((c) => ({ name: c.name, summary: c.summary, suggested: classDefaults[c.name] ?? "Uncommon" }))}
      />
    </div>
  );
}
