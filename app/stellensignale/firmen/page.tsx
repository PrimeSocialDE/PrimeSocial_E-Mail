import { getZielfirmen } from "@/lib/stellensignale/db";
import type { Zielfirma } from "@/types/stellensignale";

// Kompakte Zielfirmen-Übersicht: Firma groß, Details klein als Unterzeile.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_LABEL: Record<string, string> = {
  aktiv: "Aktiv",
  cooldown: "Cooldown",
  gesperrt: "Gesperrt",
  kunde: "Kunde",
};
const STATUS_CLS: Record<string, string> = {
  aktiv: "bg-emerald-500/10 text-emerald-400",
  cooldown: "bg-amber-500/10 text-amber-400",
  gesperrt: "bg-white/5 text-gray-600",
  kunde: "bg-brand-500/15 text-brand-400",
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/5 bg-dark-950 px-4 py-3">
      <div className="text-2xl font-bold text-white tabular-nums">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

// Domain ohne Protokoll/www — kürzer in der Unterzeile.
function kurzeDomain(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

export default async function ZielfirmenPage() {
  let firmen: Zielfirma[] = [];
  let ladeFehler: string | null = null;
  try {
    firmen = await getZielfirmen();
  } catch (e) {
    ladeFehler = String(e instanceof Error ? e.message : e);
  }

  const aktiv = firmen.filter((f) => f.status === "aktiv").length;
  const mitEmail = firmen.filter((f) => f.email).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-white">Zielfirmen</h1>
        <p className="text-gray-500 text-sm mt-1">
          Betriebe, die der Crawler beobachtet. Nur „Aktiv" wird gecrawlt.
        </p>
      </div>

      {ladeFehler && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
          Migration ausstehend? ({ladeFehler})
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-6 max-w-md">
        <Stat label="Firmen" value={firmen.length} />
        <Stat label="Aktiv" value={aktiv} />
        <Stat label="Mit E-Mail" value={mitEmail} />
      </div>

      {firmen.length === 0 && !ladeFehler ? (
        <div className="rounded-xl border border-white/5 bg-dark-950 px-6 py-12 text-center">
          <p className="text-gray-400 font-medium">Noch keine Zielfirmen.</p>
          <p className="text-gray-600 text-sm mt-1">Über „Einstellungen → Jetzt testen" den Crawl starten.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs text-gray-500">
                <th className="px-4 py-2.5 font-medium">Firma</th>
                <th className="px-4 py-2.5 font-medium">E-Mail</th>
                <th className="px-4 py-2.5 font-medium text-right">Mitarbeiter</th>
                <th className="px-4 py-2.5 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {firmen.map((f) => {
                const domain = kurzeDomain(f.website);
                const conf = f.email_confidence ?? 0;
                const confCls = conf >= 80 ? "text-emerald-400/70" : conf >= 55 ? "text-amber-400/70" : "text-gray-600";
                return (
                  <tr key={f.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] align-top">
                    <td className="px-4 py-2.5">
                      <div className="text-gray-200 font-medium leading-tight">{f.firma}</div>
                      <div className="text-[11px] text-gray-600 leading-tight mt-0.5">
                        {[f.gewerk, f.ort, domain].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {f.email ? (
                        <>
                          <div className="text-gray-400 leading-tight">{f.email}</div>
                          <div className={`text-[11px] leading-tight ${confCls}`}>
                            {f.email_quelle ?? "?"} · {conf}%
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-700">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-300 tabular-nums">
                      {f.mitarbeiter_geschaetzt ?? <span className="text-gray-700">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          STATUS_CLS[f.status] ?? "bg-white/5 text-gray-500"
                        }`}
                      >
                        {STATUS_LABEL[f.status] ?? f.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
