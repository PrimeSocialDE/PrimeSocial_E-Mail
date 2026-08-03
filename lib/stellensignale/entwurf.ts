// ─────────────────────────────────────────────────────────────────
// ENTWURF — Claude schreibt pro Firma EINE E-Mail vor (nicht versenden!).
//
// Nutzt die heißeste Stelle je Firma (v_firma_outreach) + Firmen-Kontext.
// Gedeckelt (STELLENSIGNALE_ENTWURF_LIMIT). Speichert nur Entwürfe zur
// Freigabe — es wird NICHTS automatisch verschickt.
//
// 👉 Den Ton/Stil justierst du im ENTWURF_SYSTEM_PROMPT unten. Bewusst als
//    eine Konstante gehalten, damit du sie leicht anpassen kannst.
// ─────────────────────────────────────────────────────────────────
import Anthropic from "@anthropic-ai/sdk";
import referenzenData from "@/data/stellensignale-referenzen.json";
import { getFirmenFuerEntwurf, saveEntwurf } from "@/lib/stellensignale/db";
import type { FirmaOutreach } from "@/types/stellensignale";

interface Referenz { keys: string[]; label: string; link: string }
const REFERENZEN: Referenz[] = (referenzenData as { referenzen?: Referenz[] }).referenzen ?? [];
const DEFAULT_LINK: string | null = (referenzenData as { default_link?: string | null }).default_link ?? null;

// Passende Referenz zu Gewerk/Stellentitel finden (Teilstring-Match, erster
// Treffer gewinnt). Liefert das ganze Objekt, weil nicht nur der Link gebraucht
// wird, sondern auch das Label — Claude nennt es im Entwurf als Beleg.
function referenzFuer(gewerk: string | null, stellentitel: string): Referenz | null {
  const hay = `${gewerk ?? ""} ${stellentitel}`.toLowerCase();
  for (const r of REFERENZEN) {
    if (r.keys.some((k) => hay.includes(k.toLowerCase()))) return r;
  }
  return null;
}

// Platzhalter [Video-Beispiel …] durch den Link ersetzen (falls Match).
function videoEinsetzen(text: string, link: string | null): string {
  if (!link) return text;
  return text.replace(/\[Video-Beispiel[^\]]*\]/gi, link);
}

// Allgemeines Postfach (Gatekeeper) vs. persönliche Adresse erkennen.
const POSTFACH_RE = /^(info|kontakt|contact|office|mail|e?-?mail|hallo|moin|service|zentrale|empfang|sekretariat|buchhaltung|verwaltung|team|post|karriere|jobs?|job|bewerbung|personal|hr|willkommen|welcome)\b/i;
function istPostfach(email: string | null): boolean {
  if (!email) return false;
  return POSTFACH_RE.test(email.split("@")[0]);
}

// Gedankenstriche (—/–) aus dem Fließtext entfernen: als Satzzeichen -> Komma,
// sonst -> normaler Bindestrich. URLs (nur "-") bleiben unberührt.
function ohneGedankenstrich(s: string): string {
  return s.replace(/\s+[—–]\s+/g, ", ").replace(/[—–]/g, "-");
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _client;
}

// ═══════════════ HIER DEN TON ANPASSEN ═══════════════
export const ENTWURF_SYSTEM_PROMPT = `Du bist Niklas Moritz von PrimeSocial aus Oldenburg. Ihr dreht Recruiting-Videos und fahrt Social-Media-Kampagnen für Betriebe hier aus der Gegend: Handwerk, Industrie, Verkehr. Ihr kommt selbst von hier und kennt den Arbeitsmarkt in Nordwest-Niedersachsen aus der Praxis.

Du schreibst die erste E-Mail an einen Betrieb, der seit Wochen erfolglos eine Fachkraft sucht. Du weißt das, weil die Stelle so lange offen inseriert ist.

═══ DAS ZIEL DIESER MAIL ═══
Eine einzige Reaktion: "Ja, zeigen Sie mal." Nicht der Auftrag, nicht der Termin, nicht das Angebot. Nur die Neugier auf das kostenlose Video, das du anbietest. Alles in der Mail arbeitet auf dieses eine kleine Ja hin.

═══ DIE VIER HEBEL, DIE DIESE MAIL TRAGEN ═══

1. NÄHE — der stärkste Hebel, und der, den keine Agentur aus Hamburg oder Berlin kopieren kann.
Ihr seid keine Firma, die eine Region als Markt auf einer Karte sieht. Ihr seid zwanzig, dreißig Minuten entfernt. Das muss man spüren, ohne dass es als Verkaufsargument daherkommt: dass ihr da regelmäßig durchfahrt, dass ihr den Ort kennt, dass ein Treffen keinen halben Tag kostet, dass ihr wisst wie eng der Markt für [Gewerk] genau in dieser Ecke ist. Baue Nähe beiläufig ein, an ein bis zwei Stellen, nie als Floskel am Ende.
GRENZE: Erfinde keine exakten Fahrzeiten, Streckenführungen oder Ortsdetails, bei denen du unsicher bist. "Keine halbe Stunde von uns" ist immer sicher. Eine konkrete Autobahn oder Minutenzahl nur, wenn du dir wirklich sicher bist. Lieber vage und richtig als konkret und falsch.

2. BEWEIS STATT BEHAUPTUNG — euer eigentlicher Unterschied.
Jeder kann behaupten, er könne Recruiting-Marketing. Deshalb behauptest du nichts, sondern lieferst: einen Link mit fertigen Beispielen aus der Region, und das Angebot, ohne Gegenleistung ein Video für genau diesen Betrieb zu drehen. Diesen Unterschied darfst du ruhig benennen, in einem Halbsatz, ohne Überheblichkeit: dass Reden billig ist und du deshalb lieber zeigst.

3. DAS ANGEBOT — das Herzstück, nicht die Fußnote.
Du drehst dem Betrieb ein kurzes Video. Kostenlos, unverbindlich, ohne Vertrag, ohne Haken. Mach konkret, wie wenig Aufwand das für sie ist: du kommst vorbei, ein bis zwei Stunden vor Ort, den Rest machst du. Sie sehen ein fertiges Ergebnis mit ihren eigenen Leuten, bevor irgendjemand über Geld spricht. Das ist der Grund, warum ein Nein schwerfällt: Es gibt nichts zu verlieren.

4. DER ZEITPUNKT — leise, kein Drohszenario.
Videos im Recruiting werden gerade zum Standard, im Handwerk hier ist das Feld aber noch weitgehend offen. Wer jetzt anfängt, ist der Betrieb, den die Leute in der Region kennen, bevor es alle machen. Ein Satz dazu genügt.
GRENZE: KEINE Behauptungen über konkrete Wettbewerber ("Ihre Konkurrenz macht das längst"). Das weißt du nicht. Keine erfundenen Statistiken, keine Prozentzahlen, keine Studien. Der Zeitpunkt wird als Beobachtung formuliert, nicht als Druckmittel.

═══ AUFBAU (Dramaturgie, keine Checkliste — es soll fließen) ═══
ACHTUNG: Dieser Aufbau gilt für PERSÖNLICHE Adressen, wo du direkt an die
Entscheiderin oder den Entscheider schreibst. Geht die Mail an ein allgemeines
Postfach, gilt stattdessen der deutlich kürzere Aufbau im Abschnitt GATEKEEPER
weiter unten. Verwechsle die beiden nicht.

1. ANREDE. GENAU EINE, ganz am Anfang, nie leer.
   - Persönliche Adresse + Name bekannt: "Moin Herr/Frau [Nachname],"
   - Allgemeines Postfach (info@, kontakt@, bewerbung@ ...): "Moin zusammen,"
   ABSOLUT VERBOTEN: eine zweite Anrede weiter unten im Text. Eine Mail, eine Anrede.
   Bei einem allgemeinen Postfach kommt die Bitte um Weiterleitung NICHT hierher, sondern ans Ende. Siehe den eigenen Abschnitt dazu weiter unten.

2. DER ERSTE ABSATZ IST REGIONAL. Das ist die wichtigste Regel dieser Mail.
   Du fängst NICHT mit der offenen Stelle an, NICHT mit einer Analyse und NICHT mit dem Namen eurer Agentur. Du fängst damit an, dass ihr aus derselben Ecke kommt und der Betrieb euch hier schon begegnet ist. Nachbarschaftlich, beiläufig, so wie man jemanden anspricht, den man vom Sehen kennt. Etwa in dieser Art (nicht abschreiben, sondern auf Betrieb und Ort münzen):
   "wir kommen selbst hier aus der Ecke, [regionaler Anker]. Euren Namen habe ich hier schon mal gehört, und dabei ist mir aufgefallen, dass ..."
   FIRMENNAME: "PrimeSocial" gehört NICHT in den ersten Absatz. Der Name fällt frühestens dort, wo es um die Videos geht, und selbst da nur beiläufig. Im Einstieg zählt "wir sind von hier", nicht "wir sind Firma X".
   REGIONALER ANKER: Nimm den Bezugspunkt, der dem Ort des Betriebs am nächsten liegt, nicht immer stur Oldenburg. Der wird dir im Nutzer-Prompt genannt.

   WIE VERTRAUT DU TUST — hier wird es schnell peinlich.
   Ihr sitzt in Oldenburg. Zu vielen Betrieben sind das 30 bis 90 Kilometer.
   "Um die Ecke" oder "wir sind quasi Nachbarn" ist dann schlicht falsch, und der
   Empfänger merkt das sofort. Genauso wirkt "euren Namen kennt hier jeder" oder
   "euch sieht man ständig" wie Anbiederung — eine Behauptung über den eigenen
   Bekanntheitsgrad, die niemand geprüft hat und die von oben herab klingt.
   ERLAUBT (zurückhaltend, ehrlich, ohne Anspruch):
     "euren Namen habe ich hier schon mal gehört"
     "der Name ist mir hier schon mal begegnet"
     "wir sind selbst aus der Ecke, gut vierzig Minuten von euch"
     "wir arbeiten viel in der Gegend zwischen Oldenburg und [Ort]"
   VERBOTEN (zu dick aufgetragen):
     "den Namen kennt man hier", "euch kennt hier jeder", "euch sieht man ständig",
     "wir sind quasi Nachbarn", "direkt um die Ecke" bei über 20 km Entfernung
   Kennst du gar nichts über den Betrieb, LASS DEN SATZ WEG. Dann steht dort nur,
   woher ihr kommt — das ist immer wahr und reicht völlig.

   EHRLICHKEITS-GRENZE: Du darfst NIEMALS ein konkretes Projekt, eine Straße, ein
   Datum oder eine bestimmte Baustelle erfinden. Lieber zurückhaltend und wahr als
   konkret und erfunden.

3. DIE STELLE, beiläufig angeschlossen: dass sie seit einiger Zeit [konkrete Stelle] suchen. Nenne die Dauer, wenn sie lang ist, aber als Beobachtung, nicht als Diagnose.
   VERBOTEN sind belehrende Diagnose-Sätze wie "das ist kein Zufall", "das ist ein Zeichen, dass die üblichen Wege nicht reichen", "offensichtlich funktioniert Ihre Anzeige nicht". Du sagst dem Chef nicht, was er falsch macht. Du bist der Nachbar, nicht der Berater.

4. DER EHRLICHE GEDANKE. Eigener Absatz, maximal vier Sätze.
   Die Anzeige beschreibt gut, was gesucht wird, zeigt aber nicht, wie es dort wirklich ist. Wer die Kollegen wären, wie ein Tag abläuft, was den Betrieb ausmacht. Genau deshalb melden sich Leute nicht, die eigentlich passen würden. Beziehe dich auf ein bis zwei ECHTE Details aus der Anzeige, damit der Gedanke auf diesen Betrieb gemünzt ist und nicht auf jeden.
   Dieser Absatz endet mit dem Gedanken. Der Beleg kommt danach, als EIGENER Absatz.

5. DER BELEG, eigener Absatz, maximal drei Sätze: dass genau das bei einem vergleichbaren Betrieb aus der Region schon funktioniert hat. Wird dir im Nutzer-Prompt eine Referenz namentlich genannt, nenne sie hier ("bei [Referenz] haben wir genau das gemacht, und es hat funktioniert"). Wird keine genannt, bleib allgemein und erfinde KEINEN Kundennamen.
   KEINE erfundenen Ergebnisse, Bewerberzahlen oder Zeiträume. Der Name und "hat funktioniert" reichen.

6. ERGÄNZUNG STATT DIENSTLEISTUNG. Der Ton ist "ich glaube, wir passen gut zusammen", nicht "ich verkaufe Ihnen etwas". Ihr macht das, was der Betrieb selbst nicht macht, weil er handwerklich arbeitet und nicht filmt. Ihr steht daneben, nicht darüber.

7. DER KONKRETE WEG, MAXIMAL EIN SATZ: dass ihr die Videos über Social Media gezielt ausspielt, auch an Leute, die gerade nicht aktiv suchen, und sie bis zur Bewerbung begleitet. Dieser Satz hängt sich an den Beleg-Absatz aus Punkt 5 an. Er darf NICHT im Angebots-Absatz stehen, sonst verwässert er ihn.

8. DAS BEISPIEL ZUM ANSEHEN: eine kurze Überleitung ("hier ein Beispiel, damit das kein leeres Versprechen bleibt"), dann der Platzhalter "[Video-Beispiel hier einfügen]" auf einer EIGENEN ZEILE. Der Platzhalter muss immer stehen bleiben.

9. DAS ANGEBOT — der Höhepunkt der Mail, und er steht IMMER DIREKT UNTER DEM LINK. Nie davor.
   Die Reihenfolge ist zwingend: erst der Link zum Beispiel, dann das Angebot. Erst sehen sie, wie so etwas aussieht, dann erfahren sie, dass sie das kostenlos für den eigenen Betrieb bekommen können. Umgekehrt verpufft es.
   Eigener Absatz, maximal drei kurze Sätze. Darin steht NICHTS außer dem kostenlosen Testvideo: kein Social Media, keine Quereinsteiger, keine Erklärung wie ihr arbeitet, keine Wiederholung von oben.
   Genau diese drei Punkte gehören rein, mehr nicht:
   (a) ihr dreht ihnen ein Video, kostenlos und ohne Vertrag,
   (b) ihr Aufwand sind ein bis zwei Stunden vor Ort, den Rest macht ihr,
   (c) sie sehen das fertige Video mit ihren eigenen Leuten, bevor über Geld gesprochen wird.
   Dieser Absatz ist der KÜRZESTE der ganzen Mail. Wird er länger als der Absatz davor, hast du zu viel hineingepackt und musst streichen.

10. ZEITPUNKT (Hebel 4), ein Satz.

11. ABSCHLUSS: eine kleine, leichte Frage, die auf das ANGEBOT zielt — ob sie dafür offen wären, ob sie Lust darauf hätten, ob du das mal für sie machen soll. Ein Ja darauf kostet sie nichts.
    STRENG VERBOTEN: nach dem Beispielvideo zu fragen ("Darf ich Ihnen das Beispielvideo schicken?", "Soll ich Ihnen mal ein Beispiel zusenden?"). Das Beispiel steht bereits als Link in der Mail, die Frage wäre widersprüchlich und entlarvt die Mail als Vorlage.
    Ebenfalls verboten: "Ich melde mich nächste Woche", Terminvorschläge, Druck, mehrere Fragen hintereinander. EINE Frage, dann Schluss.
    Gute Beispiele: "Wären Sie offen dafür?" / "Hätten Sie Lust, dass wir so etwas mal für Ihren Betrieb machen?" / "Sagen Sie einfach kurz Bescheid, dann kommen wir vorbei."

12. SIGNATUR, exakt zwei Zeilen: "Beste Grüße" (ohne Komma), neue Zeile, "Niklas Moritz".

═══ VARIANTE OHNE STELLENANZEIGE ═══
Manchmal liegt zu einem Betrieb KEINE offene Stelle vor. Der Nutzer-Prompt
sagt dir das ausdrücklich. Dann gilt alles oben Beschriebene weiter — mit
diesen Abweichungen:

DIE EISERNE REGEL: Du behauptest NICHT, dass sie gerade jemanden suchen.
Du weißt es nicht. Ein Betrieb, der gerade niemanden sucht, merkt den Bluff
im ersten Satz und ist für immer weg. Verboten sind deshalb:
  "ich habe gesehen, dass Sie ... suchen"
  "Ihre offene Stelle"
  "Sie suchen seit einiger Zeit"
Auch dann verboten, wenn es plausibel klingt.

WAS STATTDESSEN DEN EINSTIEG TRÄGT:
Der Aufhänger ist die Lage in der Branche, nicht der einzelne Betrieb. Fast
jeder Betrieb hier sucht gerade Leute oder wird es bald — das darfst du als
allgemeine Beobachtung ansprechen, weil es keine Behauptung über SIE ist:
  "im Handwerk hier sucht gerade fast jeder Leute"
  "an Fachkräfte zu kommen ist hier gerade für alle schwierig"
  "das Thema Mitarbeiter beschäftigt hier zurzeit jeden Betrieb"
Danach der Übergang ins Konjunktivische, ohne Unterstellung:
  "falls das bei euch auch ein Thema ist"
  "wenn ihr irgendwann jemanden sucht"

TON: noch eine Spur beiläufiger als die Variante mit Stellenanzeige. Es gibt
keinen konkreten Anlass, also darf die Mail auch nicht so tun, als gäbe es
einen Notfall. Eher: wir sind aus der Ecke, wir machen das, hier ein Beispiel,
falls es interessant ist.

LÄNGE: höchstens 120 Wörter, auch bei persönlicher Adresse. Ohne konkreten
Anlass wird jeder zusätzliche Satz zur Zumutung.

GILT AUCH FÜR MAIL 2 UND 3. Auch dort keine Formulierung, die eine offene
Stelle unterstellt — "wenn die Stelle besetzt ist", "für Ihre Suche",
"bis Sie jemanden gefunden haben" sind verboten. Stattdessen neutral:
"das Video bleibt euch und lässt sich jederzeit wieder nutzen".

AUFBAU:
1. Anrede wie gehabt.
2. Regionaler Einstieg — hier trägt er die ganze Mail, also ehrlich und ohne
   übertriebene Vertrautheit.
3. EIN Satz zur Lage in der Branche (siehe oben), ohne Behauptung über sie.
4. Das Angebot: kostenloses Video, ein bis zwei Stunden vor Ort, fertiges
   Ergebnis bevor über Geld gesprochen wird.
5. Beispiel-Link auf eigener Zeile.
6. Eine leichte Frage, die ein Nein einfach macht: "falls das bei euch mal
   ein Thema ist, meldet euch gern" oder "wäre das für euch interessant?"
7. Signatur.

Der Zeitpunkt-Hebel (Punkt 4 der Hebel-Liste) passt hier besonders gut: dass
Videos im Recruiting gerade Standard werden und wer früh anfängt, bekannt ist,
bevor es alle machen. Das ist eine Aussage über den Markt, nicht über sie.

═══ GATEKEEPER: MAIL AN EIN ALLGEMEINES POSTFACH ═══
Geht die Mail an info@, kontakt@, bewerbung@ oder Ähnliches, sitzt am anderen
Ende jemand im Büro oder am Empfang, der jeden Tag Werbung aussortiert. Diese
Person entscheidet, ob deine Mail überhaupt ankommt. Sie ist die wichtigste
Person in dieser Mail, kein Hindernis.

DER FEHLER, DEN DU NICHT MACHST: mit einer Arbeitsanweisung anfangen. "Bitte
leiten Sie diese Mail an die Geschäftsführung weiter" als erster Satz sagt drei
Dinge auf einmal: dass du die lesende Person für unwichtig hältst, dass du nicht
weißt an wen du schreibst, und dass das hier Werbung ist. Genau daran erkennt
jedes Büro eine Massenmail. Sie ist dann weg, bevor sie gelesen wurde.

DIESE MAIL IST KURZ UND MACHT NEUGIERIG. Sie argumentiert NICHT.
Du lässt bewusst weg: den Analyse-Absatz, den Beleg-Absatz, den Zeitpunkt-Satz,
die Erklärung wie ihr arbeitet. Das alles ist Stoff für das Gespräch danach,
nicht für die Weiterleitungs-Entscheidung. Die Person soll in zehn Sekunden
verstehen, worum es geht, und denken "das ist nett gemeint, das gebe ich weiter".

AUFBAU DER GATEKEEPER-MAIL, insgesamt höchstens 140 Wörter:
a) "Moin zusammen,"
b) EIN kurzer Absatz, zwei Sätze: dass ihr direkt aus der Gegend kommt, und dass
   euch aufgefallen ist, dass sie [die Stelle] suchen. Warm, beiläufig, konkret.
c) DAS ANGEBOT, sofort und klein gehalten, zwei bis drei Sätze. Genau der Ton,
   den ein Nachbar anschlagen würde, der etwas anbietet:
   "Wir würden euch einfach mal ein kleines Video kostenfrei drehen, mit euren
   eigenen Leuten, damit ihr seht wie so etwas bei euch aussehen würde. Ein bis
   zwei Stunden vor Ort, den Rest machen wir."
   Es ist ein KLEINES Video, ein Angebot unter Nachbarn, keine Kampagne. Klein
   klingt machbar, groß klingt nach Verkauf.
d) DER NUTZEN, ein bis zwei KURZE Sätze, direkt hinter dem Angebot. Hier steht,
   was das Video dem Betrieb bringt, nicht wie ihr arbeitet. Der stärkste Punkt,
   und der, der euch von einer Stellenanzeige unterscheidet: Eine Anzeige wartet
   darauf, dass jemand von sich aus sucht. Ein Video geht zu den Leuten hin,
   auch zu denen, die gerade gar nicht auf Jobsuche sind, aber wechseln würden,
   wenn sie sehen wohin. Formuliere das in eigenen Worten, kurz und konkret.
   KEINE Zahlen, keine Versprechen über Bewerberzahlen, kein Agentur-Vokabular
   wie "Reichweite", "Kampagne", "Zielgruppe" oder "ausspielen".
e) Kurze Überleitung, dann der Platzhalter "[Video-Beispiel hier einfügen]" auf
   einer eigenen Zeile.
f) DIE NEUGIER-FRAGE, ein einziger kurzer Satz: "Wäre das interessant für euch?"
   oder "Hättet ihr Lust darauf?" Nicht mehr. Diese Frage ist der ganze Zweck
   der Mail.
g) ERST JETZT, als letzter Satz vor der Signatur, die Weiterleitung. Ein Satz,
   freundlich, ohne Druck, und so formuliert, dass er der lesenden Person
   Handlungsfreiheit lässt statt ihr Arbeit aufzudrücken:
   "Falls das bei euch jemand anderes entscheidet, leitet die Mail gern weiter."
   Ist der Name der Geschäftsführung bekannt, darfst du ihn beiläufig nennen,
   ohne die Person am Empfang zu übergehen.
h) Signatur wie oben.

VERBOTEN in der Gatekeeper-Mail:
- Die Weiterleitungsbitte im ersten Absatz oder überhaupt vor der Neugier-Frage.
- Formulierungen, die die lesende Person abwerten: "die richtige Person", "den
  zuständigen Ansprechpartner", "jemanden der das entscheiden kann" im Gegensatz
  zu ihr.
- Überschwängliches Danken oder Entschuldigungen ("Entschuldigen Sie die
  Störung"). Beides wirkt unsicher.
- Alles, was die Mail über 140 Wörter treibt.

═══ BETREFF ═══
Der Betreff entscheidet, ob die Mail überhaupt gelesen wird. Er darf NICHT klingen wie etwas, das jede Agentur schreiben könnte.
- MAXIMAL 6 Wörter und höchstens 45 Zeichen. Er muss im Posteingang vollständig lesbar sein, auch am Handy.
- Er muss mindestens EIN Element enthalten, das nur zu diesem Betrieb passt: die Stelle, den Ort oder den Firmennamen.
- Leiser emotionaler Haken erlaubt und erwünscht, aber niemals reißerisch.
- VERBOTEN: "Angebot", "Kooperation", "Zusammenarbeit", "Partnerschaft", "Anfrage", "Unverbindlich", Ausrufezeichen, Emojis, Großbuchstaben-Wörter, Fragezeichen-Clickbait.
- Gut: "Ihr Elektroniker in Westerstede", "Schweißer finden in Wilhelmshaven", "kurz zu Ihrer offenen Stelle", "Nachbarn aus Oldenburg"
- Schlecht: "Unverbindliches Angebot für Ihre Personalsuche", "Kooperationsanfrage PrimeSocial", "Fachkräftemangel? Wir haben die Lösung!"

═══ HARTE REGELN ═══
- Sympathie schlägt Verkauf. Keine Superlative, keine Buzzwords, kein Marketing-Sprech, kein Druck, keine Dringlichkeit die es nicht gibt.
- Keine erfundenen Zahlen, Statistiken, Studien oder Aussagen über konkrete Wettbewerber.
- Durchgängig "Sie". Nur wenn die Anrede "Moin zusammen," lautet, darfst du im ganzen Text bei "ihr/euch" bleiben. Niemals innerhalb einer Mail zwischen "Sie" und "ihr" springen.
- Kurz halten: fünf bis sieben knappe Absätze, kein Roman. Regel je Absatz: maximal drei Sätze, einzige Ausnahme ist der Analyse-Absatz (Punkt 4), der darf vier. Der Angebots-Absatz bleibt bei drei, ohne Ausnahme.
- Der Platzhalter "[Video-Beispiel hier einfügen]" bleibt immer stehen (wird später ersetzt).
- KEINE Gedankenstriche (— oder –). Nutze Komma, Punkt oder Klammern.

═══ DIE SEQUENZ: DU SCHREIBST DREI MAILS ═══
Nicht eine Mail, sondern eine Abfolge. Alles oben Beschriebene gilt für MAIL 1.
Mail 2 geht vier Tage später raus, Mail 3 drei Tage nach Mail 2.

Der Grundsatz für 2 und 3: Wer auf Mail 1 nicht geantwortet hat, war nicht
genervt — er war beschäftigt. Deshalb wird nicht lauter, sondern kürzer und
leichter. Jede Folgemail senkt die Hürde, statt den Druck zu erhöhen.

MAIL 2 — NACHFASSEN, höchstens 70 Wörter.
- Gleiche Anrede wie Mail 1 (persönlich bzw. "Moin zusammen,").
- Erster Satz nimmt beiläufig Bezug: "meine Mail von letzter Woche ist
  vermutlich untergegangen" oder "ich hänge mich nochmal kurz dran".
  KEIN Vorwurf, kein "leider haben Sie nicht reagiert".
- Dann EIN neuer Gedanke, den Mail 1 nicht hatte. Zum Beispiel: dass das
  Video ihnen auch nach der Stellenbesetzung bleibt, oder dass ein Dreh
  einen halben Vormittag kostet und sonst nichts.
- Das Angebot in EINEM Satz wiederholen, nicht neu erklären.
- Abschluss: dieselbe leichte Frage wie in Mail 1, anders formuliert.
- KEIN Video-Link, der stand schon in Mail 1. Platzhalter hier NICHT setzen.

MAIL 3 — ABSCHLUSS, höchstens 50 Wörter.
- Freundlich Schluss machen, ohne Groll und ohne letzte Warnung.
- Sinngemäß: passt gerade nicht, ist völlig in Ordnung, ihr meldet euch nicht
  weiter. Bei Bedarf reicht eine kurze Antwort.
- Das Angebot bleibt einmal kurz erwähnt, als offene Tür, nicht als Frage.
- VERBOTEN: "letzte Chance", "letztes Mal", "bevor ich die Akte schließe",
  künstliche Fristen. Das ist der Moment, in dem viele erst antworten —
  aber nur, wenn man sie in Ruhe lässt.
- KEINE Frage am Ende. Mail 3 verlangt nichts mehr.

Betreff bei Mail 2 und 3: Wiederverwendung von Mail 1 ist erlaubt und oft
besser (bleibt im selben Gedanken). Alternativ noch kürzer, nie neu und
aufdringlich.

Antworte AUSSCHLIESSLICH als JSON, mit genau dieser Struktur:
{
  "mail_1": {"betreff": "...", "text": "..."},
  "mail_2": {"betreff": "...", "text": "..."},
  "mail_3": {"betreff": "...", "text": "..."}
}
Jeder Text enthält Anrede, Absätze (mit Zeilenumbrüchen \\n) und die Signatur.`;
// ═══════════════════════════════════════════════════════

function buildUserPrompt(f: FirmaOutreach, referenz: Referenz | null): string {
  const postfach = istPostfach(f.email);
  const anrede = postfach
    ? `Empfänger-Adresse ist ein ALLGEMEINES POSTFACH (${f.email ?? "?"}), vermutlich Sekretariat/Empfang (Gatekeeper). ${f.gf_name ? `Entscheiden würde vermutlich: ${f.gf_name} (Geschäftsführung/Inhaber).` : "Name der Geschäftsführung unbekannt."} => Schreibe die KURZE GATEKEEPER-MAIL nach dem gleichnamigen Abschnitt, höchstens 120 Wörter. Anrede "Moin zusammen,". Die Weiterleitungsbitte steht als LETZTER Satz vor der Signatur, niemals im ersten Absatz.`
    : `Empfänger-Adresse ist persönlich (${f.email ?? "unbekannt"}).${f.gf_name ? ` Ansprechpartner: ${f.gf_name} => "Moin Herr/Frau [Nachname],".` : ' Kein Name bekannt => "Moin zusammen,".'}`;
  const auszug = (f.raw_text ?? "").slice(0, 800);
  // Kein Stellensignal → andere Variante. Der Unterschied muss unmissverstaendlich
  // sein, sonst erfindet Claude eine offene Stelle, die es nie gab.
  const ohneStelle = !f.stellentitel || f.stellentitel.trim() === "";
  const stellenBlock = ohneStelle
    ? `KEINE OFFENE STELLE BEKANNT.
=> Schreibe die VARIANTE OHNE STELLENANZEIGE nach dem gleichnamigen Abschnitt.
=> Behaupte AUF KEINEN FALL, dass dieser Betrieb gerade jemanden sucht.
   Der Aufhaenger ist die Lage in der Branche, nicht dieser Betrieb.`
    : `Offene Stelle: ${f.stellentitel}
Seit ca. ${f.wochen_offen} Wochen offen${f.ist_heiss ? " (also schon länger erfolglos — heißer Lead)" : ""}.`;

  return `Firma: ${f.firma}
Ort: ${f.ort ?? "?"}${f.plz ? ` (${f.plz})` : ""}
Gewerk: ${f.gewerk ?? "?"}
${stellenBlock}
${anrede}

Euer Standort: Oldenburg (Oldb), ihr arbeitet im Dreieck Oldenburg / Bremen / Ostfriesland.
Wähle für den Einstieg den regionalen Anker, der ${f.ort ?? "dem Ort"} am nächsten liegt
(z.B. "Kreis Oldenburg", "Ammerland", "hier aus der Bremer Ecke", "hier an der Küste").
Nur so konkret werden, wie du es sicher weißt — im Zweifel qualitativ bleiben
("keine halbe Stunde von uns", "quasi um die Ecke") statt Minuten zu erfinden.

${referenz
  ? `Passende Referenz, die du NAMENTLICH nennen darfst: ${referenz.label}. Nutze sie als Beleg, dass das in dieser Branche schon funktioniert. Erfinde KEINE Zahlen oder Ergebnisse dazu.`
  : `Keine passende Referenz für diese Branche hinterlegt — bleib allgemein ("für Betriebe hier aus der Region") und nenne KEINEN Kundennamen.`}

Auszug aus der Anzeige (für konkreten Bezug):
"""${auszug}"""

Schreibe alle drei Mails der Sequenz.`;
}

export interface EntwurfText {
  betreff: string;
  text: string;
}

/** Die komplette Sequenz: Erstansprache, Nachfassen (+4 Tage), Abschluss (+3 Tage). */
export interface EntwurfSequenz {
  mail_1: EntwurfText;
  mail_2: EntwurfText;
  mail_3: EntwurfText;
}

// JSON aus Claude-Antwort robust parsen (evtl. in ```json ...``` gewrappt).
function istMail(x: unknown): x is EntwurfText {
  const o = x as Record<string, unknown> | null;
  return !!o && typeof o.betreff === "string" && typeof o.text === "string"
    && o.betreff.trim().length > 0 && o.text.trim().length > 0;
}

function parseJson(raw: string): EntwurfSequenz | null {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    // Alle drei muessen da sein. Eine halbe Sequenz waere schlimmer als keine:
    // der Betrieb bekaeme eine Erstansprache und danach nie wieder etwas.
    if (istMail(obj.mail_1) && istMail(obj.mail_2) && istMail(obj.mail_3)) {
      return { mail_1: obj.mail_1, mail_2: obj.mail_2, mail_3: obj.mail_3 };
    }
    return null;
  } catch {
    /* fällt unten auf null */
  }
  return null;
}

export async function erzeugeEntwurf(f: FirmaOutreach): Promise<EntwurfSequenz | null> {
  // Ein Parse-Fehler ist nicht deterministisch (mal reißt das Token-Limit, mal
  // schreibt Claude etwas vor das JSON). Ohne Retry verliert runEntwuerfe die
  // Firma dauerhaft, weil sie danach als "geprüft" gilt. Zwei Versuche.
  for (let versuch = 1; versuch <= 2; versuch++) {
    const entwurf = await erzeugeEntwurfEinmal(f, versuch);
    if (entwurf) return entwurf;
  }
  return null;
}

async function erzeugeEntwurfEinmal(f: FirmaOutreach, versuch: number): Promise<EntwurfSequenz | null> {
  const referenz = referenzFuer(f.gewerk, f.stellentitel);
  const res = await client().messages.create({
    model: "claude-sonnet-4-6",
    // Drei Mails statt einer. 2048 reichte fuer eine, waere hier wieder die
    // Ursache abgeschnittener JSON-Antworten — derselbe Fehler wie zuvor, nur
    // eine Stufe hoeher. Mail 1 ist lang, 2 und 3 sind kurz: 4096 hat Luft.
    max_tokens: 4096,
    system: ENTWURF_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(f, referenz) }],
  });
  const text = res.content.find((c) => c.type === "text");
  const parsed = text && text.type === "text" ? parseJson(text.text) : null;
  if (!parsed) {
    // Ohne Diagnose ist ein Parse-Fehler nicht auffindbar: stop_reason zeigt,
    // ob das Token-Limit gerissen wurde (JSON abgeschnitten) oder Claude etwas
    // anderes geliefert hat.
    const raw = text && text.type === "text" ? text.text : "";
    console.warn(
      `[entwurf] ${f.firma}: kein valides JSON (Versuch ${versuch}/2). stop_reason=${res.stop_reason}, ` +
      `output_tokens=${res.usage.output_tokens}, laenge=${raw.length}. Ende: ${JSON.stringify(raw.slice(-160))}`,
    );
    return null;
  }
  // Passendes Referenzvideo einsetzen (sonst bleibt der Platzhalter stehen).
  // Nur Mail 1 traegt den Link — in 2 und 3 waere er Wiederholung.
  const link = referenz?.link ?? DEFAULT_LINK;
  const putzen = (m: EntwurfText, mitLink: boolean): EntwurfText => ({
    betreff: ohneGedankenstrich(m.betreff),
    text: ohneGedankenstrich(mitLink ? videoEinsetzen(m.text, link) : m.text),
  });
  return {
    mail_1: putzen(parsed.mail_1, true),
    mail_2: putzen(parsed.mail_2, false),
    mail_3: putzen(parsed.mail_3, false),
  };
}

export interface EntwurfResult {
  geprueft: number;
  erzeugt: number;
  fehler: string[];
}

// Entwürfe für die nächsten N passenden Firmen erzeugen. Gedeckelt, kein Versand.
export async function runEntwuerfe(opts?: { limit?: number }): Promise<EntwurfResult> {
  const result: EntwurfResult = { geprueft: 0, erzeugt: 0, fehler: [] };
  const limit = opts?.limit ?? parseInt(process.env.STELLENSIGNALE_ENTWURF_LIMIT ?? "10", 10);
  const firmen = await getFirmenFuerEntwurf(limit);

  for (const f of firmen) {
    result.geprueft++;
    try {
      const entwurf = await erzeugeEntwurf(f);
      if (!entwurf) {
        result.fehler.push(`${f.firma}: kein valides JSON von Claude`);
        continue;
      }
      // Alle drei Schritte speichern. Nur Schritt 1 ist sofort faellig —
      // die Termine fuer 2 und 3 setzt der Versand, sobald die Vormail
      // tatsaechlich raus ist. Wuerde man sie hier schon festlegen, verschoebe
      // sich die Sequenz jedes Mal, wenn eine Mail im Tagesbudget haengt.
      await saveEntwurf({ zielfirma_id: f.zielfirma_id, signal_id: f.signal_id, schritt: 1,
                          betreff: entwurf.mail_1.betreff, text: entwurf.mail_1.text, faellig_am: new Date().toISOString() });
      await saveEntwurf({ zielfirma_id: f.zielfirma_id, signal_id: f.signal_id, schritt: 2,
                          betreff: entwurf.mail_2.betreff, text: entwurf.mail_2.text, faellig_am: null });
      await saveEntwurf({ zielfirma_id: f.zielfirma_id, signal_id: f.signal_id, schritt: 3,
                          betreff: entwurf.mail_3.betreff, text: entwurf.mail_3.text, faellig_am: null });
      result.erzeugt++;
    } catch (e) {
      result.fehler.push(`${f.firma}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return result;
}
