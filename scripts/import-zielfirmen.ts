/**
 * Importiert Zielfirmen aus einer CSV in die Tabelle `zielfirmen`.
 *
 * SICHER: reines INSERT neuer Firmen. Bestehende Firmen werden per Dedup
 * ERKANNT und ÜBERSPRUNGEN — nie überschrieben, nie gelöscht. Kein Versand,
 * kein Apify, kein Hunter, kein Claude. Nur Stammdaten in die DB.
 *
 * CSV-Spalten (Kopfzeile nötig, Reihenfolge egal, Aliase erlaubt):
 *   firma*        (Pflicht)   Aliase: firmenname, name, unternehmen
 *   website                   Aliase: webseite, url, homepage
 *   gewerk                    Aliase: branche         (elektro|shk|metall|bau|galabau|industrie)
 *   ort                       Aliase: stadt
 *   plz                       Aliase: postleitzahl
 *   mitarbeiter_geschaetzt    Aliase: mitarbeiter, mitarbeiterzahl
 *   gf_name                   Aliase: gf, geschaeftsfuehrer, chef, inhaber
 *   email                     Aliase: e-mail, mail
 *   quelle                    (default: "csv-import")
 *
 * Trennzeichen (, oder ;) wird automatisch erkannt.
 *
 * Ausführen:
 *   Trockenlauf (nur prüfen, nichts schreiben):
 *     npx tsx scripts/import-zielfirmen.ts data/zielfirmen.csv --dry
 *   Echt importieren:
 *     npx tsx scripts/import-zielfirmen.ts data/zielfirmen.csv
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "fs";
import { getZielfirmen, createZielfirmenBulk } from "../lib/stellensignale/db";
import { domainOf } from "../lib/stellensignale/filter";
import type { Zielfirma, ZielfirmaStatus } from "../types/stellensignale";

type NeueFirma = Omit<Zielfirma, "id" | "created_at" | "updated_at">;

// ── Argumente ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const filePath = args.find((a) => !a.startsWith("--")) ?? "data/zielfirmen.csv";

// ── CSV-Parser (State-Machine: Quotes + eingebettete Trennzeichen) ─
function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      pushField();
    } else if (c === "\n") {
      pushField();
      pushRow();
    } else if (c === "\r") {
      // ignorieren (CRLF)
    } else {
      field += c;
    }
  }
  // letztes Feld/letzte Zeile
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// ── Spalten-Aliase → kanonischer Feldname ─────────────────────────
const ALIASES: Record<string, keyof NeueFirma> = {
  firma: "firma", firmenname: "firma", name: "firma", unternehmen: "firma", company: "firma",
  website: "website", webseite: "website", url: "website", homepage: "website",
  gewerk: "gewerk", branche: "gewerk",
  ort: "ort", stadt: "ort", city: "ort",
  plz: "plz", postleitzahl: "plz", zip: "plz",
  mitarbeiter_geschaetzt: "mitarbeiter_geschaetzt", mitarbeiter: "mitarbeiter_geschaetzt",
  mitarbeiterzahl: "mitarbeiter_geschaetzt", employees: "mitarbeiter_geschaetzt",
  gf_name: "gf_name", gf: "gf_name", geschaeftsfuehrer: "gf_name", chef: "gf_name", inhaber: "gf_name",
  email: "email", "e-mail": "email", mail: "email",
  quelle: "quelle", source: "quelle",
};

function normHeader(h: string): keyof NeueFirma | null {
  const key = h.trim().toLowerCase().replace(/^﻿/, ""); // BOM entfernen
  return ALIASES[key] ?? null;
}

// Dedup-Schlüssel: Website-Domain, sonst firma|ort (beides klein).
function dedupKey(f: { website?: string | null; firma: string; ort?: string | null }): string {
  const dom = domainOf(f.website);
  if (dom) return `dom:${dom}`;
  return `no:${f.firma.trim().toLowerCase()}|${(f.ort ?? "").trim().toLowerCase()}`;
}

async function run() {
  console.log(`\n📥 Import aus: ${filePath}${dryRun ? "  (TROCKENLAUF — schreibt nichts)" : ""}\n`);

  const raw = readFileSync(filePath, "utf-8");
  const delim = raw.split("\n")[0].includes(";") ? ";" : ",";
  const table = parseCsv(raw, delim);
  if (table.length < 2) {
    console.error("❌ CSV hat keine Datenzeilen (nur Kopfzeile oder leer).");
    process.exit(1);
  }

  // Kopfzeile → Spaltenindex-Map
  const header = table[0];
  const colMap: (keyof NeueFirma | null)[] = header.map(normHeader);
  if (!colMap.includes("firma")) {
    console.error("❌ Keine 'firma'-Spalte gefunden. Erkannte Header:", header.join(" | "));
    process.exit(1);
  }

  // Zeilen → NeueFirma-Objekte
  const kandidaten: NeueFirma[] = [];
  const fehler: string[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const obj: Partial<NeueFirma> = {};
    colMap.forEach((field, idx) => {
      if (!field) return;
      const val = (cells[idx] ?? "").trim();
      if (val === "") return;
      if (field === "mitarbeiter_geschaetzt") {
        const n = parseInt(val.replace(/\D/g, ""), 10);
        if (!Number.isNaN(n)) obj.mitarbeiter_geschaetzt = n;
      } else if (field === "gewerk") {
        obj.gewerk = val.toLowerCase();
      } else {
        (obj as Record<string, string>)[field] = val;
      }
    });
    if (!obj.firma) {
      fehler.push(`Zeile ${r + 1}: keine Firma — übersprungen`);
      continue;
    }
    kandidaten.push({
      firma: obj.firma,
      website: obj.website ?? null,
      karriere_url: null,
      gewerk: obj.gewerk ?? null,
      ort: obj.ort ?? null,
      plz: obj.plz ?? null,
      mitarbeiter_geschaetzt: obj.mitarbeiter_geschaetzt ?? null,
      gf_name: obj.gf_name ?? null,
      email: obj.email ?? null,
      email_quelle: obj.email ? "csv" : null,
      email_confidence: obj.email ? 100 : null,
      status: "aktiv" as ZielfirmaStatus,
      cooldown_bis: null,
      quelle: obj.quelle ?? "csv-import",
    });
  }

  // Dedup gegen Bestand + innerhalb der CSV
  const bestand = await getZielfirmen();
  const bekannt = new Set(bestand.map((b) => dedupKey(b)));
  const neu: NeueFirma[] = [];
  const uebersprungen: string[] = [];
  for (const k of kandidaten) {
    const key = dedupKey(k);
    if (bekannt.has(key)) {
      uebersprungen.push(k.firma);
      continue;
    }
    bekannt.add(key); // auch CSV-interne Duplikate abfangen
    neu.push(k);
  }

  console.log(`  Zeilen gelesen:    ${kandidaten.length}`);
  console.log(`  Schon vorhanden:   ${uebersprungen.length}`);
  console.log(`  Neu zu importieren: ${neu.length}`);
  if (fehler.length) console.log(`  ⚠️  ${fehler.length} Zeilen mit Problemen:\n     ${fehler.join("\n     ")}`);
  if (neu.length) {
    console.log("\n  Vorschau (erste 5):");
    neu.slice(0, 5).forEach((n) => console.log(`   • ${n.firma}  [${n.gewerk ?? "?"}, ${n.ort ?? "?"}]  ${n.website ?? ""}`));
  }

  if (dryRun) {
    console.log("\n✅ Trockenlauf fertig — nichts geschrieben.\n");
    return;
  }
  if (neu.length === 0) {
    console.log("\n✅ Nichts Neues zu importieren.\n");
    return;
  }

  const eingefuegt = await createZielfirmenBulk(neu);
  console.log(`\n✅ ${eingefuegt} Firmen importiert. Vorhandene wurden NICHT angetastet.\n`);
}

run().catch((e) => {
  console.error("\n❌ Import fehlgeschlagen:", e instanceof Error ? e.message : e);
  process.exit(1);
});
