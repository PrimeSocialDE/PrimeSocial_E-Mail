import type { ResearchProspect } from "@/types/research";

// Handoff-Link ins Manuell-Schreiben mit vorausgefülltem Dossier.
// Gemeinsam genutzt von ProspectCard (einzeln) und RechercheClient (sequenziell).
export function buildHandoffUrl(p: ResearchProspect): string {
  const params = new URLSearchParams();
  if (p.best_email) params.set("to", p.best_email);
  if (p.company_name) params.set("company", p.company_name);
  if (p.branche_final) params.set("branche", p.branche_final);
  if (p.gf_name) params.set("first", p.gf_name.split(/\s+/)[0]);
  if (p.hook) params.set("hook", p.hook);
  return `/manuell/schreiben?${params.toString()}`;
}
