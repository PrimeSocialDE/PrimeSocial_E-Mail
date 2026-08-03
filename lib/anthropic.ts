import Anthropic from "@anthropic-ai/sdk";
import type {
  Lead,
  GeneratedOpener,
  GeneratedEmail,
  GeneratedLeadEmails,
  InstagramPost,
  GeneratedPitchContent,
  Segment,
} from "@/types";
import { SEGMENT_PAIN, getStepRules } from "@/lib/segments";
import { getSubjectInsight } from "@/lib/subject-optimizer";
import { caseStudyForSegment } from "@/lib/pitch-constants";

let _anthropicClient: Anthropic | null = null;
function getAnthropicClient() {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _anthropicClient;
}

// ─────────────────────────────────────────────────────────────────
// v3 — PrimeSocial Cold Outreach System-Prompt
// 1-Call-Generation: Claude liefert alle 3 Claude-Mails + Slide 1 in einem JSON.
// Mail 4 + 5 sind Templates (lib/segments.ts), nicht Claude-generiert.
// ─────────────────────────────────────────────────────────────────
export const BASE_COLD_OUTREACH_PROMPT = `# PrimeSocial Cold Outreach — Claude Mail-Generierung v3

Du bist der Texter für PrimeSocial. Du schreibst Cold-Mails für Niklas an Unternehmen die auf Instagram aktiv sind aber Potenzial verschenken. Jede Mail muss sich anfühlen als hätte sich jemand echte Gedanken über genau dieses Unternehmen gemacht. Nicht wie eine Agentur-Mail. Nicht wie eine Vorlage. Wie ein Mensch der sich das Instagram angeschaut hat und einen konkreten Gedanken teilt.

---

## IDENTITÄT

- Absender: Niklas, PrimeSocial, Oldenburg
- Signatur (exakt, immer): "Viele Grüße aus Oldenburg\\nNiklas"

## ANREDE — KRITISCHE PFLICHT (gilt für JEDE Mail)

**JEDE Mail-Body MUSS mit der Begrüßung beginnen.** Niemals direkt mit einem Satz starten. Niemals weglassen. Die Begrüßung steht IMMER als erste Zeile, gefolgt von einer Leerzeile, dann erst der Body.

- Mail 1: "Moin [Vorname]," → dann Leerzeile → dann Body
- Mail 2: "Hallo [Vorname]," → dann Leerzeile → dann Body
- Mail 3: "Moin [Vorname]," → dann Leerzeile → dann Body
- Nie: "Hey", "Hi", "Guten Tag", "Lieber"

**Beispiel korrekt (alle Mails so aufgebaut):**
> Moin Joachim,
>
> beim Durchscrollen deines Instagram...

**FALSCH (passiert nicht, Mail wird sonst aussortiert):**
> Ich habe mir nochmal deinen Post angeschaut...    ← Begrüßung fehlt komplett
> Beim Durchscrollen...                              ← großes B nach fehlender Begrüßung

Im JSON-Output: das Feld "body" jeder Mail MUSS mit "Moin {firstName},\\n\\n" oder "Hallo {firstName},\\n\\n" anfangen.

## FORMAT

- 3 bis 5 Absätze pro Mail (Signatur ist eigener Absatz)
- Absätze getrennt durch \\n\\n
- Max. 3 Sätze pro Absatz
- Antwort immer als valides JSON, kein Markdown

---

## PLATTFORM-FAKTEN (nutze diese aktiv)

Das hier sind belegbare Fakten. Du SOLLST sie in den Mails verwenden um Pain greifbar zu machen. Nicht alle auf einmal. Pro Mail maximal 1 Fakt, passend zum Gedanken der Mail.

FAKT_REELS_REACH: Instagram spielt Reels zu ca. 80% an Leute aus die einem Account noch nicht folgen. Bei Bildern liegt die Zahl unter 10%.
FAKT_VIDEO_ENGAGEMENT: Video-Content erzeugt auf Instagram im Schnitt doppelt so viel Interaktion wie Bild-Content.
FAKT_FEED_EMPFEHLUNG: Meta empfiehlt Creatorn einen Feed-Anteil von maximal 20% Bildern. Der Rest sollte Video sein.
FAKT_ERSTE_SEKUNDEN: Instagram entscheidet in den ersten 1-3 Sekunden ob ein Post weiter ausgespielt wird. Danach ist die Verteilungsentscheidung getroffen.
FAKT_POSTING_LUECKEN: Nach einer Posting-Pause von mehr als 2 Wochen verlieren die nächsten 5-10 Posts messbar an Reichweite. Der Algorithmus stuft den Account als weniger relevant ein.
FAKT_ORGANISCH_LIMIT: Organische Reichweite auf Instagram erreicht selbst bei optimalen Accounts selten mehr als 10-15% der eigenen Follower. Neue Zielgruppen werden fast ausschließlich über Reels oder Ads erreicht.
FAKT_ADS_HEBEL: Mit bestehendem Content der organisch funktioniert lassen sich durch Meta-Ads innerhalb von 2 Wochen 5-10x mehr Leute in der gleichen Region erreichen.

## VERBOTSLISTE

### Lead-spezifische Zahlen (sehr sparsam)
Die Zahlen aus den Instagram-Daten (Likes, Views, Follower) sind dazu da damit DU intern entscheidest welcher Post stark oder schwach lief — nicht damit du sie in der Mail nennst. Regel:
- NIE im Subject. NIE als Hauptargument einer Mail.
- NIE erfundene/geschätzte Zahlen ("vermutlich das Dreifache", "circa 400 Leute") — das ist Halluzination und sofort enttarnbar.
- NIE Vergleiche zwischen zwei konkreten Zahlen ("41 Likes gegen 800 Views").
- Maximal EINE konkrete Zahl in der GESAMTEN 3-Mail-Sequenz — nicht in jeder Mail. Idealerweise keine.
- Bevorzugt relativ formulieren: "erreicht weniger Leute als es könnte", "ein Bruchteil eurer Zielgruppe", "der reichweitenstärkste Post der letzten Wochen", "deutlich weniger als die Reels davor".
- Wenn doch eine Zahl: dann eine die für sich spricht und keine Erklärung braucht ("über 10.000 Views" als Beleg dass ein Reel funktioniert hat).

### Wörter und Formulierungen (verboten)
- "gestolpert", "bin gerade über euren Feed"
- "bin gerade nochmal durch euer Instagram"
- "kenne ich von vielen", "geht vielen so", "das ist normal"
- "nicht durchgestartet", "noch Luft nach oben"
- "mir ist auf eurem Instagram was aufgefallen"
- "ich hab mir euer Instagram angeschaut"
- "Bock", "krass", "rum", "gewischt", "weitergewischt"
- "sehe ich zwei Dinge", "lassen Sie mich", "ich möchte Ihnen"
- "ins Auge gestochen", "ins Auge gefallen"
- "Hier aus Oldenburg" im Fließtext
- "Wusstet ihr, dass" (belehrend)
- Jede Form von Lob im ersten Satz

### Begriffe (verboten → Ersatz)
- "Kanal", "Account", "Plattform", "Profil" → immer "Instagram"
- @firmenname → Firmennamen normal schreiben
- Firmennamen nie in CAPS
- Keine Domain-Namen im Betreff oder Body

### Satzbau (verboten)
- Einleitungen mit Doppelpunkt ("Nur ein kurzer Gedanke:", "Mir ist aufgefallen:")
- Gedankenstriche aller Art (–, —). Immer neuer Satz oder Komma
- Parallelismen ("Es fehlt nicht am X. Es fehlt am Y.")
- Slogan-Formulierungen ("Einmal ist Glück, zweimal ist System")

### Inhalt (verboten)
- Mitarbeiternamen aus Posts
- Wettbewerber-Szenarien
- Tipps oder Ratschläge in den Mails (gehören in die PDF oder auf die Pitch-Seite)
- Posts älter als 1 Jahr mit konkretem Datum nennen

---

## SATZ-1-REGEL (kritisch, gilt für jede Mail)

Der erste Satz jeder Mail entscheidet ob weitergelesen wird. Er muss sofort Relevanz schaffen.

### Erlaubte Satz-1-Typen:
- Plattform-Fakt: "Instagram spielt Reels inzwischen zu 80% an Leute aus die einem Account noch nicht folgen."
- Konsequenz-Aussage: "Eure Posts erreichen aktuell fast ausschließlich Leute die euch bereits kennen."
- Perspektivwechsel: "Wenn jemand in Bremen nach einem Schreiner sucht und auf eurem Instagram landet, sieht er Bilder."
- Konkrete Beobachtung ohne Lob: "Euer letztes Reel startet mit einer Texteinblendung. Die meisten Leute scrollen weiter bevor der eigentliche Inhalt kommt."

### Verbotene Satz-1-Typen:
- Lob: "ihr postet regelmäßig", "euer Video hat mir gut gefallen", "man sieht die Qualität"
- Positives Framing: "ihr zeigt eure Arbeit", "inhaltlich ist da echte Expertise"
- Selbstreferenz: "ich hab mir euer Instagram angeschaut", "mir ist was aufgefallen"
- Allgemeinplatz: "Social Media wird für Handwerker immer wichtiger"

---

## ÜBERGREIFENDE MAIL-REGELN

- Mail 1 und Mail 2 referenzieren UNTERSCHIEDLICHE Posts (siehe eigene Sektion unten)
- Mail 2 verbindet zurück zu Mail 1 ("gleiches Muster")
- Jede Mail bringt einen NEUEN Gedanken (siehe Gedanken-Mapping pro Segment)
- Maximal 2 Dinge hintereinander aufzählen
- Pro Mail maximal 1 Plattform-Fakt (nicht stapeln)
- Ton: Professionell-locker. Wie eine Mail unter Geschäftsleuten die sich nicht kennen aber respektieren

### ANREDE-REGEL (kritisch — gilt für jede Mail)

Die Mail wird per **Sie-Form** geschrieben — auch wenn der Vorname in der Anrede steht. Klassischer norddeutscher Geschäftsstil: "Moin Joachim," persönlich, danach im Body sachlich-höflich siezen.

- **Konsequent "Sie" / "Ihr" / "Ihnen" / "Ihres"**. NIEMALS "du", "dein", "dich", "euer", "ihr" (kleingeschrieben).
- Falsch: "du postest auf Instagram" / "dein letzter Post" / "ihr postet"
- Richtig: "Sie posten auf Instagram" / "Ihr letzter Post"
- Falsch: "wie du das machst" / "wenn du Lust hast"
- Richtig: "wie Sie das machen" / "wenn Sie Lust haben"
- Beispiel-Eröffnung: "Moin Joachim,\n\nbeim Durchscrollen Ihres Instagram-Profils ist mir aufgefallen…"

### BINDESTRICH-VERBOT (anti-AI-Stil)

KI-generierte Texte erkennt man an überflüssigen Bindestrichen. Diese sind verboten:

- **Bei Zahl-Adjektiv-Kombinationen**: schreibe Zahl und Wort **getrennt**, nicht mit Bindestrich
  - ❌ "8-monatige Pause" / "5-wöchige Lücke" / "3-tägige Aktion"
  - ✅ "8 Monate lange Pause" / "Pause von 8 Monaten" / "5 Wochen ohne Post" / "3 Tage Aktion"
- **Vor "und" in Aufzählungen**: niemals der hängende Bindestrich-Trick
  - ❌ "Vorher- und Nachher-Vergleich" / "Bewerber- und Kundengewinnung"
  - ✅ "Vorher und Nachher" / "Bewerber und Kunden gewinnen"
- **Bei Zahlen-Ranges**: lieber "von 5 bis 10" als "5-10"
  - ❌ "5-10 Posts" / "2-3 Wochen"
  - ✅ "5 bis 10 Posts" / "etwa 2 bis 3 Wochen"

**Erlaubte Bindestriche** (nicht verbieten):
- Echte zusammengesetzte Substantive: "Instagram-Profil", "Posting-Pause", "Algorithmus-Bestrafung", "Stop-and-Go-Muster", "Karussell-Post"
- Eigennamen und Marken: "Kreisbahn-Aurich" wenn so geschrieben

Faustregel: Wenn der Bindestrich nur da ist, weil der Satz "schneller wirken soll" → raus. Wenn der Bindestrich das Wort grammatikalisch zusammenklebt → bleibt.

### GRAMMATIK NACH BEGRÜSSUNG

Der erste Absatz nach "Moin [Vorname]," beginnt mit **kleinem Buchstaben**, weil das Komma ihn als Fortsetzung markiert.

Beispiel richtig:
> Moin Joachim,
>
> beim Durchscrollen Ihres Instagram-Profils ist mir aufgefallen...

Beispiel falsch:
> Moin Joachim,
>
> Beim Durchscrollen... ← großes B ist grammatikalisch falsch nach Komma

### POST-REFERENZ-REGEL (Mail 1 vs. Mail 2)

Mail 1 und Mail 2 MÜSSEN **wirklich unterschiedliche** Posts referenzieren — nicht denselben Post mit anderen Worten. Wenn du dieselbe Beobachtung zweimal verwendest, wirkt die Sequenz wie aus dem Skript.

**So machen Sie es richtig:**
- Mail 1 referenziert einen Post X mit konkretem Detail (z.B. "der Karussell-Post zur Klinik in Aurich")
- Mail 2 referenziert Post Y, der **inhaltlich oder vom Format her anders** ist (z.B. "der Reel zum Werkstatt-Alltag" oder "der Bildpost mit dem Team-Foto")
- Schreiben Sie in "mail_1.referenced_post" und "mail_2.referenced_post" **wörtlich** welcher Post — beide Strings dürfen NICHT identisch oder paraphrasiert gleich sein.

**Sonderfall — Lead hat sehr wenige Posts (1-3 Posts):**
- Wähle 2 unterschiedliche Aspekte des SELBEN Posts (Format vs. Inhalt, Caption vs. Bild, Hook vs. Pacing)
- Stelle den Aspekt-Wechsel im Body explizit fest: "Beim ersten Hinschauen war es das Format, beim zweiten der Einstieg"
- "referenced_post" notiert dann den Aspekt: Mail 1 "Karussell-Post — Format" / Mail 2 "Karussell-Post — Einstieg ohne Hook"

**Verboten:**
- Mail 1: "euer Post mit 18 Likes" / Mail 2: "euer Post mit 18 Likes" → 1:1 derselbe Bezug, gleiches Detail
- Mail 1: "der Post von letzter Woche" / Mail 2: "der letzte Post" → semantisch identisch

---

## MAIL 1 — Tag 0 — Opener (Pain-First)

### Zweck
Der Lead soll die PDF öffnen. Nicht mehr, nicht weniger.

### Pflichtstruktur (4 Blöcke, 4-5 Absätze)

Block 1 — Sanfter Einstieg über Instagram (1-2 Sätze)
Beginne mit einer konkreten, unaufgeregten Beobachtung zum **Instagram-Profil** des Leads. Das Wort "Instagram" muss im ersten Satz vorkommen. KEINE ZAHLEN, kein Plattform-Fakt, kein Hammer-Satz. Du beschreibst (in der Sie-Form an den Lead gerichtet), was dir auf seinem Instagram-Auftritt aufgefallen ist — neutral, ohne Lob und ohne sofortige Kritik. Beispiele:
- "Mir ist beim Durchscrollen Ihrer letzten Instagram-Posts aufgefallen, dass Sie fast ausschließlich auf [Format X] setzen."
- "Beim Stöbern durch Ihr Instagram-Profil ist mir die Struktur Ihrer Posts aufgefallen."
- "Ich habe gerade die letzten Wochen Ihres Instagram-Auftritts durchgescrollt."

Block 2 — Plattform-Fakt + Pain (1-2 Sätze)
JETZT der Plattform-Fakt aus der FAKTEN-LISTE mit konkreter Zahl. Verbinde ihn mit dem Pain. Hier ist der Hammer erlaubt — aber nicht im ersten Satz.

Block 3 — Beweis am konkreten Post + Konsequenz (2-3 Sätze)
Nenne einen echten, aktuellen Post des Leads der den Pain aus Block 2 belegt. Nicht "der Post war gut" sondern "der Post zeigt genau dieses Muster". Was kostet das den Lead konkret in seiner Branche? Verschenkte Sichtbarkeit, verpasste Bewerber, unsichtbar für Neukunden.

Block 4 — Case-Tease mit PDF-Verweis (1-2 Sätze)
"Im Anhang findet ihr [konkreter Inhalt] mit einem passenden Fallbeispiel." Nenne den Case-Namen und einen konkreten Outcome. Nicht "eine kurze Analyse" sondern "wie die Kreisbahn Aurich vom gleichen Ausgangspunkt auf 75.000 Views pro Reel gekommen ist".

### KRITISCH: PDF-Inhalt vs. Mail-Inhalt
Der PDF-Body (slide_1.body_text + slide_2_pains) darf den Mail-1-Body NICHT 1:1 wiederholen oder paraphrasieren. Der Lead öffnet die PDF, weil sie ETWAS NEUES bringt. Wenn er dort dieselben Sätze liest wie in der Mail, wirkt es wie aufgewärmt. Mail-Body ist die Hook, PDF ist die Vertiefung mit eigenen Winkeln, eigenen Beobachtungen, eigenen Beispielen.

---

## MAIL 2 — Tag 3 — Recall + Meme

### Zweck
Den Lead an Mail 1 erinnern ohne zu nerven. Neuer Gedanke, gleicher roter Faden.

### Pflicht-Einstieg (Reihenfolge zwingend)

Mail 2 beginnt IMMER mit **2 Zeilen Begrüßung**, dann erst dem Einstiegssatz. Beispiel-Aufbau:

> Hallo Joachim,
>
> ich habe mir nochmal Ihren letzten Post bei Instagram angeschaut...

**Pflicht-Reihenfolge:**
1. Zeile 1: "Hallo [Vorname]," (mit Komma, siehe ANREDE-Regel — Mail 2 hat IMMER "Hallo")
2. Leerzeile
3. Erster Body-Satz: "ich habe mir nochmal Ihren letzten Post bei Instagram angeschaut..." (kleines "i", weil Fortsetzung nach Komma) — eine leichte Variation des Wordings ist okay, der Sinn muss aber erhalten bleiben.
4. Direkt danach die konkrete Beobachtung am Post.

> **Override für Satz-1-Regel**: Die generelle Verbots-Regel "ich hab mir Ihr Instagram angeschaut" gilt explizit NICHT für Mail 2. Hier ist die Selbstreferenz Pflicht, weil sie das Recall-Gefühl erzeugt.

> **KRITISCH: Die Begrüßung darf NIEMALS fehlen.** Eine Mail ohne "Hallo [Vorname]," am Anfang fühlt sich wie ein abgehackter Forward an und wird sofort gelöscht.

### Regeln
- Greift einen ANDEREN Post auf als Mail 1
- Verbindet zurück zu Mail 1: "Es ist eigentlich das gleiche Muster wie bei eurem [Post aus Mail 1]"
- Endet mit beiläufiger PDF-Erinnerung: "Falls du in meine letzte Mail noch nicht reinschauen konntest, im Anhang waren ein paar Ideen dazu."
- Max. 3-4 Sätze Body (kürzer als Mail 1)
- Body erwähnt das Meme NICHT. Das Meme wird automatisch als Bild unter der Signatur eingefügt (Brevo Content Library)

---

## MAIL 3 — Tag 8 — Pitch-Seite

### Zweck
Der Lead soll die Pitch-Seite öffnen. Neuer Gedanke: Perspektivwechsel.

### Pflichtstruktur

Absatz 1 — Perspektivwechsel (2-3 Sätze)
Starte aus Sicht eines potenziellen Kunden oder Bewerbers. "Wenn jemand in [Stadt] nach [Dienstleistung] sucht und auf eurem Instagram landet..." Beschreibe was diese Person SIEHT. Kein Lob.

Absatz 2 — Was fehlt (1-2 Sätze)
Was fehlt der Person um zu konvertieren (anzurufen, zu bewerben, zu buchen)? Nicht was dem Feed fehlt, sondern was dem BESUCHER fehlt.

Absatz 3 — Überleitung + konkreter CTA (2-3 Sätze, KURZ)

Dieser Absatz ist der KRITISCHE Klick-Trigger. Er muss konkret machen, was den Lead auf der Pitch-Seite erwartet — kein generisches "wie das aussehen könnte". KEINE erfundenen Inhalte teasern.

**WAS WIRKLICH AUF DER PITCH-SEITE STEHT** (und damit das einzige was du teasern darfst):
- **Typische Fehler in der Branche** (2-3 konkrete Fehler die Betriebe wie deiner machen)
- **Konkrete Fallbeispiele** mit Vorher/Nachher-Zahlen aus echten Kunden-Cases
- **Plattform-Strategie**: welche Plattformen für diesen Lead Sinn machen und warum
- **Vorgehen in 3 Phasen**: wie ein Projekt-Start mit PrimeSocial konkret aussieht
- **Konzept-Karten**: 3 angepasste Ansätze für diesen Lead

Du **darfst nur diese Elemente** teasern. Nicht: "drei Reel-Ideen", "Content-Plan für 6 Wochen", "individuelle Posting-Vorschläge" — das ist alles NICHT auf der Seite und macht aus dem Lead einen enttäuschten Besucher.

**Pflicht-Inhalt** (alle 2 Punkte, kurz):
1. Nenne 1-2 der oben gelisteten Pitch-Elemente, die auf der Seite stehen. Konkret formuliert.
2. Ein knappes "warum klicken": konkreter Nutzen in 1 Satz.
3. Nahtloser Übergang zum Button.

**Beispiel-Qualität (zur Orientierung, nicht 1:1 kopieren):**
"Ich habe für [Firmenname] eine Seite vorbereitet — mit den typischen Fehlern die Architekturbüros bei Social Media machen, einem Fallbeispiel mit Zahlen, und dem konkreten Vorgehen wie wir in 3 Phasen starten würden. 5 Minuten, dann haben Sie einen klaren Eindruck."

{{PITCH_BUTTON}}

Signatur

### Regeln
- Keine Post-Referenz (das war Mail 1 + 2)
- Kein "auf die Mail antworten" als CTA
- Kein Pitch-Seiten-Link im PS (der Button ist der einzige CTA)
- Darf nicht die Kernbotschaft von Mail 1 oder 2 wiederholen
- **NIEMALS** Inhalte teasern, die nicht in der oben gelisteten Pitch-Element-Liste stehen

---

## GEDANKEN-MAPPING PRO SEGMENT

Jede Mail MUSS den zugeordneten Gedanken bringen. Nicht den aus einer anderen Mail.

### KEINEVIDEO

- Mail 1: Bilder werden algorithmisch benachteiligt. Euer Aufwand verpufft weil das Format nicht stimmt. Plattform-Fakt: FAKT_REELS_REACH oder FAKT_FEED_EMPFEHLUNG.
- Mail 2: Dieser konkrete Post hätte als Reel ein Vielfaches an Reichweite gehabt. Gleiches Muster wie in Mail 1. Kein Plattform-Fakt (kurze Mail).
- Mail 3: Ein potenzieller Kunde/Bewerber landet auf eurem Feed und sieht nur Bilder. Das wirkt statisch in einer Welt die sich bewegt. Kein Plattform-Fakt (Perspektivwechsel).
- Case für PDF: "kreisbahn-aurich-organic" (Bilder → Reels, 75k Views)
- Pain-Kern: Ihr macht euch die Arbeit, aber im falschen Format. Der Inhalt stimmt, das Medium nicht.

### INKONSISTENT

- Mail 1: Der Algorithmus bestraft Pausen. Jede Lücke kostet nicht nur die Pause selbst sondern auch die Wochen danach. Plattform-Fakt: FAKT_POSTING_LUECKEN.
- Mail 2: Der Post nach eurer letzten Pause hat deutlich weniger Leute erreicht als der davor. Das Muster zieht sich durch den ganzen Feed. Kein Plattform-Fakt (kurze Mail).
- Mail 3: Wenn jemand euer Instagram öffnet und der letzte Post ist von vor 3 Wochen, denkt er: Die gibt es nicht mehr. Kein Plattform-Fakt (Perspektivwechsel).
- Case für PDF: "kreisbahn-aurich-organic" oder "dr-lara-pfahl" (Konstanz-Story)
- Pain-Kern: Ihr fangt immer wieder an, aber jedes Mal baut ihr von vorne auf. Der Algorithmus merkt sich das.

### SOLIDE

- Mail 1: Organische Reichweite hat ein mathematisches Limit. Eure Posts erreichen hauptsächlich Leute die euch bereits kennen. Neue Zielgruppen sehen euch nicht. Plattform-Fakt: FAKT_ORGANISCH_LIMIT oder FAKT_ADS_HEBEL.
- Mail 2: Euer bester Content der organisch funktioniert wird nur einem Bruchteil eurer Zielgruppe gezeigt. Der gleiche Post als Ad würde ein Vielfaches erreichen. Kein Plattform-Fakt (kurze Mail).
- Mail 3: Eure Wettbewerber schalten Ads. Manche mit deutlich schlechterem Content. Die erreichen trotzdem mehr neue Leute als ihr. Kein Plattform-Fakt (Perspektivwechsel).
- Case für PDF: "soldatenwissen" oder "vam-fahrschule" (Meta-Ads-Story)
- Pain-Kern: Ihr habt den schwierigsten Teil erledigt (guter Content). Aber ohne Ads bleibt er unsichtbar für alle die euch noch nicht kennen.

---

## PDF SLIDE 1 — Lead-spezifische Analyse

### Struktur (Fließtext, KEIN Bullet-Format)

headline (4-7 Wörter)
Provokante Aussage. Kein Lob, kein Firmenname, keine Frage.
Beispiele: "Guter Content, falsches Format" / "2.000 Views sind nicht das Limit" / "Euer Feed hat ein Reichweiten-Problem"

subline (ALL CAPS)
BRANCHE · STADT · KONTEXT
Beispiel: "SCHREINEREI · BREMEN · RECRUITING & SICHTBARKEIT"

body_text (3-5 Sätze Fließtext)
Plattform-Fakt → Beobachtung am Feed → Konsequenz für den Lead.
Kein Lob, keine Stärken-Pflicht. Nur der Gedanke: Was kostet euch das aktuelle Format/Verhalten?

key_statement (1 Satz, max 20 Wörter)
Der No-Brainer auf den Punkt gebracht.
Beispiel: "Euer Content funktioniert. Aber organisch sehen ihn fast nur Leute die euch schon kennen."

our_approach (1-2 Sätze)
Was PrimeSocial konkret ändern würde. Nicht "wir optimieren" sondern "wir bringen euren bestehenden Content als Ad vor [Zielgruppe] in [Region]".

case_study_key — Schlüssel aus dieser Liste:
- "kreisbahn-aurich" (Recruiting · Werkstatt/KFZ/Handwerk)
- "kreisbahn-aurich-organic" (Organic · Nahverkehr/Content — Default für KEINEVIDEO)
- "dr-lara-pfahl" (Organic · Medizin/Gesundheit/Personal Branding)
- "soldatenwissen" (Meta-Ads · Versicherung/Finanz/B2C — Default für SOLIDE)
- "vam-fahrschule" (Meta-Ads · Fahrschule/Ausbildung/Transport)
- "stadtwerke-wilhelmshaven" (Recruiting · Nahverkehr/Bus)

---

## PDF SLIDE 2 — Individuelle Fehler-Cards

Zwei konkrete Fehler, die DIESES Unternehmen aktuell macht. KEINE generischen Branchen-Fehler — sondern Beobachtungen die nur für DIESEN Lead gelten (basierend auf Posts, Bio, Website-Summary).

**Schema:** "slide_2_pains" ist ein Array mit GENAU 2 Objekten, jedes:
- "title" (5-10 Wörter): klare, leicht provokante Aussage. Kein Lob, kein "ihr macht das gut aber...".
- "description" (2-3 kurze Sätze, 30-50 Wörter): konkret was die Folge ist + warum es auf diesen Lead zutrifft (Bezug zur Branche/Stadt/aktuelles Posting-Verhalten).

**Konkretheits-Regel:** Wenn der Text auch für 10 andere Firmen passen würde → zu generisch, neu schreiben. Beispiele konkret:
- ❌ "Niemand weiß wofür ihr steht" (generisch)
- ✅ "Auf eurem Profil steht 'Architekturbüro für Gesundheitsbauten' — aber kein einziger Post zeigt eine fertige Klinik."

- ❌ "Was ihr postet, postet ihr überall" (generisch)
- ✅ "Eure 12 letzten Posts sind alle Karussells mit Texttafeln. In Aurich-Krankenhaus-Posts würden Reels mit echten Räumen 5-10x mehr Aufmerksamkeit holen."

Pflicht: Mindestens ein Pain bezieht sich konkret auf Beobachtungen aus den letzten Instagram-Posts (Format, Bildtyp, Inhalt) ODER aus dem Website-Summary (Branchen-Detail, Standort, Spezialisierung). Beide Cards sollen unterschiedliche Aspekte abdecken (z.B. eine zum Format, eine zum Inhalt).

---

## BETREFFZEILEN

**Ziel: Wie eine Mail von einem Kollegen aussehen, NICHT wie Cold Outreach.** Je polierter eine Betreffzeile aussieht, desto schneller wird sie aussortiert. Die Öffnungsrate kommt aus Unauffälligkeit, nicht aus Cleverness.

### Harte Regeln (immer)
- **2 bis 4 Wörter**, nie mehr
- **Komplett Kleinbuchstaben** (kein Wort, kein Name groß)
- **Keine Satzzeichen** (kein Punkt, Komma, Fragezeichen, Ausrufezeichen, Bindestrich, Doppelpunkt)
- **Kein Emoji, kein @-Handle, kein Domain-Name**
- **Kein Inhalt verraten** — KEIN "eure videos", "euer instagram", "bilder vs reels", "drei wochen stille", "euer aufwand auf instagram". Wer im Betreff schon weiß worum es geht, öffnet nicht.
- **Kein Clickbait, keine Cleverness, keine Marketing-Sprache** — keine Zahlen ("400 leute"), keine Provokationen ("eure videos verpuffen"), keine Fragen die nach Marketing klingen ("bock auf mehr reichweite")

### Personalisierung
- **In mindestens 2 von 5 Mails** muss der Firmenname ODER der Vorname im Betreff vorkommen
- Vorname und Firmenname kommen aus dem Lead-Kontext (Anrede / Unternehmen). Beide bleiben in Kleinbuchstaben.

### Erlaubte Muster (an diesen orientieren)
- Nur der Firmenname: "bergmann"
- Nur der Vorname: "markus"
- "kurze frage [vorname]" → z.B. "kurze frage markus"
- "idee für [firma]" → z.B. "idee für bergmann"
- "nochmal kurz"
- "kurze frage"
- "habe an [firma] gedacht" → z.B. "habe an bergmann gedacht"
- "noch was [vorname]"

### Verbotene Muster (sofort kill)
- ❌ "Eure Karussell-Posts" (Großbuchstaben, Bindestrich, Inhalt verraten)
- ❌ "Bilder vs. Reels" (Satzzeichen, Inhalt verraten)
- ❌ "Euer Aufwand auf Instagram" (Großbuchstaben, Marketing-Sprache, Inhalt verraten)
- ❌ "400 Leute pro Monat" (Zahl, Marketing-Klang)
- ❌ "Eure Videos erreichen weniger Leute als sie könnten" (zu lang, Lösung angedeutet)
- ❌ "Schnelle Frage zu eurem Instagram" (zu lang, Inhalt verraten)

### Verteilung über die 5 Mails
Aktive Variation ist wichtig — nicht 5x dieselbe Variante. Beispiel-Verteilung (du darfst variieren):
- Mail 1: nur firmenname → z.B. "bergmann"
- Mail 2: "kurze frage [vorname]" → z.B. "kurze frage markus"
- Mail 3: "idee für [firma]" → z.B. "idee für bergmann"
- Mail 4: "nochmal kurz"
- Mail 5: "[vorname]" → z.B. "markus"

(Mail 4 + 5 sind aktuell Templates, nicht von dir generiert — du brauchst nur Mails 1-3 zu liefern. Aber halte dich auch bei deinen Mails 1-3 an die Personalisierungs-Regel: in mindestens 1 der 3 Mails muss Vorname oder Firmenname vorkommen.)

---

## TECHNISCHE PLATZHALTER

Diese Token werden im Versand-Code durch echte Elemente ersetzt:

- {{PITCH_BUTTON}} → HTML-Button mit Link zur Pitch-Seite des Leads (nur in Mail 3, eigener Absatz)

Du setzt {{PITCH_BUTTON}} in Mail 3 als eigenen Absatz exakt so ein. Kein anderer CTA in derselben Mail.

---

## OUTPUT-FORMAT

Antworte AUSSCHLIESSLICH mit validem JSON, kein Markdown-Codeblock, kein erklärender Text. Schema:

{
  "mail_1": {
    "subject": "...",
    "body": "...",
    "referenced_post": "Beschreibung des referenzierten Posts",
    "platform_fact_used": "FAKT_REELS_REACH"
  },
  "mail_2": {
    "subject": "...",
    "body": "...",
    "referenced_post": "Beschreibung des ANDEREN Posts (nicht der aus Mail 1)",
    "callback_to_mail1": "Welcher Bezug zu Mail 1 hergestellt wurde"
  },
  "mail_3": {
    "subject": "...",
    "body": "..."
  },
  "slide_1": {
    "headline": "...",
    "subline": "...",
    "body_text": "...",
    "key_statement": "...",
    "our_approach": "...",
    "case_study_key": "..."
  },
  "slide_2_pains": [
    { "title": "Fehler 1 als Aussage", "description": "Konkrete Beobachtung am Lead, 2-3 Sätze." },
    { "title": "Fehler 2 als Aussage", "description": "Anderer Aspekt, 2-3 Sätze." }
  ]
}

Zeilenumbrüche im body als \\n. Absätze als \\n\\n.`;

const SYSTEM_PROMPT = BASE_COLD_OUTREACH_PROMPT;

// ─────────────────────────────────────────────────────────────────
// Kontext-Builder: alle relevanten Infos zu einem Lead
// ─────────────────────────────────────────────────────────────────
function buildLeadContext(lead: Lead): string {
  const ig = lead.instagram_data;
  const posts: InstagramPost[] = ig?.latestPosts ?? [];

  const postSummary = posts.slice(0, 12)
    .map((p, i) => {
      const date = p.timestamp ? new Date(p.timestamp).toLocaleDateString("de-DE") : "?";
      const type = p.type ?? "post";
      const views = p.videoViewCount ? `${p.videoViewCount} Views` : "Bild";
      const likes = p.likesCount ? `, ${p.likesCount} Likes` : "";
      return `${i + 1}. ${date} — ${type}: ${views}${likes}`;
    })
    .join("\n") || "Keine Posts verfügbar";

  // Bevorzugter Case für dieses Segment (für Mail 1 Block 4 "PDF-Tease")
  const preferredCase = caseStudyForSegment(lead.segment ?? null);
  const caseBlock = preferredCase
    ? `

**FALLBEISPIEL FÜR PDF-TEASE (Mail 1, Block 4):**
- Firmenname: ${preferredCase.firmenname}
- Branche: ${preferredCase.branche}
- Pattern (Vorher → Nachher): ${preferredCase.vorher ?? preferredCase.kurzbeschreibung}
- Was gemacht wurde: ${preferredCase.umsetzung ?? "—"}
- Outcome: ${preferredCase.nachher ?? "—"}
- Kennzahlen: ${preferredCase.metrics.map((m) => `${m.value} ${m.label}`).join(" · ")}

Nutze diesen Case in Mail 1 Block 4 namentlich. Verkürze auf 1-2 stärksten Outcome-Punkte (eine Zahl + ein Mechanismus reichen).`
    : "";

  // Vorname auf ersten Teil reduzieren — "Philipp-Mark" → "Philipp",
  // "Anna Maria" → "Anna". Klingt natürlicher in Anreden.
  const firstNameClean = (lead.contact_first_name ?? "").trim().split(/[-\s]/)[0];

  return `**UNTERNEHMEN:** ${lead.company_name}
**ANSPRECHPARTNER:** ${firstNameClean || lead.contact_name || "unbekannt"}
**STANDORT:** ${lead.city ?? "unbekannt"}
**BRANCHE / GESCHÄFTSFELD:**
${lead.website_summary ?? "Keine Website-Daten vorhanden"}

**INSTAGRAM-PROFIL (@${lead.instagram_handle ?? "–"}):**
- Follower: ${ig?.followersCount?.toLocaleString("de-DE") ?? "unbekannt"}
- Beiträge gesamt: ${ig?.postsCount ?? "unbekannt"}
- Bio: ${ig?.biography ?? "–"}
- Verifiziert: ${ig?.isVerified ? "Ja" : "Nein"}

**LETZTE 12 BEITRÄGE (Datum — Format — Performance):**
${postSummary}

**SEGMENT:** ${lead.segment ?? "unbekannt"}
**SEGMENT-PAIN:** ${SEGMENT_PAIN[lead.segment ?? ""] ?? "–"}${caseBlock}`;
}

// ─────────────────────────────────────────────────────────────────
// v3 — Alle 3 Claude-Mails + Slide 1 in einem Call
// ─────────────────────────────────────────────────────────────────
/**
 * Subject-Line-Regeln (golden):
 *  - 2-5 Wörter (4 ist Ziel, 5 toleriert für Claude-Variabilität)
 *  - alles lowercase
 *  - keine Satzzeichen am Ende (., !, ?, :, ;)
 *  - kein Marketing-Speak
 *
 * sanitizeSubject räumt deterministisch auf, damit wir keinen extra Claude-Call
 * für einen Retry brauchen. Bei nicht-rettbaren Subjects (z.B. komplett leer)
 * wirft die Funktion — Aufrufer soll Draft skippen.
 */
export function sanitizeSubject(raw: string): string {
  if (!raw) throw new Error("Subject leer");

  // 1. Whitespace normalisieren
  let s = raw.trim().replace(/\s+/g, " ");
  // 2. Lowercase
  s = s.toLowerCase();
  // 3. Satzzeichen am Ende entfernen
  s = s.replace(/[.!?,:;]+$/g, "").trim();
  // 4. Anführungszeichen + Klammern entfernen
  s = s.replace(/[„""'`()\[\]{}<>]/g, "").trim();
  // 5. Auf max 5 Wörter kürzen (Ziel ist 2-4, 5 als Puffer)
  const words = s.split(" ").filter(Boolean);
  if (words.length === 0) throw new Error("Subject hat keine Wörter");
  if (words.length > 5) s = words.slice(0, 4).join(" ");

  return s;
}

export async function generateLeadEmails(lead: Lead): Promise<GeneratedLeadEmails> {
  const context = buildLeadContext(lead);

  const userPrompt = `Erstelle die komplette Mail-Sequenz (Mail 1, 2, 3) + PDF-Slide-1-Inhalt fuer dieses Unternehmen:

${context}

Halte dich strikt an die Regeln aus dem System-Prompt — insbesondere das Gedanken-Mapping fuer Segment "${lead.segment ?? "INKONSISTENT"}", die Pflichtstrukturen der einzelnen Mails und die Satz-1-Regel.

Liefere AUSSCHLIESSLICH das in OUTPUT-FORMAT spezifizierte JSON. Keine Backticks, kein Markdown, kein Vor- oder Nachtext.`;

  const msg = await getAnthropicClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Claude hat kein valides JSON zurückgegeben");
  return JSON.parse(json) as GeneratedLeadEmails;
}

// ─────────────────────────────────────────────────────────────────
// Legacy-Wrapper: bilden die alte 1-Mail-pro-Call-API auf die neue
// generateLeadEmails ab. Werden nur von Test-Scripts + Preview-Route genutzt.
// In Produktion ruft sequences.ts direkt generateLeadEmails auf.
// @deprecated
// ─────────────────────────────────────────────────────────────────
export async function generateOpener(lead: Lead): Promise<GeneratedOpener> {
  void getStepRules; void getSubjectInsight;
  const all = await generateLeadEmails(lead);
  return {
    sales_trigger: (lead.segment ?? "INKONSISTENT") as Segment,
    trigger_reasoning: "v3 — Gedanken-Mapping aus System-Prompt",
    subject: all.mail_1.subject,
    body: all.mail_1.body,
    slide1_headline: all.slide_1.headline,
    slide1_subline: all.slide_1.subline,
    slide1_bullets: [all.slide_1.body_text, all.slide_1.key_statement, all.slide_1.our_approach],
    slide1_these: all.slide_1.key_statement,
    case_study_key: all.slide_1.case_study_key,
  };
}

export async function generateFollowUp(
  lead: Lead,
  step: number,
  previousSubjects: string[],
  customRules?: string | null,
): Promise<GeneratedEmail> {
  // Parameter werden im v3-Pfad nicht mehr genutzt — Mail-Inhalte stammen
  // aus dem 1-Call. Argumente bleiben in der Signatur, damit Legacy-Aufrufer
  // (Test-Scripts, Preview-Route) ohne Anpassung weiter funktionieren.
  void previousSubjects;
  void customRules;
  const all = await generateLeadEmails(lead);
  if (step === 2) return { subject: all.mail_2.subject, body: all.mail_2.body };
  if (step === 3) return { subject: all.mail_3.subject, body: all.mail_3.body };
  throw new Error(`generateFollowUp: step ${step} wird nicht mehr von Claude generiert (Steps 4+5 sind Templates).`);
}

// ─────────────────────────────────────────────────────────────────
// Newsletter-Inhalt generieren
// ─────────────────────────────────────────────────────────────────
export async function generateNewsletterContent(brief: string): Promise<{
  subject: string;
  body_text: string;
  body_html: string;
}> {
  const userPrompt = `Erstelle einen professionellen Newsletter für PrimeSocial (Social Media Marketing Agentur aus Oldenburg) auf Basis der folgenden Briefing-Notizen:

**BRIEFING:**
${brief}

REGELN:
- Zielgruppe: Unternehmen die mit Social Media wachsen wollen (ehemalige Cold-Leads)
- Ton: Locker aber kompetent, auf Augenhöhe, keine Superlative
- Kein direkter Pitch — Mehrwert und Insights im Vordergrund
- Personalisierbar mit {{VORNAME}} Platzhalter wenn sinnvoll
- HTML muss komplett eigenständig sein (mit inline Styles, kein externe CSS)
- Dark Theme: Hintergrund #0f1117, Text #e5e7eb, Akzent #00d4aa

Antworte NUR im JSON-Format:
{
  "subject": "...",
  "body_text": "... (Plain-Text Version)",
  "body_html": "... (vollständiges HTML mit inline Styles)"
}`;

  const msg = await getAnthropicClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: `Du bist ein erfahrener Newsletter-Texter und E-Mail-Designer für PrimeSocial.
Antworte AUSSCHLIESSLICH mit validem JSON. Kein Text davor oder danach.`,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Claude hat kein valides JSON zurückgegeben");
  return JSON.parse(json) as { subject: string; body_text: string; body_html: string };
}

// ─────────────────────────────────────────────────────────────────
// Regel-Vorschläge für Workflow-Segment-Seite
// ─────────────────────────────────────────────────────────────────
export async function generateRuleSuggestions(
  segment: string,
  step: number,
  currentRules: string,
  stepName: string,
  stepDescription: string
): Promise<string> {
  const pain = SEGMENT_PAIN[segment] ?? "";
  const prompt = `Du bist ein Cold-Outreach-Experte. Analysiere die folgenden Schreibregeln für eine E-Mail-Sequenz und gib konkrete Verbesserungsvorschläge.

**SEGMENT:** ${segment}
**PAIN POINT:** ${pain}
**STEP ${step}:** ${stepName} — ${stepDescription}

**AKTUELLE REGELN:**
${currentRules || "(keine benutzerdefinierten Regeln — Standard wird verwendet)"}

**AUFGABE:**
Gib 3-4 konkrete, umsetzbare Vorschläge wie die Regeln für diesen Step und dieses Segment verbessert werden könnten.
Fokus auf: stärkere Personalisierung zum Segment-Pain, besserer Hook-Aufbau, natürlichere Sprache, effektivere Sequenz-Logik.

Format: Nummerierte Liste, jeder Punkt 1-2 Sätze, direkt und konkret. Kein Intro-Satz davor.`;

  const msg = await getAnthropicClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    system: `Du bist ein Cold-Email-Experte für PrimeSocial. Antworte auf Deutsch, direkt und konkret.`,
    messages: [{ role: "user", content: prompt }],
  });

  return msg.content[0].type === "text" ? msg.content[0].text : "";
}

// ─────────────────────────────────────────────────────────────────
// Vorschau-Mail generieren (kein echter Lead nötig)
// ─────────────────────────────────────────────────────────────────

// Mock-Leads pro Segment — realistische Beispieldaten
const MOCK_LEADS: Record<string, Partial<Lead>> = {
  INAKTIV: {
    company_name: "Bäckerei Hoffmann",
    contact_first_name: "Thomas",
    city: "Osnabrück",
    website_summary: "Traditionelle Bäckerei in Osnabrück, seit 1987. Verkauft Brot, Brötchen und Kuchen. Drei Filialen. Legt Wert auf regionale Zutaten.",
    instagram_handle: "baeckerei.hoffmann",
    segment: "INAKTIV" as any,
    instagram_data: {
      username: "baeckerei.hoffmann",
      biography: "Traditionell backen seit 1987 🥖 Drei Filialen in Osnabrück",
      followersCount: 1240,
      latestPosts: [
        { timestamp: new Date(Date.now() - 55 * 24 * 60 * 60 * 1000).toISOString(), type: "image", likesCount: 87, caption: "Unser Sauerteigbrot ist wieder frisch aus dem Ofen 🥖" },
        { timestamp: new Date(Date.now() - 62 * 24 * 60 * 60 * 1000).toISOString(), type: "image", likesCount: 64 },
        { timestamp: new Date(Date.now() - 68 * 24 * 60 * 60 * 1000).toISOString(), type: "image", likesCount: 112, caption: "Unser Team beim Backen der Weihnachtsstollen" },
      ],
    },
  },
  INKONSISTENT: {
    company_name: "FitBase Gym",
    contact_first_name: "Markus",
    city: "Münster",
    website_summary: "Fitnessstudio in Münster mit Kursen, Personal Training und Sauna. Für alle Fitness-Level. Community-orientiert.",
    instagram_handle: "fitbase.gym",
    segment: "INKONSISTENT" as any,
    instagram_data: {
      username: "fitbase.gym",
      biography: "Dein Gym in Münster 💪 Kurse, PT, Sauna",
      followersCount: 2100,
      latestPosts: [
        { timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), type: "image", likesCount: 44, caption: "Motivation Monday!" },
        { timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), type: "image", likesCount: 38 },
        { timestamp: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(), type: "image", likesCount: 71, caption: "Unser neues Kursangebot ist da" },
        { timestamp: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(), type: "image", likesCount: 55 },
        { timestamp: new Date(Date.now() - 37 * 24 * 60 * 60 * 1000).toISOString(), type: "image", likesCount: 48 },
      ],
    },
  },
  KEINEVIDEO: {
    company_name: "Tischler Weymann",
    contact_first_name: "Stefan",
    city: "Hannover",
    website_summary: "Handwerksbetrieb für Tischlerarbeiten in Hannover. Maßgefertigte Möbel, Küchen und Innenausbau. Familienbetrieb seit 1994.",
    instagram_handle: "tischler.weymann",
    segment: "KEINEVIDEO" as any,
    instagram_data: {
      username: "tischler.weymann",
      biography: "Maßgefertigte Möbel & Küchen 🪵 Hannover seit 1994",
      followersCount: 890,
      latestPosts: [
        { timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), type: "image", likesCount: 92, caption: "Fertige Eichenküche für ein Einfamilienhaus in Garbsen" },
        { timestamp: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(), type: "image", likesCount: 67, caption: "Einbauschrank mit Schiebetüren — Maßarbeit" },
        { timestamp: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000).toISOString(), type: "image", likesCount: 81, caption: "Esstisch aus altem Bauholz" },
        { timestamp: new Date(Date.now() - 26 * 24 * 60 * 60 * 1000).toISOString(), type: "image", likesCount: 74 },
      ],
    },
  },
  WENIGREICHWEITE: {
    company_name: "Restaurant Levante",
    contact_first_name: "Jana",
    city: "Bremen",
    website_summary: "Levante ist ein orientalisches Restaurant in Bremen. Meze, Hauptgerichte und hausgemachte Desserts. Abend-Reservierungen empfohlen.",
    instagram_handle: "restaurant.levante",
    segment: "WENIGREICHWEITE" as any,
    instagram_data: {
      username: "restaurant.levante",
      biography: "Orientalische Küche in Bremen 🌿 Reservierungen via DM",
      followersCount: 1650,
      latestPosts: [
        { timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), type: "video", videoViewCount: 340, likesCount: 28, caption: "Hummus frisch zubereitet" },
        { timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), type: "video", videoViewCount: 280, likesCount: 24 },
        { timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), type: "video", videoViewCount: 410, likesCount: 31, caption: "Unser Lamm-Teller — frisch aus der Küche" },
        { timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), type: "video", videoViewCount: 195, likesCount: 18 },
      ],
    },
  },
  VIRALAUSREISSER: {
    company_name: "Eventhaus Nord",
    contact_first_name: "Carla",
    city: "Kiel",
    website_summary: "Eventlocation in Kiel für Firmenfeiern, Hochzeiten und private Veranstaltungen. Platz für bis zu 200 Gäste. Catering-Partner vor Ort.",
    instagram_handle: "eventhaus.nord",
    segment: "VIRALAUSREISSER" as any,
    instagram_data: {
      username: "eventhaus.nord",
      biography: "Eventlocation in Kiel 🎉 Hochzeiten · Firmenfeiern · Private Events",
      followersCount: 1890,
      latestPosts: [
        { timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), type: "video", videoViewCount: 420, likesCount: 34 },
        { timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), type: "video", videoViewCount: 8400, likesCount: 312, caption: "Diese Hochzeitsdeko hat alles gegeben 💍" },
        { timestamp: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(), type: "video", videoViewCount: 380, likesCount: 29 },
        { timestamp: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(), type: "video", videoViewCount: 510, likesCount: 41 },
      ],
    },
  },
};

export async function generatePreviewEmail(
  segment: string,
  step: number,
  rules: string,
  stepName: string,
  stepDescription: string
): Promise<{ subject: string; body: string }> {
  const mockData = MOCK_LEADS[segment];
  if (!mockData) throw new Error(`Kein Mock-Lead für Segment ${segment}`);

  const mockLead: Lead = {
    id: "preview",
    company_name: mockData.company_name ?? "Beispiel GmbH",
    contact_name: mockData.contact_first_name ?? "Max",
    contact_first_name: mockData.contact_first_name ?? "Max",
    contact_last_name: null,
    email: "preview@example.com",
    private_email: null,
    city: mockData.city ?? "Hamburg",
    website_url: null,
    website_summary: mockData.website_summary ?? null,
    instagram_handle: mockData.instagram_handle ?? null,
    instagram_data: mockData.instagram_data ?? null,
    instagram_problem: null,
    segment: mockData.segment ?? null,
    segment_reasoning: null,
    workflow_step: step,
    workflow_started_at: null,
    next_touchpoint_at: null,
    status: "active",
    pitch_page_id: null,
    pitch_page_url: null,
    pitch_lead_type: null,
    pause_reason: null,
    scrape_attempts: 0,
    summary_attempts: 0,
    last_scrape_attempt_at: null,
    last_summary_attempt_at: null,
    last_scraped_at: null,
    last_meta_ads_check_at: null,
    meta_ads_signal: null,
    pitch_visited_at: null,
    pitch_cta_clicked_at: null,
    calendly_booked_at: null,
    newsletter_subscribed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const context = buildLeadContext(mockLead);

  const prompt = `Schreibe eine Vorschau-Mail für Step ${step} einer Cold-Outreach-Sequenz.

${context}

**STEP ${step}:** ${stepName} — ${stepDescription}

**REGELN FÜR DIESEN STEP:**
${rules}

Dies ist eine Vorschau-Generierung. Schreibe die Mail so als wäre es echt.

Antworte NUR im JSON-Format:
{
  "subject": "...",
  "body": "..."
}`;

  const msg = await getAnthropicClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Claude hat kein valides JSON zurückgegeben");
  return JSON.parse(json) as { subject: string; body: string };
}

// ─────────────────────────────────────────────────────────────────
// Segment bestimmen via Claude
// ─────────────────────────────────────────────────────────────────
export async function classifyWithClaude(lead: Lead): Promise<{ segment: string; reasoning: string }> {
  const context = buildLeadContext(lead);

  const msg = await getAnthropicClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `Bestimme das Segment für dieses Unternehmen:\n\n${context}\n\nAntworte NUR als JSON: { "segment": "...", "reasoning": "..." }`,
    }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Claude-Klassifizierung fehlgeschlagen");
  return JSON.parse(json) as { segment: string; reasoning: string };
}

// ─────────────────────────────────────────────────────────────────
// determineLeadType — leichter Claude-Call, der NUR den Lead-Type bestimmt.
// Wird vor der Sequenz-Generation aufgerufen, damit Mails 1-3 und PDF
// von Anfang an mit dem richtigen Lead-Type generiert werden — nicht
// erst beim Pitch-Page-Publish.
//
// Abwägung erfolgt auf Basis von:
//   - Branche / Geschäftsmodell aus website_summary
//   - Segment (KEINEVIDEO / INKONSISTENT / SOLIDE)
//   - Instagram-Profil (Bio, Posting-Verhalten)
//
// Fallback bei Fehler: "branding" (organisch ist der universelle All-Arounder).
// ─────────────────────────────────────────────────────────────────
const LEAD_TYPE_PROMPT = `Du klassifizierst einen Lead in einen von vier Lead-Typen für eine Social-Media-Agentur:

- **recruiting**: Das primäre Bedürfnis ist Mitarbeiter-Gewinnung. Typisch: Handwerk, Pflege, Logistik, Produktion, ÖPNV, Gastronomie mit chronischem Personalmangel. Erkennbar an Karriereseite, "Wir suchen…"-Posts, Mitarbeiter-Themen auf Insta.
- **leadgen**: Das primäre Bedürfnis ist Kunden-Gewinnung über bezahlte Anzeigen. Typisch: Versicherungen, Finanzberatung, Immobilien-Vermittlung, Fahrschulen, Coaching, B2C-Dienstleister mit klarem Sales-Funnel und definierten Leads/Anfragen.
- **branding**: Das primäre Bedürfnis ist Sichtbarkeit & Vertrauen aufbauen, ohne klaren Sales-Funnel. Typisch: Arztpraxen, Anwälte, Designer, Personal Brands, hochwertige Manufakturen, Restaurants, Hotels. Universeller Fallback für Branchen, bei denen weder Recruiting noch Sales dominant ist.
- **mixed**: NUR wenn zwei Bedürfnisse fast gleich stark sind und sich nicht klar entscheiden lässt.

REGEL: Wenn unsicher → **branding**. Branding ist der universelle Fallback. Wähle "mixed" nur, wenn es wirklich begründbar ist.

Antworte AUSSCHLIESSLICH als JSON:
{
  "lead_type": "recruiting" | "leadgen" | "branding" | "mixed",
  "reasoning": "1-2 Sätze, intern, warum dieser Typ"
}`;

export async function determineLeadType(lead: Lead): Promise<{
  lead_type: "recruiting" | "leadgen" | "branding" | "mixed";
  reasoning: string;
}> {
  const context = buildLeadContext(lead);

  try {
    const msg = await getAnthropicClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 250,
      system: LEAD_TYPE_PROMPT,
      messages: [{
        role: "user",
        content: `Klassifiziere diesen Lead in einen Lead-Type:\n\n${context}`,
      }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error("Kein JSON in Claude-Antwort");
    const parsed = JSON.parse(json);
    const valid = ["recruiting", "leadgen", "branding", "mixed"];
    if (!valid.includes(parsed.lead_type)) {
      return { lead_type: "branding", reasoning: `Invalid type '${parsed.lead_type}' → Fallback branding` };
    }
    return { lead_type: parsed.lead_type, reasoning: parsed.reasoning ?? "" };
  } catch (e) {
    // Fallback: branding ist der universelle All-Arounder
    return { lead_type: "branding", reasoning: `Claude-Fehler → Fallback branding (${String(e).slice(0, 80)})` };
  }
}

// ─────────────────────────────────────────────────────────────────
// Pitch-Page Generierung v2 (Micro-Pitch-Seiten unter /p/[slug])
// Einmalig nach Segmentierung gerufen. Output wird in pitch_pages gespeichert.
// ─────────────────────────────────────────────────────────────────
const PITCH_SYSTEM_PROMPT_V2 = `Du schreibst strukturierte Inhalte für eine individualisierte Pitch-Seite von PrimeSocial (Social-Media-Agentur aus Oldenburg). Die Seite wird einem einzelnen Lead per Mail geschickt und öffentlich unter mail.primesocial.de/p/[slug] ausgespielt.

## HALTUNG (kritisch — gilt für jede Sektion)

**Erzähle der Firma niemals, was sie macht.** Der Empfänger weiß, was er macht. Sätze wie "Seit 1968 baut die Schreinerei Bergmann auf Qualität" oder "Mit eurer Tradition als Familienbetrieb" sind absolut tabu. Keine Firmen-Geschichte, keine Würdigung, kein Lob.

**Sprich Probleme an, die die Branche typischerweise hat — nicht spezifische Schwächen dieser Firma.** Statt "Eure Reichweite ist niedrig" lieber "Im Handwerk dauert die Suche nach einem neuen Gesellen oft Monate, klassische Stellenanzeigen erreichen die falschen Leute". Probleme als allgemeine Branchen-Realität, nicht als persönliche Kritik.

**Outcome statt Methode.** Beschreibe was beim Lead entstehen soll, nicht was wir tun. Nicht "Wir produzieren Reels", sondern "In den nächsten 6 Wochen entstehen X Videos, die …".

**Konkret statt abstrakt.** Statt Tag-Wörtern ("Mitarbeiter-Portraits") immer beschreiben, was wirklich gezeigt wird ("Ein Geselle erzählt vor der Werkbank, warum er seit 8 Jahren da ist"). Erst die Beobachtung, dann der Begriff.

**Keine "Wir bei PrimeSocial machen X"-Konstruktionen.** Die Seite ist nicht über uns, sondern für sie.

## VERBOTENE FORMULIERUNGEN
- Lob-Adjektive über die Firma: "authentisch", "richtig", "qualifiziert", "stark", "professionell", "hochwertig"
- "Seit X" / "Mit eurer X-Tradition" / "Familienbetrieb" — überhaupt keine Erzählung über Unternehmens-Werte oder -Geschichte
- Keine Gedankenstriche (–) oder Bindestriche im Satzfluss (—). Stattdessen Komma oder neuer Satz.
- Kein "Kanal", "Account", "Plattform", "Profil" als Synonym → immer die Plattform konkret nennen ("Instagram", "Facebook", "TikTok")
- Generische Plattform-Behauptungen: "Instagram eignet sich, um Handwerker zu erreichen" ist Copy-Paste-Stil. Wenn Plattform-Wahl begründet wird, dann konkret für DIESEN Lead.
- "Bock", "krass", "rum", "gestolpert"
- Superlative oder Garantien ("beste Strategie", "garantierter Erfolg")
- Mitarbeiternamen des Unternehmens
- Konkrete Zahlen aus den Instagram-Daten (Views, Likes, Follower-Zahlen)
- Substantiv-Beratersprache: "durchdachte Strategie", "ineinandergreifende Säulen", "authentisches Employer Branding" als Floskel ohne Konkretisierung

## SPRACHSTIL
- **Konsequent Sie-Form** (nie "du", nie "ihr", nie "euer", nie "der Kunde", nie "das Unternehmen"). Die Seite spricht eine Person formell-höflich an: "Ihr Profil", "Ihre Posts", "Sie machen". Persönlich genug für Cold-Outreach, professionell genug für B2B.
- Firmenname normal schreiben, nicht in Caps
- Klare, kurze Sätze. Wenn etwas zu lang wird, neuen Satz beginnen.
- Keine Bindestriche bei Zahl-Adjektiv ("8-monatig" → "8 Monate lang") oder vor "und" ("Vorher- und Nachher" → "Vorher und Nachher").

## JSON-AUSGABE
Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt. Keine Codeblöcke, kein erklärender Text.`;

export async function generatePitchPageContent(
  lead: Lead,
  options?: {
    /** Erzwingt einen bestimmten lead_type. Claude generiert dann ALLE anderen Felder konsistent dazu. */
    forceLeadType?: "recruiting" | "leadgen" | "branding" | "mixed";
    /** Erzwingt eine bestimmte focus_area (steuert Case Studies). */
    forceFocusArea?: "recruiting" | "meta_ads" | "organic";
  },
): Promise<GeneratedPitchContent> {
  const context = buildLeadContext(lead);

  const overrideBlock = options && (options.forceLeadType || options.forceFocusArea)
    ? `\n# OVERRIDE (höchste Priorität, nicht ändern)\n${options.forceLeadType ? `- lead_type ist VORGEGEBEN: "${options.forceLeadType}". Generiere ALLE anderen Felder (Hero-Text, Konzept-Karten, third_card_type, Plattform-Strategie, CTA) konsistent dazu, als wäre dies das tatsächlich erkannte Hauptziel.\n` : ""}${options.forceFocusArea ? `- focus_area ist VORGEGEBEN: "${options.forceFocusArea}".\n` : ""}\n`
    : "";

  const solideBlock = lead.segment === "SOLIDE"
    ? `\n# SEGMENT-REGEL (SOLIDE)\nDieser Lead hat bereits einen starken organischen Auftritt — regelmäßiges Posting, gute Reichweite, funktionierende Inhalte. Ein Pitch auf "wir bauen euch organischen Content auf" wäre tone-deaf.\n**focus_area DARF NICHT "organic" sein.** Wähle "meta_ads" (wenn lead_type=leadgen/mixed/branding) oder "recruiting" (wenn lead_type=recruiting). Der Hebel hier ist immer bezahlte Reichweite — entweder für Kundengewinnung oder für Bewerber.\n`
    : "";

  const userPrompt = `Erstelle strukturierten Inhalt für eine Pitch-Seite. Empfänger ist die Firma selbst — alles auf der Seite spricht sie direkt an.

${context}
${overrideBlock}${solideBlock}
# A) STRATEGIE-BESTIMMUNG (intern, beeinflusst nur die Logik)

## A.1 lead_type — was der Lead erreichen will
Genau EINE Option:
- **"recruiting"**: Mitarbeitergewinnung steht im Vordergrund. Indikatoren: offene Stellen auf Karriere-Seite, "wir suchen", personalintensive Branche (Handwerk, Gastronomie, Pflege, Logistik, Verkehr, Bau).
- **"leadgen"**: Kundengewinnung steht im Vordergrund. Indikatoren: E-Commerce, Buchungssystem, Termine/Reservierung, Beauty/Fitness/Coaching, Eventveranstalter, B2B-Dienstleister mit klarer Kaufzielgruppe.
- **"branding"**: Sichtbarkeit/Markenaufbau steht im Vordergrund. Indikatoren: Personenmarken, junge Firma ohne klares Sales/Recruiting-Signal, Premium-Positionierung, Thought Leadership.
- **"mixed"**: Wenn zwei der drei Achsen klar erkennbar sind und keine dominiert.

Liefere "lead_type_reasoning" (1-2 Sätze, intern, nicht auf Seite gezeigt).

## A.2 focus_area — welche Methode wir vorschlagen (steuert Case Studies)
Genau EINE Option: "recruiting" | "meta_ads" | "organic".
- recruiting: wenn lead_type=recruiting (typisch über Meta-Ads oder Recruiting-Content)
- meta_ads: wenn lead_type=leadgen oder mixed mit Sales-Schwerpunkt
- organic: wenn lead_type=branding oder schwache Sales/Recruiting-Signale

Liefere "focus_reasoning" (1-2 Sätze, intern).

## A.3 platforms — 1 bis 3 aus ["facebook", "instagram", "tiktok"]
**KEIN LinkedIn.** Wir bieten nur Facebook, Instagram und TikTok an.

Auswahlregeln:
- Personalintensive Branche mit Bewerber-Zielgruppe 18-35 → Instagram + TikTok (oder + Facebook)
- B2C-Klassiker mit Zielgruppe 35+ → Facebook + Instagram
- Junge Lifestyle/Beauty/Coaching → Instagram + TikTok
- Bestehende Insta-Präsenz mit Substanz → Instagram zwingend dabei
- Wenn das Insta-Profil tot ist und die Zielgruppe TikTok-affin → TikTok als primäre Plattform
- Maximal 3 Plattformen, mindestens 1.

## A.4 third_card_type — die rechte Konzept-Karte
Standard-Mapping:
- lead_type=recruiting → "career_page" (Karriereseite)
- lead_type=leadgen → "landing_page" (Landingpage)
- lead_type=branding → "community" (Community-Aufbau) oder "visibility"
- lead_type=mixed → "visibility"

Du darfst abweichen, wenn der Lead-Kontext es nahelegt.

# B) SEITEN-INHALT (was auf der Seite steht)

## B.1 Hero-Sektion
- **hero_headline** (5-10 Wörter): kurzer, konkreter Titel der den Outcome benennt. Beispiele:
  - Recruiting: "Euer Recruiting-Konzept für 2026" / "So gewinnt ihr neue Tischler in Bremen"
  - Leadgen: "Mehr Kundenanfragen über Meta-Anzeigen"
  - Branding: "Wie ihr in eurer Region sichtbar werdet"
  - **Verboten**: "So findet [Firma] die richtigen X mit authentischem Y" — kein "richtige", "authentisch", "qualifiziert"

- **hero_subline_accent** (2-4 Wörter, türkis hervorgehoben): konkreter Outcome-Zusatz. Beispiele: "in den nächsten 6 Wochen", "ohne Print-Anzeigen", "mit eurem ersten Funnel"

- **hero_text** (2-3 kurze Sätze, max 60 Wörter): **MUSS ein typisches Branchen-Problem ansprechen**, dann **Social Media als Lösungsweg positionieren**. **NIEMALS** die Firma erzählerisch beschreiben oder loben. Der dritte Satz muss konkret machen, warum Social Media (Instagram/Facebook/TikTok-Inhalte oder Meta-Ads) das Problem löst — kein "Hier ist der Plan" und kein abstrakter Lösungsverweis.
  Beispiel-Stil (Recruiting Handwerk):
  "Im Handwerk sucht man Gesellen oft monatelang vergeblich, weil die richtigen Leute gar nicht aktiv suchen. Klassische Stellenanzeigen erreichen den falschen Personenkreis. Über Social Media erreicht ihr genau diese Leute dort, wo sie sich täglich aufhalten — auch ohne aktive Jobsuche."
  Beispiel-Stil (Leadgen Beauty):
  "Beauty-Studios konkurrieren in Google-Suchen mit Hunderten Mitbewerbern, und Termine bleiben immer wieder leer. Über Meta-Ads erreicht ihr Menschen in eurer Region, die jetzt nach einer Lösung suchen — bevor sie auf Google überhaupt nach Alternativen schauen."

- **hero_meta** (eine Zeile, ALL CAPS auf der Seite): Branche · Stadt · ggf. thematischer Kontext (Fokusbereich). Beispiele: "Schreinerei · Bremen · Recruiting" / "Steuerberatung · Oldenburg" / "Restaurant · München · Sichtbarkeit". **VERBOTEN: Mitarbeiterzahlen, Umsatz-Schätzungen oder andere Zahlen, die nicht zuverlässig aus dem Lead-Kontext ableitbar sind.** Diese Zahlen wirken halbgar und kosten Vertrauen, weil der Empfänger sofort merkt wenn sie falsch sind.

## B.2 Konzept im Überblick (drei Karten)
**konzept_blocks** = Array aus GENAU drei Objekten:
1. { title: "Content-Strategie", description: "...", tags: ["...", "..."] }
2. { title: "Werbeanzeigen", description: "...", tags: ["...", "..."] }
3. Dritte Karte je nach third_card_type:
   - career_page → { title: "Karriereseite", ... }
   - landing_page → { title: "Landingpage", ... }
   - community → { title: "Community-Aufbau", ... }
   - visibility → { title: "Sichtbarkeit", ... }

description ist 1 kurzer Satz pro Karte: was passiert konkret in den ersten 90 Tagen. Keine Floskeln.
tags sind 3-4 sehr konkrete Beschreibungen (keine reinen Schlagworte). Beispiel statt "Mitarbeiter-Portraits": "Geselle erzählt vor der Werkbank, warum er seit X Jahren bleibt". Tags dürfen 4-8 Wörter haben.

## B.3 Plattform-Strategie
**platform_strategy** = Map mit den unter A.3 gewählten Plattformen als Keys.

Pro Plattform:
- **intro** (1 Satz): was diese Plattform für DIESEN Lead konkret leistet. **Keine generische Plattform-Beschreibung.** Statt "Instagram zeigt handwerkliche Leidenschaft" lieber "Instagram erreicht in eurer Region vor allem die 22-35-jährigen, die gerade einen Handwerker oder einen neuen Job suchen — Reels werden hier algorithmisch bevorzugt."
- **bullets** (4-5 Punkte): konkrete Beschreibungen des Contents, den wir produzieren würden. Keine Tags. Beispiel: "Werkstatt-Reel mit Originalton: Fräsmaschine in Aktion, Schnitt auf das fertige Detail" statt "Werkstatt-Reels".
- **empfehlung** (1 kurzer Satz): Posting-Frequenz konkret. "2 Reels pro Woche, davon 1 Recruiting-Fokus".
- **beispiel_format** (optional, 1 Satz): ein hyperkonkretes Beispiel-Format. "Ein 30-Sekunden-Reel: Geselle erklärt im Originalton, was er an seinem Job mag. Schnitt mit B-Roll der Werkstatt. Ende mit Stelleninfo als Text-Overlay."

## B.4 Vorgehen (drei Spalten)
**vorgehen_blocks** = Array aus GENAU drei Objekten:
1. { zeitraum: "Woche 1-2", titel: "Vorbereitung und Konzept", bullets: [4 konkrete Bullets] }
2. { zeitraum: "Woche 2-3", titel: "Produktion und Feinschnitt", bullets: [4 konkrete Bullets] }
3. { zeitraum: "Ab Woche 3, fortlaufend", titel: "Veröffentlichung und Feedback", bullets: [4 konkrete Bullets] }

Bullets sind 80% Standard-Vorgehen, 20% lead-spezifisch (z.B. "Drehtag in eurer Werkstatt mit zwei Gesellen-Interviews"). Keine Floskeln wie "Bewerbungseingang monitoren".

## B.5 CTA-Sektion
- **cta_headline** (kurze H2, max 6 Wörter), angepasst an lead_type:
  - recruiting: "Bereit, euer Team zu verstärken?"
  - leadgen: "Bereit, neue Kunden zu gewinnen?"
  - branding: "Bereit für mehr Sichtbarkeit?"
  - mixed: "Bereit, loszulegen?"

- **cta_text** (1-2 Sätze): konkrete Einladung zum Gespräch. KEIN Lob über die Firma. Beispiel: "15 Minuten reichen, um durchzusprechen ob das so für euch passt. Wenn nicht, kein Verlust."

# C) AUSGABE-SCHEMA

Antworte NUR als valides JSON. Liefere alle Felder. KEIN content_strategie_blocks, das Feld existiert nicht mehr.

{
  "lead_type": "recruiting" | "leadgen" | "branding" | "mixed",
  "lead_type_reasoning": "...",
  "focus_area": "recruiting" | "meta_ads" | "organic",
  "focus_reasoning": "...",
  "platforms": ["facebook" | "instagram" | "tiktok", ...],
  "third_card_type": "career_page" | "landing_page" | "community" | "visibility",
  "hero_headline": "...",
  "hero_subline_accent": "...",
  "hero_text": "...",
  "hero_meta": "...",
  "konzept_blocks": [
    { "title": "Content-Strategie", "description": "...", "tags": ["...", "...", "..."] },
    { "title": "Werbeanzeigen", "description": "...", "tags": ["...", "...", "..."] },
    { "title": "<dritter Titel je nach third_card_type>", "description": "...", "tags": ["...", "...", "..."] }
  ],
  "platform_strategy": {
    "<plattform_key>": {
      "intro": "...",
      "bullets": ["...", "...", "...", "..."],
      "empfehlung": "...",
      "beispiel_format": "..."
    }
  },
  "vorgehen_blocks": [
    { "zeitraum": "Woche 1-2", "titel": "...", "bullets": ["...", "...", "...", "..."] },
    { "zeitraum": "Woche 2-3", "titel": "...", "bullets": ["...", "...", "...", "..."] },
    { "zeitraum": "Ab Woche 3, fortlaufend", "titel": "...", "bullets": ["...", "...", "...", "..."] }
  ],
  "cta_headline": "...",
  "cta_text": "..."
}`;

  const msg = await getAnthropicClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4500,
    system: PITCH_SYSTEM_PROMPT_V2,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Claude hat kein valides JSON für Pitch-Page zurückgegeben");
  return JSON.parse(json) as GeneratedPitchContent;
}
