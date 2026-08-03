/**
 * Testmail für das STELLENSIGNAL-Modul (personalisierte Recruiting-Erstansprache).
 *
 * Ruft erzeugeEntwurf() aus lib/stellensignale/entwurf.ts direkt auf — also
 * exakt die Funktion, die im Produktivbetrieb die Entwürfe schreibt — und
 * schickt das Ergebnis zur Ansicht an EINEN Empfänger.
 *
 * Bewusst OHNE Datenbank: die Firmen unten sind Testdaten. Damit lässt sich der
 * Ton tunen, bevor Discovery (Phase 1b) überhaupt läuft. Es wird nichts
 * gespeichert und kein echter Betrieb angeschrieben.
 *
 * Aufruf:
 *   npx tsx scripts/testmail-stellensignal.ts --dry     # nur anzeigen
 *   npx tsx scripts/testmail-stellensignal.ts           # an Empfänger senden
 *   npx tsx scripts/testmail-stellensignal.ts --nur=2   # nur Fall 2
 *
 * Benötigt: ANTHROPIC_API_KEY, BREVO_API_KEY (letzterer nur ohne --dry).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { erzeugeEntwurf } from "../lib/stellensignale/entwurf";
import { sendTemplateEmail } from "../lib/brevo";
import type { FirmaOutreach } from "../types/stellensignale";

const RECIPIENT_EMAIL = "max@primesocial.de";
const RECIPIENT_NAME  = "Max";

// ─────────────────────────────────────────────────────────────────
// TESTFÄLLE — hier Firmen/Stellen anpassen um den Ton zu prüfen.
// Die drei Fälle decken bewusst die unterschiedlichen Prompt-Zweige ab:
//   1) persönliche Mailadresse + GF bekannt  → "Moin Herr …"
//   2) allgemeines Postfach (info@)          → "Moin zusammen" + Weiterleitungsbitte
//   3) heißer Lead, lange offen              → schärferer Aufhänger
// ─────────────────────────────────────────────────────────────────
const TESTFAELLE: FirmaOutreach[] = [
  {
    zielfirma_id: "test-1",
    firma:  "Elektro Brummund GmbH",
    gewerk: "elektro",
    ort:    "Westerstede",
    plz:    "26655",
    website: "https://www.example-elektro.de",
    email:   "t.brummund@example-elektro.de",
    email_quelle:     "impressum",
    email_confidence: 90,
    gf_name: "Thomas Brummund",
    firma_status: "aktiv",
    signal_id:   "sig-1",
    stellentitel: "Elektroniker für Energie- und Gebäudetechnik (m/w/d)",
    quelle:      "arbeitsagentur",
    quelle_url:  null,
    raw_text:
      "Wir suchen zum nächstmöglichen Zeitpunkt einen Elektroniker für Energie- und " +
      "Gebäudetechnik (m/w/d) in Vollzeit. Ihre Aufgaben: Installation und Wartung " +
      "elektrischer Anlagen im Wohn- und Gewerbebau, Fehlersuche und Instandsetzung, " +
      "Kundendienst im Umkreis Westerstede/Oldenburg. Ihr Profil: abgeschlossene " +
      "Ausbildung als Elektroniker oder vergleichbar, Führerschein Klasse B, " +
      "selbstständige und sorgfältige Arbeitsweise, Teamfähigkeit. Wir bieten: " +
      "unbefristete Festanstellung, 30 Tage Urlaub, moderne Werkzeuge und Fahrzeuge, " +
      "betriebliche Altersvorsorge, familiäres Team.",
    erstfund:     "2026-05-02",
    letzter_fund: "2026-07-26",
    ist_fachkraft: true,
    wochen_offen: 12,
    ist_heiss:    true,
    anzahl_signale: 1,
  },
  {
    zielfirma_id: "test-2",
    firma:  "Heitmann Haustechnik GmbH & Co. KG",
    gewerk: "shk",
    ort:    "Bad Zwischenahn",
    plz:    "26160",
    website: "https://www.example-haustechnik.de",
    email:   "info@example-haustechnik.de",
    email_quelle:     "impressum",
    email_confidence: 70,
    gf_name: "Andrea Heitmann",
    firma_status: "aktiv",
    signal_id:   "sig-2",
    stellentitel: "Anlagenmechaniker SHK (m/w/d)",
    quelle:      "indeed",
    quelle_url:  null,
    raw_text:
      "Zur Verstärkung unseres Teams suchen wir einen Anlagenmechaniker für Sanitär-, " +
      "Heizungs- und Klimatechnik (m/w/d). Schwerpunkt Bad- und Heizungsmodernisierung " +
      "im Privatkundenbereich, zunehmend Wärmepumpen. Wir arbeiten überwiegend im " +
      "Umkreis von 30 km, keine Montage. Voraussetzung: abgeschlossene Ausbildung im " +
      "SHK-Handwerk, Berufserfahrung von Vorteil, aber auch Berufseinsteiger willkommen. " +
      "Geboten werden übertarifliche Bezahlung, 4-Tage-Woche möglich, eigenes " +
      "Servicefahrzeug, Fortbildungen (u.a. Wärmepumpe).",
    erstfund:     "2026-06-15",
    letzter_fund: "2026-07-27",
    ist_fachkraft: true,
    wochen_offen: 6,
    ist_heiss:    false,
    anzahl_signale: 1,
  },
  {
    zielfirma_id: "test-3",
    firma:  "Nordmetall Stahlbau GmbH",
    gewerk: "metall",
    ort:    "Wilhelmshaven",
    plz:    "26382",
    website: "https://www.example-stahlbau.de",
    email:   "bewerbung@example-stahlbau.de",
    email_quelle:     "anzeige",
    email_confidence: 85,
    gf_name: null,
    firma_status: "aktiv",
    signal_id:   "sig-3",
    stellentitel: "Schweißer / Metallbauer (m/w/d)",
    quelle:      "kleinanzeigen",
    quelle_url:  null,
    raw_text:
      "Für unsere Fertigung in Wilhelmshaven suchen wir dringend Schweißer bzw. " +
      "Metallbauer (m/w/d). Aufgaben: Schweißen von Stahlkonstruktionen (MAG/WIG), " +
      "Zuschnitt und Vorrichtung, Montage im Werk. Gültige Schweißerprüfung " +
      "wünschenswert, Quereinsteiger mit handwerklichem Geschick werden angelernt. " +
      "Zwei-Schicht-Betrieb, Schichtzulagen, unbefristet, Weihnachts- und Urlaubsgeld.",
    erstfund:     "2026-02-10",
    letzter_fund: "2026-07-25",
    ist_fachkraft: true,
    wochen_offen: 24,
    ist_heiss:    true,
    anzahl_signale: 3,
  },
];

const args   = process.argv.slice(2);
const dryRun = args.includes("--dry");
const nurArg = args.find((a) => a.startsWith("--nur="));
const nurIdx = nurArg ? parseInt(nurArg.split("=")[1], 10) : null;

async function run() {
  console.log(`\n🔧 Stellensignal-Entwürfe → ${RECIPIENT_EMAIL}${dryRun ? "  (DRY RUN)" : ""}\n`);
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY fehlt in .env.local");
  if (!dryRun && !process.env.BREVO_API_KEY) throw new Error("BREVO_API_KEY fehlt in .env.local");

  const faelle = nurIdx ? [TESTFAELLE[nurIdx - 1]].filter(Boolean) : TESTFAELLE;

  for (let i = 0; i < faelle.length; i++) {
    const f = faelle[i];
    const nr = nurIdx ?? i + 1;

    const adressTyp = /^(info|kontakt|office|mail|service|team|karriere|jobs?|bewerbung|personal|hr)\b/i
      .test((f.email ?? "").split("@")[0]) ? "Postfach → 'Moin zusammen' + Weiterleitungsbitte" : "persönlich";

    console.log(`── Fall ${nr}: ${f.firma} ──`);
    console.log(`   ${f.gewerk} · ${f.ort} · ${f.stellentitel}`);
    console.log(`   ${f.wochen_offen} Wochen offen${f.ist_heiss ? " (heiß)" : ""} · Adresse: ${adressTyp}`);

    const entwurf = await erzeugeEntwurf(f);
    if (!entwurf) {
      console.log("   ❌ Claude hat kein valides JSON geliefert\n");
      continue;
    }

    // Seit der Sequenz liefert erzeugeEntwurf drei Mails. Geprueft wird jede
    // einzeln — Mail 2 und 3 haben eigene Laengen- und Inhaltsregeln.
    const mails = [
      { nr: 1, label: "Erstansprache",            m: entwurf.mail_1, maxWoerter: 200 },
      { nr: 2, label: "Nachfassen (+4 Tage)",     m: entwurf.mail_2, maxWoerter: 90  },
      { nr: 3, label: "Abschluss (+3 Tage)",      m: entwurf.mail_3, maxWoerter: 65  },
    ];
    for (const { nr, label, m, maxWoerter } of mails) {
      const w = m.text.trim().split(/\s+/).length;
      console.log(`\n   ── Mail ${nr}: ${label} · ${w} Wörter ──`);
      console.log(`   Betreff: ${m.betreff}`);
      console.log(m.text.split("\n").map((l) => `   │ ${l}`).join("\n"));
      if (w > maxWoerter) console.log(`   ⚠️  zu lang: ${w} Wörter (Ziel ≤ ${maxWoerter})`);
      if (nr > 1 && /https?:\/\//.test(m.text)) console.log("   ⚠️  Video-Link in einer Folgemail — gehört nur in Mail 1");
      if (nr === 3 && /\?/.test(m.text)) console.log("   ⚠️  Frage in Mail 3 — der Abschluss soll nichts mehr verlangen");
      if (/letzte Chance|letztes Mal|Frist/i.test(m.text)) console.log("   ⚠️  Druckformulierung gefunden");
      // Zu dick aufgetragene Vertrautheit — der haeufigste Weg, sich unsympathisch zu machen.
      const anbiedernd = m.text.match(/kennt man hier|kennt hier jeder|sieht man ständig|quasi Nachbarn|direkt um die Ecke|jeder kennt/i);
      if (anbiedernd) console.log(`   ⚠️  Zu vertraut: "${anbiedernd[0]}"`);
    }
    const entwurfAlt = entwurf.mail_1; // fuer die folgenden QA-Pruefungen

    // ── Automatische QA — fängt die bekannten Schwachstellen ──
    const warnungen: string[] = [];

    const betreffWoerter = entwurfAlt.betreff.trim().split(/\s+/).length;
    if (entwurfAlt.betreff.length > 45 || betreffWoerter > 6) {
      warnungen.push(`Betreff zu lang: ${entwurfAlt.betreff.length} Zeichen / ${betreffWoerter} Wörter (max 45 / 6)`);
    }
    const verboten = /\b(Angebot|Kooperation|Zusammenarbeit|Partnerschaft|Anfrage|Unverbindlich)\b/i;
    if (verboten.test(entwurfAlt.betreff)) warnungen.push(`Verbotenes Wort im Betreff: "${entwurfAlt.betreff}"`);

    const anreden = entwurfAlt.text.match(/^(Moin|Hallo|Hi|Guten Tag|Sehr geehrte)\b.*$/gim) ?? [];
    if (anreden.length > 1) {
      warnungen.push(`${anreden.length} Anreden statt einer: ${anreden.map((a) => `"${a.trim()}"`).join(", ")}`);
    }

    // Regionaler Einstieg: der Text vor der ersten Erwähnung der Stelle muss
    // die Nähe transportieren — nicht erst irgendwo weiter unten.
    const ohneAnrede = entwurfAlt.text.replace(/^(Moin|Hallo|Hi|Guten Tag)[^\n]*\n+/i, "");
    const einstieg = ohneAnrede.slice(0, 450);
    const regional = /Oldenburg|Gegend|Ecke|Region|Nachbar|hier aus|von hier|hier in|bei (Ihnen|euch) um/i;
    if (!regional.test(einstieg)) {
      warnungen.push("Einstieg ohne regionalen Bezug — Nähe kommt zu spät oder gar nicht");
    }

    // Absatzlänge: der Prompt erlaubt max. 3 Sätze je Absatz. Fängt vor allem
    // den Fall ab, dass Angebot und Ausspielung wieder in einen Block rutschen.
    const absaetze = entwurfAlt.text.split(/\n\s*\n/).map((a) => a.trim()).filter(Boolean);
    const zuLang = absaetze.filter(
      // 4 Sätze / 450 Zeichen als Obergrenze: der Analyse-Absatz darf laut
      // Prompt vier, alle anderen drei. Was hier anschlägt, ist wirklich zu lang.
      (a) => !a.startsWith("http") && (a.length > 450 || (a.match(/[.!?](\s|$)/g) ?? []).length > 4),
    );
    if (zuLang.length) {
      warnungen.push(
        `${zuLang.length} zu langer Absatz (max 4 Sätze / 450 Zeichen): "${zuLang[0].slice(0, 70)}…"`,
      );
    }

    // Reihenfolge + CTA. Der Beispiel-Link steht in der Mail, also darf der
    // Abschluss nicht anbieten, ihn zu schicken — und das Angebot gehört
    // unter den Link, nicht darüber.
    const linkPos = entwurfAlt.text.search(/https?:\/\//);
    const angebotPos = entwurfAlt.text.search(/kostenlos (und )?ohne Vertrag|ohne Vertrag und kostenlos|kostenlos und unverbindlich/i);
    if (linkPos !== -1 && angebotPos !== -1 && angebotPos < linkPos) {
      warnungen.push("Angebot steht ÜBER dem Beispiel-Link statt darunter");
    }
    if (linkPos !== -1 && /(Beispielvideo|Beispiel).{0,30}(schicken|zusenden|zuschicken|rüberschicken)/i.test(entwurfAlt.text)) {
      warnungen.push("CTA bietet an, das Beispielvideo zu schicken — steht aber schon als Link in der Mail");
    }

    // Gatekeeper-Mails: kurz halten, und die Weiterleitungsbitte gehört ans
    // Ende. Steht sie vorne, liest das Büro "Arbeitsanweisung von einem
    // Fremden" und sortiert aus, bevor der Rest überhaupt gelesen wird.
    const istPostfach = /^(info|kontakt|office|mail|service|team|karriere|jobs?|bewerbung|personal|hr)\b/i
      .test((f.email ?? "").split("@")[0]);
    if (istPostfach) {
      const woerter = entwurfAlt.text.trim().split(/\s+/).length;
      if (woerter > 160) warnungen.push(`Gatekeeper-Mail zu lang: ${woerter} Wörter (Ziel 140)`);

      const weiterleitung = entwurfAlt.text.search(/weiterleit|weitergeb|weiterreich|weiterschick/i);
      if (weiterleitung !== -1) {
        const anteil = weiterleitung / entwurfAlt.text.length;
        if (anteil < 0.5) {
          warnungen.push(
            `Weiterleitungsbitte steht bei ${Math.round(anteil * 100)}% des Textes — gehört ans Ende (>50%)`,
          );
        }
      }
      if (/richtige[nr]? (Person|Ansprechpartner)|zuständige[nr]? Ansprechpartner|der das entscheiden kann/i.test(entwurfAlt.text)) {
        warnungen.push("Wertet die lesende Person ab ('die richtige Person' / 'zuständiger Ansprechpartner')");
      }
    }

    // Belehrende Diagnose-Sätze
    const belehrend = /kein Zufall|kein Pech|üblichen Wege|reicht (das|es) (offenbar|wohl) nicht|funktioniert.{0,20}Anzeige nicht|machen Sie (etwas|was) falsch/i;
    const treffer = entwurfAlt.text.match(belehrend);
    if (treffer) warnungen.push(`Belehrender Diagnose-Satz: "${treffer[0]}"`);

    // Sie/ihr-Mischung. Bewusst OHNE bares "Ihr": am Satzanfang ist "Ihr seht"
    // das saloppe Plural-Ihr, nicht die Höflichkeitsform — das hat vorher
    // Fehlalarme auf durchgängig geduzten Texten erzeugt.
    const hatSie = /\bIhnen\b|\bIhre[nmrs]?\b|\bSie\b/.test(entwurfAlt.text);
    const hatIhr = /\beuch\b|\beuer\b|\beure[nmrs]?\b|\bihr\s+(seht|habt|seid|könnt|mögt|braucht|sucht|bietet)\b/i.test(entwurfAlt.text);
    if (hatSie && hatIhr) warnungen.push("Mischt 'Sie' und 'ihr/euch' im selben Text");

    if (/\[Video-Beispiel/i.test(entwurfAlt.text)) {
      warnungen.push("Video-Platzhalter NICHT ersetzt (kein Referenz-Match und kein default_link)");
    }
    if (/[—–]/.test(entwurfAlt.text)) warnungen.push("Gedankenstrich im Text");

    if (warnungen.length) {
      console.log("");
      for (const w of warnungen) console.log(`   ⚠️  ${w}`);
    } else {
      console.log(`\n   ✓ QA sauber (Betreff ${entwurfAlt.betreff.length} Zeichen / ${betreffWoerter} Wörter)`);
    }

    if (!dryRun) {
      await sendTemplateEmail({
        to:      { email: RECIPIENT_EMAIL, name: RECIPIENT_NAME },
        subject: `[STELLENSIGNAL ${nr}/${TESTFAELLE.length}] ${entwurfAlt.betreff}`,
        bodyText: entwurfAlt.text,
      });
      console.log(`\n   ✅ gesendet an ${RECIPIENT_EMAIL}`);
    }
    console.log("");
  }

  console.log("✨ Fertig.\n");
}

run().catch((e) => {
  console.error("\n❌ Fehlgeschlagen:", e);
  process.exit(1);
});
