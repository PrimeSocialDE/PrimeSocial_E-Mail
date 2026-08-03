import { getBlacklistEintraege } from "@/lib/stellensignale/db";
import { indeedAktiviert } from "@/lib/stellensignale/platforms/indeed";
import { kleinanzeigenAktiv } from "@/lib/stellensignale/platforms/kleinanzeigen";
import { arbeitsagenturAktiv } from "@/lib/stellensignale/platforms/arbeitsagentur";
import { hunterAktiviert } from "@/lib/stellensignale/email-finder";
import { limits } from "@/lib/stellensignale/apify";
import { TestRunButton } from "@/components/stellensignale/TestRunButton";
import { EmailRunButton } from "@/components/stellensignale/EmailRunButton";
import { CleanupButton } from "@/components/stellensignale/CleanupButton";
import { MapsRunButton } from "@/components/stellensignale/MapsRunButton";
import { GEWERKE } from "@/types/stellensignale";
import type { BlacklistInserent } from "@/types/stellensignale";

// Read-only Einstellungs-Übersicht (Gerüst): Blacklist, Gewerke, Feature-Flags.
// Bearbeiten folgt als eigener Schritt.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/5 bg-dark-950 px-4 py-3">
      <div className="text-2xl font-bold text-white tabular-nums">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function Flag({ label, on, hint }: { label: string; on: boolean; hint: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-dark-950 px-4 py-3">
      <div>
        <div className="text-sm text-gray-200 font-medium">{label}</div>
        <div className="text-xs text-gray-600 mt-0.5">{hint}</div>
      </div>
      <span
        className={
          on
            ? "inline-flex items-center rounded-full bg-brand-500/15 px-2.5 py-0.5 text-xs font-medium text-brand-400"
            : "inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-medium text-gray-500"
        }
      >
        {on ? "AN" : "AUS"}
      </span>
    </div>
  );
}

export default async function StellensignaleEinstellungenPage() {
  let blacklist: BlacklistInserent[] = [];
  let ladeFehler: string | null = null;
  try {
    blacklist = await getBlacklistEintraege();
  } catch (e) {
    ladeFehler = String(e instanceof Error ? e.message : e);
  }

  const crawlEnabled = process.env.STELLENSIGNALE_ENABLED === "true";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-white">Einstellungen</h1>
        <p className="text-gray-500 text-sm mt-1">
          Blacklist-Inserenten, Gewerke und Feature-Flags des Stellensignal-Moduls.
        </p>
      </div>

      <div className="mb-8 rounded-xl border border-white/5 bg-dark-950 p-4">
        <h2 className="text-sm font-heading font-semibold text-gray-300 mb-1">Testlauf</h2>
        <p className="text-xs text-gray-600 mb-3">
          Startet EINEN kleinen, gedeckelten Crawl (max. 3 Queries) — nur für eingeloggte Nutzer.
          Scrapt nur Plattformen, die per Flag + Actor-ID scharf geschaltet sind.
        </p>
        <TestRunButton />
      </div>

      <div className="mb-8 rounded-xl border border-white/5 bg-dark-950 p-4">
        <h2 className="text-sm font-heading font-semibold text-gray-300 mb-1">Firmen finden (Google Maps)</h2>
        <p className="text-xs text-gray-600 mb-3">
          Findet regionale Betriebe unabhängig von Stellenanzeigen, also auch starke Mittelständler,
          die in keiner Lead-Liste stehen. Liefert fast immer die Website, damit danach die
          Impressum-Mail-Findung greift. Gedeckelt (Default 3 Suchen/Lauf).
        </p>
        <MapsRunButton />
      </div>

      <div className="mb-8 rounded-xl border border-white/5 bg-dark-950 p-4">
        <h2 className="text-sm font-heading font-semibold text-gray-300 mb-1">E-Mails suchen</h2>
        <p className="text-xs text-gray-600 mb-3">
          Nur Impressum/Pattern-Suche (kein Crawl, schnell) für Firmen mit Website ohne Mail.
          Zeigt pro Firma, was gefunden wurde — gut zur Diagnose.
        </p>
        <EmailRunButton />
      </div>

      <div className="mb-8 rounded-xl border border-white/5 bg-dark-950 p-4">
        <h2 className="text-sm font-heading font-semibold text-gray-300 mb-1">Zielgruppe schärfen</h2>
        <p className="text-xs text-gray-600 mb-3">
          Setzt Großkonzerne (AG, SE, Group …) und Personaldienstleister auf „gesperrt", damit nur
          regionale Mittelständler übrig bleiben. Löscht nichts. Liste erweiterbar in
          <span className="text-gray-500"> data/stellensignale-ausschluss.json</span>.
        </p>
        <CleanupButton />
      </div>

      <h2 className="text-sm font-heading font-semibold text-gray-300 mb-3">Feature-Flags</h2>
      <div className="space-y-2 mb-8 max-w-xl">
        <Flag
          label="Täglicher Crawl (STELLENSIGNALE_ENABLED)"
          on={crawlEnabled}
          hint="Kill-Switch. Default AUS — kein unbeaufsichtigter Scrape/Verbrauch."
        />
        <Flag
          label="Plattform: Kleinanzeigen"
          on={kleinanzeigenAktiv()}
          hint="Aktiv nur wenn Flag=true UND Actor-ID gesetzt. Default AUS."
        />
        <Flag
          label="Plattform: Arbeitsagentur"
          on={arbeitsagenturAktiv()}
          hint="Aktiv nur wenn Flag=true UND Actor-ID gesetzt. Default AUS."
        />
        <Flag
          label="Plattform: Indeed"
          on={indeedAktiviert()}
          hint="Aktiv nur wenn Flag=true UND Actor-ID gesetzt. Default AUS."
        />
        <Flag
          label="Hunter-Fallback (STELLENSIGNALE_HUNTER)"
          on={hunterAktiviert()}
          hint="Teure Email-Suche, nur wenn Impressum nichts findet. Default AUS."
        />
      </div>

      <h2 className="text-sm font-heading font-semibold text-gray-300 mb-3">Kosten-Deckel</h2>
      <div className="grid grid-cols-2 gap-3 mb-8 max-w-xl sm:grid-cols-4">
        <Stat label="Anzeigen / Query" value={limits().maxItems} />
        <Stat label="Actor-Timeout (s)" value={limits().timeoutSecs} />
        <Stat label="Queries / Lauf" value={parseInt(process.env.STELLENSIGNALE_MAX_QUERIES ?? "20", 10)} />
        <Stat label="Email-Checks / Lauf" value={parseInt(process.env.STELLENSIGNALE_EMAIL_LIMIT ?? "25", 10)} />
      </div>

      <h2 className="text-sm font-heading font-semibold text-gray-300 mb-3">Gewerke</h2>
      <div className="flex flex-wrap gap-2 mb-8">
        {GEWERKE.map((g) => (
          <span key={g} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-400">
            {g}
          </span>
        ))}
      </div>

      <h2 className="text-sm font-heading font-semibold text-gray-300 mb-3">
        Blacklist-Inserenten <span className="text-gray-600 font-normal">({blacklist.length})</span>
      </h2>
      {ladeFehler ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
          Tabellen noch nicht migriert? ({ladeFehler})
        </div>
      ) : blacklist.length === 0 ? (
        <p className="text-sm text-gray-600">Noch keine Einträge (Seed-Migration ausstehend).</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {blacklist.map((b) => (
            <span
              key={b.id}
              className={
                b.aktiv
                  ? "rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300"
                  : "rounded-full border border-white/5 px-3 py-1 text-xs text-gray-600 line-through"
              }
            >
              {b.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
