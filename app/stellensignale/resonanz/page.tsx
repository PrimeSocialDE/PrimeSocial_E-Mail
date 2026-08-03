import Link from "next/link";
import { nischenStatistik, letzteAntworten, gesamtbild, MINDESTMENGE_NISCHE } from "@/lib/stellensignale/resonanz";
import type { NischenZeile, AntwortZeile, Gesamtbild } from "@/lib/stellensignale/resonanz";

// Wer reagiert — und in welcher Nische. Read-only.
//
// Bewusst OHNE Oeffnungsrate als Leitzahl: die Mails dieses Moduls sind reiner
// Text, und SES zaehlt Oeffnungen nur ueber ein Bild im HTML-Teil. Die
// Begruendung steht ausfuehrlich in lib/stellensignale/resonanz.ts.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function Stat({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: "gruen" | "rot" | "gelb" }) {
  const farbe =
    accent === "gruen" ? "text-emerald-400" :
    accent === "rot"   ? "text-red-400" :
    accent === "gelb"  ? "text-amber-400" : "text-white";
  return (
    <div className="rounded-xl border border-white/5 bg-dark-950 px-4 py-3">
      <div className={`text-2xl font-bold ${farbe}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-gray-600 mt-1">{sub}</div>}
    </div>
  );
}

const GEWERK_LABEL: Record<string, string> = {
  elektro: "Elektro", shk: "Heizung / Sanitär", metall: "Metallbau",
  bau: "Bau / Dach / Zimmerei", galabau: "Garten- & Landschaftsbau",
  industrie: "Industrie & Produktion",
};

function quote(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1).replace(".", ",")} %`;
}

function datum(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

export default async function ResonanzDashboard() {
  let nischen: NischenZeile[] = [];
  let antworten: AntwortZeile[] = [];
  let gesamt: Gesamtbild | null = null;
  let ladeFehler: string | null = null;

  try {
    [nischen, antworten, gesamt] = await Promise.all([
      nischenStatistik(),
      letzteAntworten(25),
      gesamtbild(),
    ]);
  } catch (e) {
    ladeFehler = String(e instanceof Error ? e.message : e);
  }

  const belastbar = nischen.filter((n) => n.aussagekraeftig);
  const beste = belastbar[0] ?? null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Resonanz</h1>
        <p className="text-sm text-gray-500 mt-1">
          Wer antwortet, was er schreibt — und welche Nische am besten reagiert.
        </p>
      </div>

      {ladeFehler && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <div className="text-sm text-red-400">Daten konnten nicht geladen werden</div>
          <div className="text-xs text-gray-500 mt-1 font-mono">{ladeFehler}</div>
          <div className="text-xs text-gray-600 mt-2">
            Fehlt die Tabelle <span className="font-mono">stellen_ereignisse</span>? Dann ist die
            Migration <span className="font-mono">20260804_stellensignale_resonanz.sql</span> noch nicht eingespielt.
          </div>
        </div>
      )}

      {gesamt?.warnung && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <div className="text-sm font-semibold text-red-400">Sofort ansehen</div>
          <div className="text-sm text-gray-300 mt-1">{gesamt.warnung}</div>
        </div>
      )}

      {/* ── Kopfzahlen ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="versendet" value={gesamt?.versendet ?? 0} />
        <Stat label="zugestellt" value={gesamt?.zugestellt ?? 0}
              sub={gesamt?.versendet ? `${Math.round((gesamt.zugestellt / gesamt.versendet) * 100)} % der versendeten` : undefined} />
        <Stat label="Antworten" value={gesamt?.antworten ?? 0} accent="gruen" />
        <Stat label="Antwortquote" value={quote(gesamt?.antwortquote ?? null)} accent="gruen" />
        <Stat label="Abmeldungen" value={gesamt?.abmeldungen ?? 0}
              accent={(gesamt?.aergerquote ?? 0) >= 0.1 ? "rot" : undefined}
              sub={quote(gesamt?.aergerquote ?? null)} />
      </div>

      {/* ── Hinweis zur Öffnungsrate ───────────────────────────── */}
      <div className="rounded-xl border border-white/5 bg-dark-950 px-4 py-3">
        <div className="text-xs font-semibold text-gray-400">Warum hier keine Öffnungsrate steht</div>
        <p className="text-[11px] text-gray-600 mt-1.5 leading-relaxed">
          SES zählt Öffnungen über ein unsichtbares Bild, das es in den HTML-Teil einer Mail
          einbaut. Diese Mails sind reiner Text — genau das lässt sie persönlich wirken. Dazu
          kommt: ein Zählpixel ist ohne Einwilligung des Empfängers rechtlich heikel, und Apple
          Mail lädt seit iOS&nbsp;15 alle Bilder vorab und meldet damit Öffnungen, die nie
          stattfanden. Die belastbaren Zahlen sind <span className="text-gray-400">zugestellt</span> und
          vor allem <span className="text-gray-400">Antworten</span>. Öffnungen werden trotzdem
          gespeichert, falls das Tracking später eingeschaltet wird.
        </p>
      </div>

      {/* ── Nischen ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-semibold text-white">Nach Nische</h2>
          {beste && (
            <span className="text-xs text-emerald-400">
              Stärkste Nische: {GEWERK_LABEL[beste.gewerk] ?? beste.gewerk} ({quote(beste.antwortquote)})
            </span>
          )}
        </div>

        {nischen.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-dark-950 px-4 py-8 text-center">
            <div className="text-sm text-gray-500">Noch keine Daten</div>
            <div className="text-xs text-gray-600 mt-1">
              Die Auswertung füllt sich, sobald die ersten Mails raus sind.
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-white/5 bg-dark-950 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-600 border-b border-white/5">
                  <th className="text-left  font-medium px-4 py-2.5">Nische</th>
                  <th className="text-right font-medium px-3 py-2.5">versendet</th>
                  <th className="text-right font-medium px-3 py-2.5">zugestellt</th>
                  <th className="text-right font-medium px-3 py-2.5">Antworten</th>
                  <th className="text-right font-medium px-3 py-2.5">Antwortquote</th>
                  <th className="text-right font-medium px-3 py-2.5">Abmeldungen</th>
                  <th className="text-right font-medium px-4 py-2.5">unzustellbar</th>
                </tr>
              </thead>
              <tbody>
                {nischen.map((n) => (
                  <tr key={n.gewerk} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-2.5 text-gray-300">
                      {GEWERK_LABEL[n.gewerk] ?? n.gewerk}
                      {!n.aussagekraeftig && (
                        <span className="ml-2 text-[10px] text-gray-600">zu wenig Daten</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-400 tabular-nums">{n.versendet}</td>
                    <td className="px-3 py-2.5 text-right text-gray-400 tabular-nums">{n.zugestellt}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-400 tabular-nums">{n.antworten}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {/* Quote nur zeigen, wenn die Menge sie traegt. Bei 1 von 3
                          stuende hier "33,3 %" — das liest sich wie ein Befund,
                          waere aber Zufall. */}
                      {n.aussagekraeftig
                        ? <span className="text-emerald-400 font-medium">{quote(n.antwortquote)}</span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${n.abmeldungen > 0 ? "text-amber-400" : "text-gray-600"}`}>
                      {n.abmeldungen}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${n.unzustellbar > 0 ? "text-red-400" : "text-gray-600"}`}>
                      {n.unzustellbar}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-gray-600 mt-2">
          Eine Quote wird erst ab {MINDESTMENGE_NISCHE} versendeten Mails je Nische
          angezeigt. Darunter ist jede Zahl Zufall — bei 10 Mails am Tag dauert das
          etwa zwei Wochen je Gewerk.
        </p>
      </div>

      {/* ── Antworten ──────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-2">Letzte Antworten</h2>
        {antworten.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-dark-950 px-4 py-8 text-center">
            <div className="text-sm text-gray-500">Noch keine Antworten</div>
          </div>
        ) : (
          <div className="space-y-2">
            {antworten.map((a) => (
              <div key={a.id} className="rounded-xl border border-white/5 bg-dark-950 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="text-sm font-medium text-white">{a.firma}</div>
                  <div className="text-[11px] text-gray-600">
                    {datum(a.zeitpunkt)}
                    {a.schritt && ` · auf Mail ${a.schritt}`}
                    {a.gewerk && ` · ${GEWERK_LABEL[a.gewerk] ?? a.gewerk}`}
                  </div>
                </div>
                {a.betreff && <div className="text-xs text-gray-400 mt-1">{a.betreff}</div>}
                {a.text && (
                  <p className="text-xs text-gray-500 mt-2 whitespace-pre-wrap line-clamp-6">
                    {a.text.slice(0, 800)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-gray-600">
        <Link href="/stellensignale/versand" className="text-brand-400 hover:underline">
          → zum Versand
        </Link>
      </div>
    </div>
  );
}
