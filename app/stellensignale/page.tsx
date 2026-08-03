import { getFirmaOutreach, getEntwuerfe } from "@/lib/stellensignale/db";
import type { FirmaOutreach } from "@/types/stellensignale";

// Übersicht: EINE Zeile pro Firma (heißeste Stelle). Read-only, zum schnellen
// Drüberschauen. Details/alle Signale bleiben in der DB — hier nur das Wichtigste.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/5 bg-dark-950 px-4 py-3">
      <div className={accent ? "text-2xl font-bold text-brand-400" : "text-2xl font-bold text-white"}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function EmailBadge({ email, conf }: { email: string | null; conf: number | null }) {
  if (!email) return <span className="text-xs text-gray-700">—</span>;
  const c = conf ?? 0;
  const cls = c >= 80 ? "text-emerald-400" : c >= 55 ? "text-amber-400" : "text-gray-500";
  const label = c >= 80 ? "sicher" : c >= 55 ? "ok" : "vermutet";
  return (
    <span className="text-xs">
      <span className="text-gray-400">{email}</span>{" "}
      <span className={cls}>· {label}</span>
    </span>
  );
}

export default async function StellensignaleUebersicht() {
  let firmen: FirmaOutreach[] = [];
  let entwurfIds = new Set<string>();
  let ladeFehler: string | null = null;
  try {
    firmen = await getFirmaOutreach();
    const entw = await getEntwuerfe();
    entwurfIds = new Set(entw.map((e) => e.zielfirma_id));
  } catch (e) {
    ladeFehler = String(e instanceof Error ? e.message : e);
  }

  const mitEmail = firmen.filter((f) => f.email).length;
  const heiss = firmen.filter((f) => f.ist_heiss).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-white">Stellensignale</h1>
        <p className="text-gray-500 text-sm mt-1">
          Eine Zeile pro Firma — die heißeste offene Stelle. Heiße Leads (≥8 Wochen offen) oben.
        </p>
      </div>

      {ladeFehler && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
          Migration ausstehend? ({ladeFehler})
        </div>
      )}

      <div className="grid grid-cols-4 gap-3 mb-6 max-w-2xl">
        <Stat label="Firmen" value={firmen.length} />
        <Stat label="Mit E-Mail" value={mitEmail} />
        <Stat label="🔥 Heiß" value={heiss} accent />
        <Stat label="Mit Entwurf" value={entwurfIds.size} />
      </div>

      {firmen.length === 0 && !ladeFehler ? (
        <div className="rounded-xl border border-white/5 bg-dark-950 px-6 py-12 text-center">
          <p className="text-gray-400 font-medium">Noch keine Firmen mit offenen Stellen.</p>
          <p className="text-gray-600 text-sm mt-1">Lauf über „Einstellungen → Jetzt testen" starten.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs text-gray-500">
                <th className="px-4 py-3 font-medium">Firma</th>
                <th className="px-4 py-3 font-medium">Gewerk · Ort</th>
                <th className="px-4 py-3 font-medium">Heißeste Stelle</th>
                <th className="px-4 py-3 font-medium text-right">Wo. offen</th>
                <th className="px-4 py-3 font-medium text-center">Anzeigen</th>
                <th className="px-4 py-3 font-medium">E-Mail</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {firmen.map((f) => {
                const gewerkOrt = [f.gewerk, f.ort].filter(Boolean).join(" · ") || "—";
                return (
                  <tr key={f.zielfirma_id} className="border-b border-white/[0.03] hover:bg-white/[0.02] whitespace-nowrap">
                    <td className="px-4 py-2 text-gray-200 font-medium max-w-[220px] truncate" title={f.firma}>
                      {f.firma}
                    </td>
                    <td className="px-4 py-2 text-gray-500 max-w-[170px] truncate" title={gewerkOrt}>
                      {gewerkOrt}
                    </td>
                    <td className="px-4 py-2 text-gray-400 max-w-[300px] truncate" title={f.stellentitel}>
                      {f.stellentitel}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-300 tabular-nums">{f.wochen_offen}</td>
                    <td className="px-4 py-2 text-center text-gray-500 tabular-nums">{f.anzahl_signale}</td>
                    <td className="px-4 py-2 max-w-[220px] truncate" title={f.email ?? ""}>
                      <EmailBadge email={f.email} conf={f.email_confidence} />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {f.ist_heiss && (
                          <span className="inline-flex items-center rounded-full bg-brand-500/15 px-2 py-0.5 text-xs font-medium text-brand-400">🔥</span>
                        )}
                        {entwurfIds.has(f.zielfirma_id) && (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">✉︎</span>
                        )}
                        {!f.ist_heiss && !entwurfIds.has(f.zielfirma_id) && (
                          <span className="text-xs text-gray-700">{f.ist_fachkraft ? "Fachkraft" : "—"}</span>
                        )}
                      </div>
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
