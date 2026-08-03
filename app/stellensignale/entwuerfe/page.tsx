import { getEntwuerfe } from "@/lib/stellensignale/db";
import { EntwuerfeClient } from "@/components/stellensignale/EntwuerfeClient";
import type { StellenEntwurfMitFirma } from "@/types/stellensignale";

// Vorgeschriebene E-Mail-Entwürfe (Phase 2). Erzeugen + Freigeben/Verwerfen.
// Kein automatischer Versand — nur Entwürfe zur Kontrolle.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EntwuerfePage() {
  let entwuerfe: StellenEntwurfMitFirma[] = [];
  let ladeFehler: string | null = null;
  try {
    entwuerfe = await getEntwuerfe();
  } catch (e) {
    ladeFehler = String(e instanceof Error ? e.message : e);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-white">Entwürfe</h1>
        <p className="text-gray-500 text-sm mt-1">
          Automatisch vorgeschriebene Erst-Mails (locker, nicht verkäuferisch). Pro Firma eine.
          Nichts wird automatisch versendet.
        </p>
      </div>

      {ladeFehler ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
          Migration ausstehend? ({ladeFehler})
        </div>
      ) : (
        <EntwuerfeClient initial={entwuerfe} />
      )}
    </div>
  );
}
