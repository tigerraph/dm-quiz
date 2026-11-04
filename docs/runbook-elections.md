# Runbook — Wahlen (Sprint 30' + Runde)

Moderationsleitfaden für das Special Topic im 5/5/7/5/5-Format, danach die Runde.
Pillar: **Civics & Basic Concepts**. Freitag, 6. November 2026, 15:00, Raum C2, Impact Hub,
offen für Mitglieder und Gäste.
Folien: [`slides/elections.pdf`](../slides/elections.pdf) ·
Teilnehmerseite: [`content/elections.html`](../content/elections.html) ·
Regie fürs Handy: [`content/regie-elections.html`](../content/regie-elections.html) ·
Kein-Folien-Fallback: [`slides/topic-card-elections.pdf`](../slides/topic-card-elections.pdf) ·
Quellen pro Aussage: [`topics/elections/README.md`](../topics/elections/README.md)

Stand aller Fakten: 30. Oktober 2026. **Kein Midterm-Resultat im Material:** Die USA wählen erst am
3. November. Auch Serbiens Endresultat fehlt noch (Wiederholung am 1. November).

## Ausfüllen, sobald Resultate da sind (Mi 4. oder Do 5. November)

**Wer:** Rafa bestimmt, wer die Zahlen einträgt. Vorschlag: Der Master-Agent beauftragt am Mittwochnachmittag
einen Helfer, der Helfer trägt ein und erstellt die PDFs neu, Rafa gibt das OK für live. Ein offener Punkt, bis Rafa
entschieden hat.

**Wo:** Alles steht in einer einzigen Datei, [`slides/elections-results.js`](../slides/elections-results.js).
Dort `null` ersetzen, sonst nichts anfassen. Die Felder «⏳ Resultat folgt» in Folien und Teilnehmerseite
füllen sich selbst, auch die Etiketten, Serbiens «Vorläufig»-Satz und die Beteiligung auf der Schweiz-Folie.

| # | Feld | Was eintragen | Woher |
|---|---|---|---|
| 1 | `us.house` | `d`, `r`: entschiedene Sitze. `other`: Sitze anderer. `open`: noch nicht entschiedene. `majority`: `"D"` oder `"R"`, erst wenn die Mehrheit ausgerufen ist | AP-Race-Calls |
| 2 | `us.senate` | wie oben. Unabhängige zu der Partei zählen, mit der sie stimmen, und das in `note` sagen | AP-Race-Calls |
| 3 | `us.governors` | `d`, `r`, `other`, `open` (36 Rennen) | AP-Race-Calls |
| 4 | `us.turnout` | Schätzung als Text, z. B. `"≈ 47 %"`. Gibt es keine, bleibt `null`: Die Folie zeigt dann «folgt» | U.S. Elections Project, sonst leer |
| 5 | `us.asOf`, `us.source`, `us.note` | Datum und Uhrzeit des Ablesens, Quelle, optional eine Notiz wie `"GA: runoff 01.12."` | selbst |
| 6 | `rs.student`, `rs.united`, `rs.turnout`, `rs.asOf` | Endresultat der Wahlkommission RIK: beide Listen und Beteiligung, alles oder nichts. Prozent als Text, z. B. `"53,0 %"`, Sitze als Zahl. Nur das amtliche Endresultat, keine Zwischenstände | rik.parlament.gov.rs |

Danach von Hand prüfen, weil das nicht aus Zahlen kommt. Trifft etwas nicht mehr zu, den Satz in
`slides/elections.html` und `content/elections.html` ändern, in allen vier Sprachen, mit Quelle:

- [ ] **Serbien:** Präsidentschaftswahl-Datum festgelegt? Dann «spätestens am 27. Dezember» ersetzen.
      Wiederholung vom 1. November gelaufen? Dann «ist … angesetzt» in die Vergangenheit setzen.
- [ ] **Brasilien:** Stimmt die Karte «Wer glaubt dem Resultat?» noch? Hat Flávio Bolsonaro die angekündigte
      Klage eingereicht oder seine Haltung geändert?
- [ ] **USA:** Der Satz «Offen.» in «Wer glaubt dem Resultat?» prüfen: Gibt es Anfechtungen oder
      Anerkennungen, die man belegen kann? Wenn ja, mit Quelle ersetzen.

Dann `npm run render-topic -- elections`, jede PDF-Seite ansehen, `npm run check-topic -- elections`,
committen. **Live geht das erst mit dem Merge.** Letzte Kontrolle Freitag, 14:00.

### Wenn Rennen noch offen sind

Das ist der Normalfall, keine Panne. Das Feld zeigt die entschiedenen Sitze und «noch offen».

- Ein Rennen ohne Call bleibt in `open`. Nie einer Seite zuschlagen, auch wenn sie vorne liegt.
- `majority` bleibt `null`, bis die Mehrheit ausgerufen ist. Die Folie sagt dann «noch nicht entschieden».
- Keine Umfrage, keine Prognose, kein Zwischenstand in Prozent. Nur Calls und amtliche Zahlen.
- Ein Call ist nicht amtlich. Darum trägt die Folie das Etikett «NICHT AMTLICH», auch wenn alle Rennen
  entschieden sind. Die Bundesstaaten beglaubigen erst Tage bis Wochen später.
- Stichwahl in Georgia (allenfalls 1. Dezember): zählt als offen, in `note` vermerken.
- **Ist bis Freitag nichts eingetragen:** Die Session läuft trotzdem, das Feld bleibt sichtbar. Satz für
  die Moderation: «Hier steht noch nichts, weil es noch nicht feststeht. Genau darum geht es heute.»

## Vorbereitung (vor der Session)

- [ ] Supabase-Projekt **Active**? (Dashboard-Check, sonst läuft der Quiz im Solo-Fallback)
- [ ] Resultate USA und Serbien eingetragen? (siehe oben)
- [ ] QR-Code auf Folie 3 einmal selbst scannen — landet er im richtigen Spiel?
- [ ] Beamer-Ansicht öffnen (Link auf Folie 3 und in der Regie-Folie ist klickbar):
      `?session=elections&host=1`
- [ ] **Zettel für das Live-Experiment**: [`content/zettel-elections.html`](../content/zettel-elections.html)
      drucken (A4, ein Blatt = 5 × A + 5 × B, `?lang=en|fr|it` für die anderen Sprachen)
      und zuschneiden. A für die linke Raumhälfte, B für die rechte.
      Auch im Admin unter «Topic materials».
- [ ] Post-its + Stifte bereit (für die Bottom Line / Master Checklist)
- [ ] Master Checklist und Sterne-Tafel dabei (Civics-Stern ★ wird heute vergeben)

## Ablauf

| Zeit (Start 15:00) | Block | Folie | Moderation |
|---|---|---|---|
| — | Ankommen | 1 DM-Hauptfolie | Pillar zeigen: heute gibt es den **Civics-Stern**. Zwei Slots: Sprint (30′), dann die Runde. |
| 15:00 (5′) | **Einstieg** | 3 QR | «Handy raus.» QR scannen, Beamer-Ansicht per Klick öffnen, 3 Fragen spielen, je eine pro Land. Erklärungen zeigt die App — nicht doppelt erklären. |
| 15:05 (5′) | **Experiment** | 4 Live-Experiment, 5 Check | Die Folie erklärt dem Raum die drei Schritte. Dann die Check-Folie: Welche Länder waren es? Kein Video in dieser Session. |
| 15:10 (7′) | **Drei Fälle** | 6 Raster, 7 Brasilien, 8 Serbien, 9 USA, 10 Und die Schweiz? | Raster in 20 Sekunden, pro Land knapp zwei Minuten, zuletzt die Schweiz als reine Info. Nur die Karte «Wer glaubt dem Resultat?» ganz vorlesen, der Rest steht auf der Folie und der Teilnehmerseite. |
| 15:17 (5′) | **Diskussion** | 11 Offene Runde | Keine strukturierte Übung: offene Runde. Die drei Fragen auf der Folie sind Anstösse, nicht alle nötig. |
| 15:22 (5′) | **Take-away** | 12 Kit | Kit laut lesen lassen. Bottom Line auf die Master Checklist, Civics-Stern ★ vergeben. Nie streichen. Danach Puffer. |
| danach | **Die Runde** | 13 | Nur die Titelfolie. Einstiegsfrage, falls es stockt: «Welchem Wahlresultat habt ihr zuletzt misstraut, und warum?» |
| Schluss | Abspann | 14 | Merci-Folie: QR auf die Teilnehmerseite (Folien, Quiz, Stern). |

## Die Dramaturgie

Drei Länder in 30 Minuten gehen nur, wenn jedes kurz bleibt. Darum tragen die **vier Fragen** vom Raster
(Was? Wie? Worum? Wem?) alle drei Fälle, und die Länder sind Beispiele dafür, nicht je ein eigener Vortrag.
Der rote Faden ist die vierte Frage: Wer glaubt dem Resultat?

Das Live-Experiment kommt vor den Fällen, und die Zettel nennen kein Land. Die Quizfragen verraten bewusst
nichts darüber, wie gezählt wird. So beurteilen die Leute zwei echte Systeme, nicht ihre Meinung zu einem Land.
Der Raum ist zu klein für einen Beweis. Kein Unterschied zwischen den Hälften ist auch eine
Aussage: Dann liegt Vertrauen nicht am Verfahren allein.

## Neutralität

Diese Session nimmt keine Seite. Für die Moderation:

- Beschreiben, nicht bewerten. Keine Kandidatin und keinen Kandidaten loben oder kritisieren.
- Immer sagen, wer etwas sagt: «Die OSZE-Mission schreibt …», «Das Wahlgericht teilt mit …».
- Die Kritik an Serbiens Wahl stammt von der Beobachtungsmission selbst (ODIHR, Parlamentarische Versammlungen
  von OSZE und Europarat, EU-Parlament). Sie ist kein Urteil über die Wählenden.
- Die Betrugsbehauptung in Brasilien als Behauptung benennen und sagen, was dazu belegt ist.
- Kommt Parteipolitik auf: «Spannend, aber heute geht es darum, wie man ein Resultat liest.»

## Fachliche Sicherungen (falls Rückfragen kommen)

**Brasilien**

- Das Wahlgericht TSE: Lula 64’256’232 Stimmen (51,79 %), Flávio Bolsonaro 59’826’041 (48,21 %).
  Rund 158 Millionen Wahlberechtigte, 128,2 Millionen kamen, Abstinenz rund 19,2 %.
- Erster Wahlgang: Flávio Bolsonaro 47,03 %, Lula 45,16 %.
- Am Wahltag verlängerte Richter Cristiano Zanin vom Obersten Gericht STF die Stimmabgabe von 17 auf 19 Uhr
  in noch offenen Wahllokalen, nachdem beide Kandidaturen Probleme beim Transport von Wählenden gemeldet
  hatten. Laut TSE wurden nach 17 Uhr 34’393 Stimmen abgegeben. Der Abstand zwischen den beiden betrug über
  4,4 Millionen Stimmen. Das sind die Zahlen, keine Bewertung des Vorwurfs.
- Flávio Bolsonaro schrieb in einem Brief vom 28. Oktober von Wahlbetrug und verweist auf diese Verlängerung.
  Laut CNN Brasil nennt der Brief keine Belege für Unregelmässigkeiten. Seine eigene Kampagne hatte zuvor
  selbst eine Verlängerung in drei Bundesstaaten beantragt. Seine Partei PL und sein Vize-Kandidat anerkannten
  das Resultat (CNN Brasil). Er kündigte an, die Annullierung einzuklagen (O Liberal). Stand 30. Oktober.
- Jede Person kann die Protokolle der Urnen online mit dem Gesamtresultat vergleichen (TSE).

**Serbien**

- Die Zahlen sind vorläufig. Spannweite der Zwischenstände der Wahlkommission RIK: Studentenliste 52,5 bis
  53 %, Vereintes Serbien 39 bis 39,3 %, Sitze 140 bis 141 und 103 bis 104. Darum steht auf der Folie «rund».
- Wiederholung am 1. November in 53 Wahllokalen: 31, in denen sich kein Resultat feststellen liess, und
  22 mit annullierter Stimmabgabe. Gedruckt werden 24’438 Stimmzettel (RTS).
- Die Regierung ist noch nicht gebildet. Wer Premierminister wird, ist offen; das nennen wir nicht.
- Vučić trat am 27. September als Präsident zurück, um bei der Wahl anzutreten; Parlamentspräsidentin Ana
  Brnabić ist amtierende Präsidentin (ODIHR).
- ODIHR zum Wahltag: Die Stimmabgabe wurde in 96 % der beobachteten Wahllokale positiv bewertet. Berichtet
  wurde auch von Gewalt gegen Wahlhelfende, Beobachtende und Journalistinnen und Journalisten.

**USA**

- Vor der Wahl im Haus: 218 Republikaner, 214 Demokraten, 1 Unabhängiger, 2 Sitze vakant (Clerk of the House).
- **Umfragen sind keine Resultate.** Nur falls jemand fragt, und immer so benannt: Umfrage von Pew,
  28. September bis 4. Oktober 2026, 3’917 registrierte Wählende: 44 % demokratisch, 36 % republikanisch,
  5 % andere, 15 % unsicher. Die Folien verwenden keine Umfragen.
- Zeit: Die ersten Wahllokale schliessen um 18 Uhr Ostküstenzeit, in der Schweiz am 4. November um Mitternacht.

**Schweiz**

- Die Parteistärken 2023 waren wegen eines Programmierfehlers beim Datenimport falsch. Das BFS korrigierte
  sie am 25. Oktober 2023, drei Tage nach der Wahl. Sitze und Gewählte blieben gleich.

## Wenn etwas klemmt

- **Supabase down**: Beamer sagt es; Handys spielen im Solo-Modus weiter.
- **Keine Zettel dabei**: A laut der linken Hälfte vorlesen, während die rechte die Augen schliesst, dann
  umgekehrt B für die rechte Hälfte. Danach wie gewohnt 1–5 Finger.
- **Zeit läuft davon**: das Raster nur zeigen, und die Folie «Und die Schweiz?» auf die untere Zeile kürzen.
  Take-away nie streichen — das ist der Block, der bleibt.
- **Gar keine Folien / kein Beamer**: die ausgefüllte Topic Card verwenden
  ([`slides/topic-card-elections.pdf`](../slides/topic-card-elections.pdf));
  Blanko-Vorlage: docs/reference/DM_Template_V3_Topic-Card.pdf.
