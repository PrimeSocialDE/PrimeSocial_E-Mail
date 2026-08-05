import { getEntwuerfe, getHeuteGesendet, getSuppressionListe, getSequenzen, getHeuteFaellig } from "@/lib/stellensignale/db";
import { tagesbudget, imSendefenster, versandRiegel, sendefenster } from "@/lib/stellensignale/versand";
import type { StellenEntwurfMitFirma } from "@/types/stellensignale";
import type { SuppressionEintrag, SequenzZeile } from "@/lib/stellensignale/db";

// Betriebsansicht für den Versand: was geht heute raus, was wartet, was ist
// gesperrt und warum. Read-only — Freigeben passiert weiterhin unter /entwuerfe.
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

function Schalter({ name, an, bedeutung }: { name: string; an: boolean; bedeutung: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${an ? "bg-emerald-400" : "bg-gray-700"}`} />
      <div className="min-w-0">
        <div className={`text-xs font-mono ${an ? "text-emerald-400" : "text-gray-500"}`}>{name}</div>
        <div className="text-[11px] text-gray-600">{bedeutung}</div>
      </div>
    </div>
  );
}

export default async function VersandDashboard() {
  let entwuerfe: StellenEntwurfMitFirma[] = [];
  let heute = 0;
  let sperren: SuppressionEintrag[] = [];
  let sequenzen: SequenzZeile[] = [];
  let faellig: Record<number, number> = {};
  let ladeFehler: string | null = null;

  try {
    [entwuerfe, heute, sperren, sequenzen, faellig] = await Promise.all([
      getEntwuerfe(),
      getHeuteGesendet(),
      getSuppressionListe(50),
      getSequenzen(60),
      getHeuteFaellig(),
    ]);
  } catch (e) {
    ladeFehler = String(e instanceof Error ? e.message : e);
  }

  const { budget, stufe } = tagesbudget();
  const fenster = imSendefenster();
  const { von: fensterVon, bis: fensterBis } = sendefenster();

  const nachStatus = (s: string) => entwuerfe.filter((e) => e.status === s).length;
  const offen = nachStatus("entwurf");
  const freigegeben = nachStatus("freigegeben");
  const gesendet = nachStatus("gesendet");
  const verworfen = nachStatus("verworfen");
  const rest = Math.max(0, budget - heute);

  const mitFehler = entwuerfe.filter((e) => e.fehler && e.status !== "gesendet");

  const an = (v?: string) => v === "true";
  const versandAn = an(process.env.STELLENSIGNALE_VERSAND_ENABLED);
  const riegel = versandRiegel();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-white">Versand</h1>
        <p className="text-gray-500 text-sm mt-1">
          Tagesbudget, Warmup-Stufe und Rückläufe. Freigeben unter{" "}
          <a href="/stellensignale/entwuerfe" className="text-brand-400 hover:underline">Entwürfe</a>.
        </p>
      </div>

      {ladeFehler && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
          Migration ausstehend? ({ladeFehler})
        </div>
      )}

      {/* Die eine Zeile, die vorher fehlte: WARUM geht gerade nichts raus.
          Dieselbe Prüfung, die der Cron durchläuft — nicht nachgebaut, sondern
          dieselbe Funktion, damit beide nie auseinanderlaufen können. */}
      <div className={`mb-6 rounded-xl border px-4 py-3 ${
        riegel.ok
          ? "border-emerald-500/20 bg-emerald-500/5"
          : "border-amber-500/25 bg-amber-500/5"
      }`}>
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Versandbereitschaft</div>
        {riegel.ok ? (
          <div className="text-sm text-emerald-300">
            Alle Riegel offen. {freigegeben > 0
              ? `${freigegeben} freigegebene Mail(e), davon heute noch ${rest} im Budget.`
              : "Es ist aber nichts freigegeben — der Cron hat nichts zu senden."}
          </div>
        ) : (
          <div className="text-sm text-amber-300">
            <span className="font-medium">Es geht nichts raus.</span>{" "}
            {riegel.variable && <span className="font-mono text-xs">{riegel.variable}</span>}{" "}
            {riegel.grund}
          </div>
        )}
      </div>

      {versandAn && !process.env.SES_CONFIGURATION_SET && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          <span className="font-medium">Versand blockiert:</span>{" "}
          <span className="font-mono text-xs">SES_CONFIGURATION_SET</span> fehlt. Ohne Configuration Set
          meldet SES weder Bounces noch Beschwerden zurück — die Sperrliste bliebe leer und die
          Zustellrate würde unbemerkt einbrechen. Der Versand hält deshalb von selbst an.
        </div>
      )}

      {!versandAn && (
        <div className="mb-6 rounded-xl border border-white/10 bg-dark-950 px-4 py-3 text-sm text-gray-400">
          <span className="text-gray-300 font-medium">Versand ist aus.</span>{" "}
          <span className="font-mono text-xs">STELLENSIGNALE_VERSAND_ENABLED</span> steht nicht auf{" "}
          <span className="font-mono text-xs">true</span> — es geht nichts raus, auch nicht bei Freigabe.
        </div>
      )}

      {/* ── Heute ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Heute gesendet" value={heute} sub={`von ${budget} erlaubt`} accent={heute > 0 ? "gruen" : undefined} />
        <Stat label="Heute noch möglich" value={rest} sub={stufe} accent={rest === 0 ? "gelb" : undefined} />
        <Stat
          label="Sendefenster"
          value={fenster.ok ? "offen" : "zu"}
          sub={fenster.ok ? `Mo–Fr ${fensterVon}–${fensterBis} Uhr` : fenster.grund}
          accent={fenster.ok ? "gruen" : "gelb"}
        />
        <Stat label="Gesperrte Adressen" value={sperren.length} sub="nie wieder anschreiben" accent={sperren.length > 0 ? "rot" : undefined} />
      </div>

      {/* ── Heute fällig, nach Schritt ── */}
      <h2 className="text-sm font-semibold text-gray-300 mb-2">Heute fällig</h2>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Erstansprache" value={faellig[1] ?? 0} sub="neue Betriebe" accent={(faellig[1] ?? 0) > 0 ? "gruen" : undefined} />
        <Stat label="Nachfassen" value={faellig[2] ?? 0} sub="4 Tage nach Mail 1" />
        <Stat label="Abschluss" value={faellig[3] ?? 0} sub="3 Tage nach Mail 2" />
      </div>

      {/* ── Laufende Sequenzen ── */}
      <h2 className="text-sm font-semibold text-gray-300 mb-2">Sequenzen</h2>
      {sequenzen.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-dark-950 px-6 py-8 text-center text-sm text-gray-500 mb-6">
          Noch keine Sequenzen. Sie entstehen, sobald Entwürfe erzeugt werden.
        </div>
      ) : (
        <div className="rounded-xl border border-white/5 bg-dark-950 divide-y divide-white/5 mb-6">
          {sequenzen.map((s) => {
            const gestoppt = s.firma_status !== "aktiv";
            const gesendet = s.schritte.filter((x) => x.gesendet_at).length;
            // Nächster offener Schritt mit Termin — das ist die Information,
            // die im Alltag zählt: wann passiert als Nächstes was.
            const naechster = s.schritte.find((x) => !x.gesendet_at && x.status !== "verworfen");
            const punkte = [1, 2, 3].map((n) => {
              const st = s.schritte.find((x) => x.schritt === n);
              if (gestoppt && st && !st.gesendet_at) return "✕";
              return st?.gesendet_at ? "●" : "○";
            }).join("");

            let text: string;
            if (gestoppt) {
              text = s.firma_status === "cooldown" ? "gestoppt: hat geantwortet" : "gestoppt: abgemeldet oder gesperrt";
            } else if (gesendet === 3) {
              text = "abgeschlossen, keine Reaktion";
            } else if (naechster?.faellig_am) {
              const d = new Date(naechster.faellig_am);
              const heuteFaellig = d.getTime() <= Date.now();
              text = `Mail ${gesendet} gesendet · Mail ${naechster.schritt} ${heuteFaellig ? "fällig" : `am ${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`}`;
            } else if (gesendet > 0) {
              text = `Mail ${gesendet} gesendet · Folgetermin offen`;
            } else {
              text = "wartet auf Freigabe";
            }

            return (
              <div key={s.zielfirma_id} className="px-4 py-2.5 flex items-baseline gap-4">
                <span className="text-sm text-gray-300 truncate flex-1 min-w-0">{s.firma}</span>
                <span className={`font-mono text-sm shrink-0 ${gestoppt ? "text-amber-400" : "text-brand-400"}`}>{punkte}</span>
                <span className={`text-xs shrink-0 ${gestoppt ? "text-amber-400/80" : "text-gray-500"}`}>{text}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pipeline ── */}
      <h2 className="text-sm font-semibold text-gray-300 mb-2">Entwürfe</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Warten auf Freigabe" value={offen} accent={offen > 0 ? "gelb" : undefined} />
        <Stat label="Freigegeben, noch nicht raus" value={freigegeben} accent={freigegeben > 0 ? "gruen" : undefined} />
        <Stat label="Gesendet" value={gesendet} />
        <Stat label="Verworfen" value={verworfen} />
      </div>

      {/* ── Fehler ── */}
      {mitFehler.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-2">
            Fehlgeschlagen <span className="text-red-400">({mitFehler.length})</span>
          </h2>
          <div className="rounded-xl border border-red-500/20 bg-dark-950 divide-y divide-white/5">
            {mitFehler.slice(0, 15).map((e) => (
              <div key={e.id} className="px-4 py-2.5">
                <div className="text-sm text-gray-300">{e.firma}</div>
                <div className="text-[11px] text-red-400/80 font-mono mt-0.5">{e.fehler}</div>
                {e.versuche > 0 && <div className="text-[11px] text-gray-600">Versuche: {e.versuche}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Suppression ── */}
      <h2 className="text-sm font-semibold text-gray-300 mb-2">Gesperrte Adressen</h2>
      {sperren.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-dark-950 px-6 py-8 text-center text-sm text-gray-500">
          Noch keine Sperren. Hier landen Abmeldungen, Beschwerden und harte Bounces.
        </div>
      ) : (
        <div className="rounded-xl border border-white/5 bg-dark-950 divide-y divide-white/5 mb-6">
          {sperren.map((s) => {
            const farbe =
              s.grund === "complaint" ? "text-red-400" :
              s.grund === "opt_out" ? "text-amber-400" : "text-gray-400";
            return (
              <div key={s.email} className="px-4 py-2.5 flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm text-gray-300 truncate">{s.email}</div>
                  {s.detail && <div className="text-[11px] text-gray-600 truncate">{s.detail}</div>}
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-xs ${farbe}`}>{s.grund}</div>
                  <div className="text-[11px] text-gray-600">
                    {new Date(s.created_at).toLocaleDateString("de-DE")}
                    {s.quelle ? ` · ${s.quelle}` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Schalter ── */}
      <h2 className="text-sm font-semibold text-gray-300 mb-2 mt-6">Schalter</h2>
      <div className="rounded-xl border border-white/5 bg-dark-950 px-4 py-2 divide-y divide-white/5">
        <Schalter name="STELLENSIGNALE_ENABLED" an={an(process.env.STELLENSIGNALE_ENABLED)} bedeutung="Crawl: Arbeitsagentur, Karriereseiten, E-Mail-Findung" />
        <Schalter name="STELLENSIGNALE_OSM" an={an(process.env.STELLENSIGNALE_OSM)} bedeutung="Firmensuche über OpenStreetMap" />
        <Schalter name="STELLENSIGNALE_ARBEITSAGENTUR" an={an(process.env.STELLENSIGNALE_ARBEITSAGENTUR)} bedeutung="Stellensignale aus der Jobbörse" />
        <Schalter name="STELLENSIGNALE_ENTWUERFE_ENABLED" an={an(process.env.STELLENSIGNALE_ENTWUERFE_ENABLED)} bedeutung="Claude schreibt Entwürfe — hier entstehen Token-Kosten" />
        <Schalter name="STELLENSIGNALE_VERSAND_ENABLED" an={versandAn} bedeutung="Versand über SES" />
        <Schalter
          name="SES_CONFIGURATION_SET"
          an={!!process.env.SES_CONFIGURATION_SET}
          bedeutung="Pflicht für den Versand — nur damit meldet SES Bounces und Beschwerden zurück"
        />

        {/* Der SES-Zugang fehlte hier bisher. Genau daran kann der Versand
            scheitern, ohne dass es irgendwo ablesbar wäre: der Cron läuft,
            meldet "kein Versand" in eine Antwort, die niemand liest. */}
        <Schalter name="AWS_ACCESS_KEY_ID" an={!!process.env.AWS_ACCESS_KEY_ID} bedeutung="SES-Zugang — ohne ihn sendet nichts" />
        <Schalter name="AWS_SECRET_ACCESS_KEY" an={!!process.env.AWS_SECRET_ACCESS_KEY} bedeutung="SES-Zugang — ohne ihn sendet nichts" />
        <Schalter name="SES_FROM_EMAIL" an={!!process.env.SES_FROM_EMAIL} bedeutung={process.env.SES_FROM_EMAIL ?? "Absenderadresse der Kaltakquise-Domain"} />
        <Schalter name="CRON_SECRET" an={!!process.env.CRON_SECRET} bedeutung="schützt die Cron-Endpunkte vor fremdem Aufruf" />
        <Schalter name="SES_WARMUP_START" an={!!process.env.SES_WARMUP_START} bedeutung={process.env.SES_WARMUP_START ?? "ohne Startdatum gilt vorsichtshalber nur die Startmenge"} />
        <Schalter name="SES_WARMUP_START_MENGE" an={!!process.env.SES_WARMUP_START_MENGE} bedeutung={`Mails am ersten Warmup-Tag (aktuell ${process.env.SES_WARMUP_START_MENGE ?? "5 — Standard"})`} />
      </div>
    </div>
  );
}
