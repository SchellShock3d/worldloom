/**
 * D&D 5th edition (2024 rules) helpers. Game-system specifics live behind the
 * GameSystem interface so other systems can be added without touching the
 * encounter tracker. Numbers here are rules mechanics, not setting content.
 */

export interface GameSystem {
  key: string;
  label: string;
  conditions: string[];
  /** Rate an encounter given party levels and enemy challenge values. */
  rateEncounter(partyLevels: number[], enemyChallenges: string[]): { xp: number; budget: { low: number; moderate: number; high: number }; label: string };
  rollInitiative(bonus: number, rng?: () => number): number;
}

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);

const XP_BY_CR: Record<string, number> = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800, "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
  "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000, "21": 33000, "22": 41000,
  "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000,
};

/** 2024 rules: XP budget per character by level (low / moderate / high). */
const BUDGET: Record<number, [number, number, number]> = {
  1: [50, 75, 100], 2: [100, 150, 200], 3: [150, 225, 400], 4: [250, 375, 500], 5: [500, 750, 1100], 6: [600, 1000, 1400], 7: [750, 1300, 1700],
  8: [1000, 1700, 2100], 9: [1300, 2000, 2600], 10: [1600, 2300, 3100], 11: [1900, 2900, 4100], 12: [2200, 3700, 4700], 13: [2600, 4200, 5400],
  14: [2900, 4900, 6200], 15: [3300, 5400, 7800], 16: [3800, 6100, 9800], 17: [4500, 7200, 11700], 18: [5000, 8700, 14200], 19: [5500, 10700, 17200], 20: [6400, 13200, 22000],
};

export function xpForChallenge(cr: string | number | undefined | null): number {
  if (cr === undefined || cr === null || cr === "") return 0;
  const key = String(cr).trim().replace(/^cr\s*/i, "");
  if (XP_BY_CR[key] !== undefined) return XP_BY_CR[key]!;
  const n = Number(key);
  if (!Number.isNaN(n)) {
    if (n === 0.125) return 25;
    if (n === 0.25) return 50;
    if (n === 0.5) return 100;
  }
  return 0;
}

export const DND5E: GameSystem = {
  key: "dnd5e",
  label: "D&D 5e (2024)",
  conditions: ["Blinded", "Charmed", "Deafened", "Exhaustion", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious", "Concentrating"],
  rateEncounter(partyLevels, enemyChallenges) {
    const budget = { low: 0, moderate: 0, high: 0 };
    for (const lvl of partyLevels) {
      const b = BUDGET[Math.max(1, Math.min(20, Math.round(lvl)))]!;
      budget.low += b[0];
      budget.moderate += b[1];
      budget.high += b[2];
    }
    const xp = enemyChallenges.reduce((s, cr) => s + xpForChallenge(cr), 0);
    let label = "Trivial";
    if (!partyLevels.length) label = "Unknown party";
    else if (xp > budget.high * 1.5) label = "Deadly";
    else if (xp > budget.high) label = "Beyond high";
    else if (xp > budget.moderate) label = "High";
    else if (xp > budget.low) label = "Moderate";
    else if (xp > budget.low * 0.5) label = "Low";
    return { xp, budget, label };
  },
  rollInitiative(bonus, rng = Math.random) {
    return Math.floor(rng() * 20) + 1 + bonus;
  },
};

export const GAME_SYSTEMS: Record<string, GameSystem> = { dnd5e: DND5E };
export const getGameSystem = (key: string) => GAME_SYSTEMS[key] ?? DND5E;
