// ─────────────────────────────────────────────────────────────────
// Branchen-Seed: gruppierte Liste (für Dropdown) + flache Liste (für
// die Discovery-Suche). Single source: data/research-seed-categories.json.
// ─────────────────────────────────────────────────────────────────
import seedData from "@/data/research-seed-categories.json";

export interface SeedGroup {
  name: string;
  categories: string[];
}

export const SEED_GROUPS: SeedGroup[] = (seedData as { groups?: SeedGroup[] }).groups ?? [];

// Flache Liste aller Branchen (Reihenfolge = Gruppen-Reihenfolge).
export const SEED_CATEGORIES: string[] = SEED_GROUPS.flatMap((g) => g.categories);
