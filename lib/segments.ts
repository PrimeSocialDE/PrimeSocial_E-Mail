import type { Segment, InstagramData, InstagramPost } from "@/types";

// ─────────────────────────────────────────────────────────────────
// Segment-Routing (welcher Lead bekommt Mails, wer wartet, wer ist raus)
// ─────────────────────────────────────────────────────────────────

// Pause-Grund — wird in primesocial_leads.pause_reason gespeichert
export type PauseReason =
  | "segment_watch"      // Segment passt aktuell nicht (INAKTIV/VIRALAUSREISSER/WENIGREICHWEITE) → alle 3 Monate erneut scrapen
  | "meta_ads_active"    // SOLIDE + viele professionelle Ads → keine Mail, alle 3 Monate Ad-Library prüfen
  | "no_instagram"       // KEININSTAGRAM → Blacklist, kein Re-Scrape
  | "no_summary"         // KEINSUMMARY → Website-Summary nach 3 Versuchen nicht erstellbar, kein Re-Scrape
  | "manual"             // Manuell ausgeschlossen (Bestandskunde, KEINFIT, etc.)
  | "bounced"            // Bounce/Mail nicht zustellbar
  | "spam_complaint";    // Empfänger hat als Spam markiert — Reputationsschutz, niemals reaktivieren

// Welche Segmente bekommen Mails?
export const MAIL_ELIGIBLE_SEGMENTS: Segment[] = ["INKONSISTENT", "KEINEVIDEO", "SOLIDE"];

// Welche Segmente werden alle 3 Monate erneut gescrapt?
export const RESCRAPE_SEGMENTS: Segment[] = ["INAKTIV", "VIRALAUSREISSER", "WENIGREICHWEITE"];

// Re-Scrape-Intervall in Tagen (90 = 3 Monate)
export const RESCRAPE_INTERVAL_DAYS = 90;

// Routing-Entscheidung pro Segment beim Lead-Eingang oder nach Re-Scrape
export interface SegmentRouting {
  status: "active" | "paused";
  pause_reason: PauseReason | null;
  // Hinweis: bei SOLIDE muss zusätzlich geprüft werden ob der Lead bereits viele
  // professionelle Meta-Ads schaltet. Diese Prüfung passiert separat (Ad-Library)
  // und kann den Status nachträglich auf paused/meta_ads_active setzen.
  needs_meta_ads_check?: boolean;
}

export function getSegmentRouting(segment: Segment | null): SegmentRouting {
  if (!segment) {
    // Kein Segment ermittelt → noch nicht entscheidbar, lassen wir auf paused
    return { status: "paused", pause_reason: "segment_watch" };
  }
  if (segment === "KEININSTAGRAM") {
    return { status: "paused", pause_reason: "no_instagram" };
  }
  if (segment === "KEINSUMMARY") {
    return { status: "paused", pause_reason: "no_summary" };
  }
  if (segment === "KEINFIT") {
    return { status: "paused", pause_reason: "manual" };
  }
  if (RESCRAPE_SEGMENTS.includes(segment)) {
    return { status: "paused", pause_reason: "segment_watch" };
  }
  if (segment === "SOLIDE") {
    // SOLIDE bekommt Mails (Pitch auf Meta Ads), aber erst nach Ad-Library-Check
    return { status: "active", pause_reason: null, needs_meta_ads_check: true };
  }
  // INKONSISTENT, KEINEVIDEO → direkt in Mail-Flow
  return { status: "active", pause_reason: null };
}

// ─────────────────────────────────────────────────────────────────
// Segment Classification (Prioritätskaskade)
// ─────────────────────────────────────────────────────────────────
// KEINFIT wird NIE automatisch vergeben. Es ist ein manuelles Label
// für Leads die aus anderen Gründen nicht zur Zielgruppe passen
// (z.B. falsche Branche, zu klein, bereits Kunde eines Wettbewerbers).
// Automatische Klassifizierung gibt SOLIDE als Fallback zurück.
export function classifySegment(data: InstagramData | null): Segment {
  if (!data || !data.username) return "KEININSTAGRAM";

  const posts: InstagramPost[] = data.latestPosts ?? [];
  const now = new Date();

  // 1. KEININSTAGRAM
  if (posts.length === 0 && !data.followersCount) return "KEININSTAGRAM";

  // 2. INAKTIV – letzter Post > 4 Wochen
  const postDates = posts
    .map((p) => (p.timestamp ? new Date(p.timestamp) : null))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime());

  if (postDates.length === 0) return "INAKTIV";
  const daysSincePost = (now.getTime() - postDates[0].getTime()) / (1000 * 60 * 60 * 24);
  if (daysSincePost > 28) return "INAKTIV";

  // 3. INKONSISTENT – Lücken > 2 Wochen zwischen Posts
  if (postDates.length >= 3) {
    for (let i = 0; i < postDates.length - 1; i++) {
      const gapDays = (postDates[i].getTime() - postDates[i + 1].getTime()) / (1000 * 60 * 60 * 24);
      if (gapDays > 14) return "INKONSISTENT";
    }
  }

  // 4. KEINEVIDEO – alle videoViewCount null/0
  const hasVideo = posts.some((p) => p.videoViewCount && p.videoViewCount > 0);
  if (!hasVideo) return "KEINEVIDEO";

  // 5. WENIGREICHWEITE – Ø < 500 Views
  const videoPosts = posts.filter((p) => p.videoViewCount && p.videoViewCount > 0);
  if (videoPosts.length > 0) {
    const avgViews = videoPosts.reduce((s, p) => s + (p.videoViewCount ?? 0), 0) / videoPosts.length;
    if (avgViews < 500) return "WENIGREICHWEITE";
  }

  // 6. VIRALAUSREISSER – ein Post mit 10x mehr Views als Ø
  if (videoPosts.length >= 2) {
    const views = videoPosts.map((p) => p.videoViewCount ?? 0);
    const avg = views.reduce((s, v) => s + v, 0) / views.length;
    if (views.some((v) => v >= avg * 10)) return "VIRALAUSREISSER";
  }

  // 7. SOLIDE — Profil hat gutes Engagement, passt durch alle Filter
  return "SOLIDE";
}

// ─────────────────────────────────────────────────────────────────
// Pain Points
// ─────────────────────────────────────────────────────────────────
export const SEGMENT_PAIN: Record<string, string> = {
  KEININSTAGRAM:   "Social Media existiert nicht im Unternehmen — komplett unsichtbar auf den Plattformen, wo Kunden zuerst suchen.",
  INAKTIV:         "Schlechtes Gewissen, wissen dass sie sollten, schaffen es nicht. 'Ab Montag posten wir wieder' — kennt man.",
  INKONSISTENT:    "Scheitern immer wieder an Konstanz. Teufelskreis: Pause → Algorithmus bestraft → weniger Reichweite → weniger Motivation.",
  KEINEVIDEO:      "Wissen dass Video funktioniert, trauen sich nicht ran. Kamera-Scheu, kein Equipment-Wissen, Angst sich zu blamieren.",
  WENIGREICHWEITE: "Machen sich Mühe aber keiner sieht es. Frustriert, zweifeln ob Social Media für ihre Branche funktioniert.",
  VIRALAUSREISSER: "Haben Erfolg geschmeckt, können ihn nicht reproduzieren. Wissen nicht warum es funktioniert hat.",
  SOLIDE:          "Organisch läuft es — aber Reichweite ist gedeckelt. Der Algorithmus zeigt den Content fast nur Bestandsaudience und ähnlichen Profilen. Wachstum hört da auf, wo organisch keine neuen Zielgruppen mehr dazukommen.",
};

export const SEGMENT_PERSPEKTIVWECHSEL: Record<string, string> = {
  KEININSTAGRAM:   "Wenn jemand heute nach eurer Branche sucht, beginnt der Weg oft auf Social Media",
  INAKTIV:         "Ein stiller Kanal sendet das Signal: Hier passiert gerade nichts",
  INKONSISTENT:    "Ein sporadischer Kanal wirkt unzuverlässig — auch für Bestandskunden",
  KEINEVIDEO:      "Der Algorithmus bevorzugt Video massiv — Bilder werden zunehmend unsichtbar",
  WENIGREICHWEITE: "Eure Arbeit ist nicht umsonst — es fehlen nur kleine Stellschrauben",
  VIRALAUSREISSER: "Eure Zielgruppe ist bewiesen da — es fehlt nur das System",
  SOLIDE:          "Organisch erreicht ihr hauptsächlich Leute die euch schon kennen — neue Zielgruppen findet ihr darüber kaum",
};

export const SEGMENT_NIEDRIGSTE_HUERDE: Record<string, string> = {
  KEININSTAGRAM:   "Kein Pitch, kein Vertrag — nur ein System das funktioniert",
  INAKTIV:         "Ich zeige euch wie 3 Posts pro Woche aussehen können — ohne Zeitaufwand",
  INKONSISTENT:    "Ein einfacher Wochenplan der dauerhaft funktioniert",
  KEINEVIDEO:      "3 Video-Formate die komplett ohne Gesicht funktionieren",
  WENIGREICHWEITE: "2-3 Anpassungen die sofort mehr Reichweite bringen",
  VIRALAUSREISSER: "Analyse eures viralen Beitrags + Formel zum Wiederholen",
  SOLIDE:          "Eine erste kleine Meta-Ad-Kampagne mit eurem bestehenden Content — inhaltlich müsst ihr nichts umstellen",
};

// ─────────────────────────────────────────────────────────────────
// Segment-spezifische Schreibregeln je Step (Steps 1-3: Claude-generiert)
// @deprecated — Im v3-Prompt sind die Gedanken pro Segment direkt im System-
// Prompt verdrahtet (Gedanken-Mapping). Wird nur noch von Legacy-Wrappern
// (generateOpener/generateFollowUp) und alten Test-Scripts verwendet.
// ─────────────────────────────────────────────────────────────────
export const STEP_RULES_BY_SEGMENT: Record<string, Record<number, string>> = {
  KEINEVIDEO: {
    1: `PAIN-FIRST-Struktur (siehe globale MAIL 1 Regeln im System Prompt):

Block 1 — Pain-Aussage:
Direkt das Problem benennen, ohne Aufwärmen. Der Feed besteht aus Bildern/Karussells, das ist auf Instagram aktuell ein Wachstumsstopper. Reels werden ganz anderen Audiences gezeigt — und das ist nicht eine kleine Sache, das ist der Hauptmechanismus auf Instagram 2026.

Block 2 — Beweis:
Ein konkretes Karussell oder Bild aus dem Feed nennen. Zeigen warum es das Muster bestätigt: Inhalt war stark, aber Format begrenzt die Reichweite auf Bestandsfollower.

Block 3 — Konsequenz für DIESE Branche:
Was es konkret kostet bei der spezifischen Branche/Zielgruppe. Bei B2B/Beratung: Vertrauen entsteht über Wiedererkennung — die fehlt wenn man keine Gesichter/Bewegung zeigt. Bei Handwerk/Gastro: man verschenkt die Sichtbarkeit bei der Zielgruppe die einen noch nicht kennt.

Block 4 — PDF-Tease:
Den Case "Kreisbahn Aurich" namentlich nennen. Pattern: gleiche Ausgangslage (Bilder/Karussells, gute Inhalte, wenig Reichweite). Outcome: über 75.000 Views auf einzelnen Reels, Engagement verdoppelt. Kernsatz: "Ohne dass sich der Content-Inhalt geändert hätte, nur das Format."

VERBOTEN: "mir ist auf eurem Instagram was aufgefallen", "ich hab mir eure Posts angeschaut", "Lob-erst-dann-Problem"-Muster.`,
    2: `Greife einen ANDEREN Post auf als Mail 1 (ein anderes Karussell/Grafik-Posting).
Verbinde: "Es ist eigentlich das gleiche Muster das sich durch euren ganzen Feed zieht."
Muster: Starke Themen die als Grafikfolien oder Fotos gepostet werden statt als Video.
Ende: "Falls du in meine letzte Mail noch nicht reinschauen konntest, im Anhang waren ein paar Ideen dazu."`,
    3: `Perspektivwechsel: Was sieht jemand der auf das Instagram kommt?
Beobachtung: Man sieht Grafiken/Ankündigungen/Infos. Aber wie es wirklich aussieht sieht man nicht.
Kontrast: "Grafiken informieren. Video lässt miterleben."
CTA: "Ich sehe da noch einiges an Potenzial und hätte Lust, das mal genauer mit euch durchzugehen. Wenn du Lust darauf hast kannst du gerne auf die Mail antworten."`,
  },
  INAKTIV: {
    1: `Beobachtung: Das Unternehmen hat seit Wochen/Monaten nicht gepostet. Der letzte Post war im [Monat].
Hook: Greife den letzten Post auf und sage was daran gut war.
Problem: "Seitdem ist es still geworden." Das passiert vielen wenn im Tagesgeschäft viel los ist.
Winkel: Schade weil Instagram Unternehmen die nach einer Pause wieder starten tatsächlich bevorzugt.
Ende: "Ich hab dazu ein paar Ideen aufgeschrieben, findest du im Anhang."`,
    2: `Greife einen ANDEREN Post auf als Mail 1 (einen früheren Post der gut lief).
Verbinde: "Es ist eigentlich das gleiche Muster wie bei eurem [Post aus Mail 1]."
Muster: Solche Momente passieren regelmäßig aber landen nicht mehr auf Instagram.
Ende: "Falls du in meine letzte Mail noch nicht reinschauen konntest, im Anhang waren ein paar Ideen dazu."`,
    3: `Perspektivwechsel: Was sieht jemand der auf das Instagram kommt?
Beobachtung: Man sieht Posts aus dem Herbst/[altem Zeitraum]. Der Eindruck passt nicht zu dem was wirklich passiert.
Kontrast: "Stille Accounts wirken inaktiv. Regelmäßige wirken lebendig." Schon ein Post pro Woche reicht.
CTA: "Ich sehe da noch einiges an Potenzial und hätte Lust, das mal genauer mit euch durchzugehen. Wenn du Lust darauf hast kannst du gerne auf die Mail antworten."`,
  },
  INKONSISTENT: {
    1: `Beobachtung: Das Unternehmen postet mal mehrere Posts in einer Woche, dann wieder wochenlang nichts.
Hook: Greife einen konkreten Post auf der gut funktioniert hat.
Problem: "Instagram belohnt Regelmäßigkeit stärker als Quantität. Ein Post pro Woche durchgehend bringt mehr als ein Schub und dann Stille."
Winkel: Posting-Muster mit Lücken, Schub-Stille-Rhythmus.
Ende: "Ich hab dazu ein paar Ideen aufgeschrieben, findest du im Anhang."`,
    2: `Greife einen ANDEREN Post auf als Mail 1.
Verbinde: "Es ist eigentlich das gleiche Muster wie bei eurem [Post aus Mail 1]."
Muster: Gute Momente die regelmäßig passieren aber nur ab und zu auf Instagram auftauchen.
Ende: "Falls du in meine letzte Mail noch nicht reinschauen konntest, im Anhang waren ein paar Ideen dazu."`,
    3: `Perspektivwechsel: Was erleben die Follower?
Beobachtung: Manchmal mehrere Posts in einer Woche, dann wochenlang nichts. Instagram registriert das und zeigt Beiträge weniger Leuten.
Kontrast: "Die einzelnen Posts sind gut. Am Inhalt liegt es nicht. Eher am Rhythmus."
CTA: "Ich sehe da noch einiges an Potenzial und hätte Lust, das mal genauer mit euch durchzugehen. Wenn du Lust darauf hast kannst du gerne auf die Mail antworten."`,
  },
  WENIGREICHWEITE: {
    1: `Beobachtung: Das Unternehmen postet regelmäßig aber bekommt kaum Reichweite für den Aufwand.
Hook: Greife einen konkreten Post auf der inhaltlich stark war.
Problem: "Für den Aufwand den ihr reinsteckt kommt wenig zurück." Liegt meistens nicht am Inhalt sondern an den ersten Sekunden.
Winkel: Instagram entscheidet in den ersten Sekunden ob ein Beitrag an mehr Leute ausgespielt wird.
Ende: "Ich hab dazu ein paar Ideen aufgeschrieben, findest du im Anhang."`,
    2: `Greife einen ANDEREN Post auf als Mail 1.
Verbinde: "Es ist eigentlich das gleiche Muster das sich durch euren ganzen Feed zieht."
Muster: Der Post startet nicht mit dem stärksten Element. Das eigentlich Gute kommt erst auf Slide 2 oder später.
Ende: "Falls du in meine letzte Mail noch nicht reinschauen konntest, im Anhang waren ein paar Ideen dazu."`,
    3: `Perspektivwechsel: Aufwand vs. Reichweite.
Beobachtung: Mehr Mühe als die meisten Unternehmen der Branche. Im Feed steckt Arbeit.
Kontrast: "Der Inhalt ist da. Es fehlt der Einstieg der Leute stoppt."
CTA: "Ich sehe da noch einiges an Potenzial und hätte Lust, das mal genauer mit euch durchzugehen. Wenn du Lust darauf hast kannst du gerne auf die Mail antworten."`,
  },
  VIRALAUSREISSER: {
    1: `Beobachtung: Ein Post/Reel hat ein Vielfaches an Reichweite erzielt im Vergleich zum restlichen Feed.
Hook: Greife den viralen Post/Reel auf.
Problem: Was diesen Post besonders gemacht hat (echte Veränderung, echte Person, Prozess statt Ergebnis). Der restliche Feed nutzt diese Elemente nicht.
Winkel: "Der Unterschied ist kein Zufall."
Ende: "Ich hab dazu ein paar Ideen aufgeschrieben, findest du im Anhang."`,
    2: `Greife einen ANDEREN Post auf als Mail 1 (einen "normalen" Post der wenig Reichweite hatte).
Verbinde: "Es ist das gleiche Muster wie bei eurem erfolgreichsten Post."
Muster: Fotos vom fertigen Ergebnis kommen nicht so gut an wie das Video. Der Unterschied ist nicht Qualität sondern Format (Verwandlung miterlebt vs. nur Endergebnis).
Ende: "Falls du in meine letzte Mail noch nicht reinschauen konntest, im Anhang waren ein paar Ideen dazu."`,
    3: `Perspektivwechsel aus Kundensicht. NICHT nochmal über "Format" oder "Wiederholung" sprechen — das kam in Mail 2.
Einstieg: Direkt mit dem Perspektivwechsel starten, NICHT mit "euer Post hat mir gut gefallen".
Beobachtung: Wenn jemand auf eurem Instagram landet, sieht er eure Arbeiten. Und er sieht dass ein Video deutlich besser ankam als alles andere.
Kontrast: Die Frage ist ob der Besucher das als Zufall sieht oder als das was euch ausmacht.
CTA: "Ich sehe da noch einiges an Potenzial und hätte Lust, das mal genauer mit euch durchzugehen. Wenn du Lust darauf hast kannst du gerne auf die Mail antworten."`,
  },
  SOLIDE: {
    1: `Beobachtung: Der Account ist solide aufgestellt — regelmäßig, gute Reichweite, Inhalte funktionieren. Nichts wirkt grundlegend kaputt.
Hook: Greife einen konkreten Post auf der besonders gut performt hat.
Problem: "Organische Reichweite ist gedeckelt — der Algorithmus zeigt euren Content hauptsächlich Leuten die euch schon folgen oder ähnlichen Profilen. Neue Zielgruppen erreicht ihr darüber fast nicht."
Winkel: Bei eurem Inhaltsniveau wäre der nächste Hebel nicht mehr Content, sondern bezahlte Reichweite — euer Content ist schon bewiesen, der müsste dafür nur dahin wo er noch nicht hinkommt.
Ende: "Ich hab dazu ein paar Ideen aufgeschrieben, findest du im Anhang."`,
    2: `Greife einen ANDEREN Post auf als Mail 1 (einen anderen, der gut lief).
Verbinde: "Auch dieser Post zeigt das Gleiche — euer Content trifft."
Muster: Aber er erreicht hauptsächlich Leute die schon mit euch interagiert haben oder im engen Algorithmus-Kreis sind. Die Audience-Erweiterung passiert organisch nur sehr langsam.
Ende: "Falls du in meine letzte Mail noch nicht reinschauen konntest, im Anhang waren ein paar Ideen dazu."`,
    3: `Perspektivwechsel: Was sieht jemand der eure Branche sucht aber euch noch nicht kennt?
Einstieg: NICHT mit "euer Post hat mir gut gefallen" — das kam schon. Direkt mit dem Perspektivwechsel.
Beobachtung: Organisch findet euch hauptsächlich, wer euch sowieso schon kennt. Neue potenzielle Kunden landen meistens nicht auf eurem Profil.
Kontrast: "Euer Content ist gut genug um zu wirken. Er erreicht aktuell nur die Falschen — nämlich die, die bei euch schon Kunde sind."
CTA: "Ich sehe da noch einiges an Potenzial und hätte Lust, das mal genauer mit euch durchzugehen. Wenn du Lust darauf hast kannst du gerne auf die Mail antworten."`,
  },
};

export function getStepRules(step: number, segment: string): string {
  return (
    STEP_RULES_BY_SEGMENT[segment]?.[step]
    ?? STEP_RULES_BY_SEGMENT["WENIGREICHWEITE"]?.[step]
    ?? `Follow-Up für Step ${step}. Empathisch, kein Pitch. Max 5 Sätze.`
  );
}

// ─────────────────────────────────────────────────────────────────
// Fixed Templates für Steps 4 (Calendly) + 5 (Breakup) — NICHT Claude-generiert
// Placeholders: {firstName}, {{CALENDLY_BUTTON}} (wird in lib/brevo.ts ersetzt)
// Nur die 3 mail-eligible Segmente: KEINEVIDEO, INKONSISTENT, SOLIDE
// ─────────────────────────────────────────────────────────────────
export const STEP_TEMPLATES: Record<string, Record<number, { subject: string; body: string }>> = {
  KEINEVIDEO: {
    4: {
      subject: "nochmal kurz",
      body: `Hallo {firstName},

die meisten Unternehmen die wir betreuen hatten am Anfang die gleiche Frage: Wie sollen wir Videos machen wenn sich niemand vor die Kamera traut?

Kurze Antwort: Die erfolgreichsten Formate brauchen kein Gesicht. Vorher und Nachher, Zeitraffer, Prozess-Clips. Funktioniert in fast jeder Branche.

Wenn Sie Lust haben, zeige ich Ihnen in 15 Minuten drei Formate die zu Ihrem Betrieb passen. Kein Pitch, nur Ideen.

{{CALENDLY_BUTTON}}

Viele Grüße aus Oldenburg
Niklas`,
    },
    5: {
      subject: "{firstNameLower}",
      body: `Moin {firstName},

ich wollte mich nicht aufdrängen und merke dass es gerade nicht passt. Kein Problem.

Falls sich das irgendwann ändert, schreiben Sie einfach zurück. Dann schauen wir uns das zusammen an.

Alles Gute!
Niklas`,
    },
  },
  INKONSISTENT: {
    4: {
      subject: "nochmal kurz",
      body: `Hallo {firstName},

ich kenne das Muster: Man postet drei Wochen am Stück, dann kommt ein Auftrag dazwischen und Instagram liegt wieder zwei Monate brach. Und jedes Mal fängt man wieder bei null an.

Das lässt sich lösen. Nicht mit mehr Disziplin sondern mit einem System das auch funktioniert wenn gerade keine Zeit ist.

Hätten Sie diese oder nächste Woche 15 Minuten? Ich zeige Ihnen wie das bei anderen Betrieben läuft.

{{CALENDLY_BUTTON}}

Viele Grüße aus Oldenburg
Niklas`,
    },
    5: {
      subject: "{firstNameLower}",
      body: `Moin {firstName},

ich wollte mich nicht aufdrängen und merke dass es gerade nicht passt. Kein Problem.

Falls sich das irgendwann ändert, schreiben Sie einfach zurück. Dann schauen wir uns das zusammen an.

Alles Gute!
Niklas`,
    },
  },
  SOLIDE: {
    4: {
      subject: "nochmal kurz",
      body: `Hallo {firstName},

Ihr Content funktioniert organisch gut. Aber organisch erreichen Sie hauptsächlich Leute die Sie schon kennen. Die Frage ist: Was passiert wenn man Ihren besten Content als Ad vor die richtigen neuen Leute bringt?

Spoiler: Es funktioniert meistens besser als erwartet, weil der Content bereits bewiesen hat dass er Aufmerksamkeit hält.

Ich zeige Ihnen in 15 Minuten wie das aussehen könnte. Keine Verpflichtung, nur ein konkreter Vorschlag.

{{CALENDLY_BUTTON}}

Viele Grüße aus Oldenburg
Niklas`,
    },
    5: {
      subject: "{firstNameLower}",
      body: `Moin {firstName},

ich wollte mich nicht aufdrängen und merke dass es gerade nicht passt. Kein Problem.

Falls sich das irgendwann ändert, schreiben Sie einfach zurück. Dann schauen wir uns das zusammen an.

Alles Gute!
Niklas`,
    },
  },
};

// ─────────────────────────────────────────────────────────────────
// Helper: Get a filled template for steps 4-7
// ─────────────────────────────────────────────────────────────────
export function getStepTemplate(
  step: number,
  segment: string,
  firstName: string
): { subject: string; body: string } | null {
  // GOLDENE REGEL: niemals einen Draft mit leerem firstName ausgeben — sonst
  // landet "{firstName}" oder ein leerer String im Versand. Statt zu fallbacken
  // wird `null` zurueckgegeben, damit der Aufrufer den Draft skippen kann.
  const trimmed = firstName.trim();
  if (!trimmed) return null;

  const segTemplates = STEP_TEMPLATES[segment] ?? STEP_TEMPLATES["INKONSISTENT"];
  const tpl = segTemplates?.[step];
  if (!tpl) return null;
  // {firstName}      → bleibt wie gegeben (z.B. "Markus")
  // {firstNameLower} → lowercase (z.B. "markus") — fuer kollegenhafte Betreffzeilen
  const firstNameLower = trimmed.toLowerCase();
  const replace = (s: string) =>
    s.replace(/\{firstNameLower\}/g, firstNameLower)
     .replace(/\{firstName\}/g, trimmed);
  const subject = replace(tpl.subject);
  const body    = replace(tpl.body);

  // Letzte Notbremse: Falls trotz allem ein {firstName...}-Platzhalter
  // durchschluepft (z.B. neuer Token in einem Template), lieber null als ein
  // kaputtes Mail.
  if (/\{firstName[^}]*\}/.test(subject) || /\{firstName[^}]*\}/.test(body)) {
    return null;
  }

  return { subject, body };
}
