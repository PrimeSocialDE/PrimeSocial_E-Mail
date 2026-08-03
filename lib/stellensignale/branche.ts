// ─────────────────────────────────────────────────────────────────
// BRANCHEN-EINORDNUNG anhand von OSM-Kategorie und Firmenname.
//
// Warum das nötig ist: OpenStreetMap liefert alles, was in einer Region
// existiert. An echten Daten waren das 996 Betriebe — darunter Gramoflor,
// KLEYER Krandienst und Frischgeflügel Hesselfeld (genau die Zielgruppe),
// aber auch Foto-Studio Bühnemann, Galerie Kama und "Pilsland". 461 Betriebe
// hatten gar keine Zuordnung.
//
// Ungefiltert alle durch den Impressum-Scraper zu schicken kostet Stunden und
// senkt die Trefferquote auf wenige Prozent. Deshalb wird VOR der teuren
// Anreicherung entschieden, wer überhaupt in Frage kommt.
// ─────────────────────────────────────────────────────────────────

export type Relevanz = "ziel" | "vielleicht" | "raus";

export interface BranchenUrteil {
  gewerk: string | null;
  relevanz: Relevanz;
  grund: string;
}

/** OSM-Kategorien, die eindeutig auf ein Gewerk zeigen. */
const KATEGORIE_GEWERK: { muster: RegExp; gewerk: string }[] = [
  { muster: /electric|elektro/i,                                          gewerk: "elektro" },
  { muster: /plumber|hvac|heating|sanitary|klima|sanitaer/i,               gewerk: "shk" },
  { muster: /metal|blacksmith|welder|schlosser|steel|foundry|stahl/i,      gewerk: "metall" },
  { muster: /carpenter|joiner|roofer|builder|mason|scaffold|zimmer|dach/i, gewerk: "bau" },
  { muster: /gardener|landscape|garten/i,                                  gewerk: "galabau" },
  { muster: /works|industrial|machine|maschinen|product:/i,                gewerk: "industrie" },
];

/**
 * Firmennamen, die ein Gewerk verraten, wenn die Kategorie fehlt.
 *
 * BEWUSST OHNE Wortgrenzen: Im Deutschen stecken die Schlüsselwörter in
 * Komposita. "\bgeflügel\b" findet "Frischgeflügel" nicht, "\bmetallbau\b"
 * nicht "Nordmetallbau". An echten Daten blieben dadurch 718 von 1000 Firmen
 * unzugeordnet — darunter Frischgeflügel Hesselfeld und Tiefkühl-Frische-Center,
 * also genau die gesuchten Produktionsbetriebe.
 *
 * Ausnahme sind kurze, mehrdeutige Silben: "bau" braucht eine Wortgrenze
 * dahinter, sonst greift es bei "Bauer" oder "Bauunternehmen Baumann" falsch.
 */
const NAME_GEWERK: { muster: RegExp; gewerk: string }[] = [
  { muster: /(elektro|elektrotechnik|elektroinstallation|elektrik)/i,                 gewerk: "elektro" },
  { muster: /(sanitär|sanitaer|heizung|haustechnik|\bshk\b|klimatechnik|lüftung|lueftung|installation)/i, gewerk: "shk" },
  { muster: /(metallbau|schlosser|stahlbau|schweiss|schweiß|zerspanung|edelstahl|blech)/i, gewerk: "metall" },
  { muster: /(bauunternehm|zimmerei|zimmerer|dachdecker|maurer|hochbau|tiefbau|geruest|gerüst|bagger|erdbau|strassenbau|straßenbau|bau\b)/i, gewerk: "bau" },
  { muster: /(galabau|landschaftsbau|baumpflege|gartenbau|gartengestaltung)/i,        gewerk: "galabau" },
  { muster: /(maschinenfabrik|maschinenbau|anlagenbau|fertigung|produktion|industrie|kunststoff|verarbeitung|krandienst|spedition|logistik|fleisch|geflügel|gefluegel|molkerei|brauerei|tischlerei|schreinerei|lackier|giesserei|gießerei|werkzeugbau|apparatebau|foerdertechnik|fördertechnik|technik gmbh|werke\b)/i, gewerk: "industrie" },
];

/**
 * Betriebe, die als Kunde nicht in Frage kommen — zu klein, falsche Branche,
 * oder schlicht kein Bedarf an Recruiting-Videos für Fachkräfte.
 */
const NICHT_ZIELGRUPPE =
  /\b(foto[- ]?studio|fotograf|galerie|kunst|atelier|friseur|kosmetik|nagelstudio|tattoo|apotheke|arztpraxis|zahnarzt|physiotherapie|heilpraktik|restaurant|gaststätte|gaststaette|imbiss|pizzeria|café|cafe|bar\b|kiosk|blumen|boutique|second[- ]?hand|antiquariat|buchhandlung|reisebüro|reisebuero|versicherung|makler|immobilien|steuerberat|rechtsanwalt|kanzlei|schule|kindergarten|kita|verein|e\.?\s?v\.?$|kirche|museum|hotel|pension|ferienwohnung|solarium|fitness|yoga|tanzschule|fahrschule)\b/i;

/** OSM-Kategorien, die klar keine Zielgruppe sind. */
const KATEGORIE_RAUS =
  /(shop|bakery|butcher|hairdresser|photographer|artist|tailor|shoemaker|jeweller|optician|florist|confectionery|brewery.*shop|restaurant|cafe|bar)/i;

/**
 * Einordnung eines Betriebs. Beurteilt wird aus Kategorie UND Name — die
 * Kategorie ist präziser, fehlt aber oft.
 */
export function ordneEin(firma: string, kategorie: string | null): BranchenUrteil {
  // 1. Klare Ausschlüsse zuerst.
  const rausName = firma.match(NICHT_ZIELGRUPPE);
  if (rausName) return { gewerk: null, relevanz: "raus", grund: `keine Zielgruppe: "${rausName[0]}"` };
  if (kategorie && KATEGORIE_RAUS.test(kategorie)) {
    return { gewerk: null, relevanz: "raus", grund: `Kategorie "${kategorie}"` };
  }

  // 2. Gewerk aus der Kategorie — das verlässlichere Signal.
  if (kategorie) {
    for (const k of KATEGORIE_GEWERK) {
      if (k.muster.test(kategorie)) {
        return { gewerk: k.gewerk, relevanz: "ziel", grund: `Kategorie "${kategorie}"` };
      }
    }
  }

  // 3. Gewerk aus dem Firmennamen.
  for (const n of NAME_GEWERK) {
    if (n.muster.test(firma)) {
      return { gewerk: n.gewerk, relevanz: "ziel", grund: "Firmenname" };
    }
  }

  // 4. Weder das eine noch das andere. Nicht ausschließen — unter den
  //    Unzugeordneten stecken echte Perlen wie "Gramoflor" oder "Dettmer delo",
  //    deren Name nichts verrät. Aber hintanstellen: erst die klaren Ziele
  //    anreichern, diese nur wenn Kapazität übrig ist.
  return { gewerk: null, relevanz: "vielleicht", grund: "keine Zuordnung möglich" };
}
