/**
 * Zeigt, wie die Erreichbarkeits-Bewertung entscheidet — welcher Betrieb
 * angeschrieben wird und welcher nicht. Reine Funktion, kein DB-Zugriff:
 * die Beispiele unten sind Testdaten.
 *
 * Aufruf: npx tsx scripts/check-erreichbarkeit.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { erreichbarkeit, mindestScore } from "../lib/stellensignale/erreichbarkeit";
import type { FirmaOutreach } from "../types/stellensignale";

function f(over: Partial<FirmaOutreach>): FirmaOutreach {
  return {
    zielfirma_id: "x", firma: "Beispiel", gewerk: "elektro", ort: "Oldenburg", plz: null,
    website: "https://beispiel.de", email: "info@beispiel.de", email_quelle: "impressum",
    email_confidence: 90, gf_name: null, firma_status: "aktiv", signal_id: "s",
    stellentitel: "Elektroniker (m/w/d)", quelle: "arbeitsagentur", quelle_url: null,
    raw_text: null, erstfund: "2026-05-01", letzter_fund: "2026-07-28",
    ist_fachkraft: true, wochen_offen: 12, ist_heiss: true, anzahl_signale: 1,
    ...over,
  };
}

const faelle: { label: string; firma: FirmaOutreach }[] = [
  { label: "Produktionsbetrieb, Bewerbungspostfach, 4 Stellen",
    firma: f({ firma: "Nordmetall Stahlbau GmbH", email: "bewerbung@nordmetall.de", anzahl_signale: 4 }) },
  { label: "Mittelständler, persönliche Adresse, 2 Stellen",
    firma: f({ firma: "Elektro Brummund GmbH", email: "t.brummund@brummund.de", anzahl_signale: 2 }) },
  { label: "Betrieb mit Personalabteilung",
    firma: f({ firma: "Heitmann Haustechnik GmbH & Co. KG", email: "personal@heitmann.de", anzahl_signale: 1 }) },
  { label: "Kleinbetrieb, info@, eine Stelle",
    firma: f({ firma: "Elektro Meier", email: "info@elektro-meier.de", anzahl_signale: 1 }) },
  { label: "Dachdecker, geratene Adresse, kein Zusatz",
    firma: f({ firma: "Dachdeckerei Janssen", email: "info@janssen-dach.de", email_quelle: "pattern", email_confidence: 45, anzahl_signale: 1 }) },
];

const min = mindestScore();
console.log(`\n📬 Erreichbarkeit — Mindestwert zum Anschreiben: ${min}\n`);

for (const { label, firma } of faelle.map((x) => x).sort(
  (a, b) => erreichbarkeit(b.firma).score - erreichbarkeit(a.firma).score,
)) {
  const { score, gruende } = erreichbarkeit(firma);
  const marke = score >= min ? "✅ wird angeschrieben" : "⛔ übersprungen";
  console.log(`${String(score).padStart(2)} Punkte  ${marke}  · ${firma.firma}`);
  console.log(`           ${label}`);
  for (const g of gruende) console.log(`           · ${g}`);
  console.log("");
}
