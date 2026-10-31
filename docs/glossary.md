# SchulWahl — Glossary

Status: approved by the project lead on 2026-10-30 (S6d). Every word of the interface follows it: the
catalogue in `packages/messages` (`de.ts` is the source, `en.ts` and `de-formal.ts` translate it), the
mail defaults and the handbooks. A new string uses these words; a new concept gets a row here first.

## Rules

- **Address.** `de` says **du** to everyone: students, teachers and staff, as colleagues at an
  Austrian AHS do. `de-formal` says **Sie** to staff and du to students; it differs from `de` in
  address only. `en` says "you", in British English (catalogue, programme, organisation), as its
  dates and numbers are formatted for `en-GB`. Words both students and staff read (the sign-in
  page, the account page, the errors) are phrased without address in `de-formal` ("Bitte
  einloggen."), so neither group is addressed wrongly.
- **Gender.** Persons take the asterisk: **Schüler\*innen**, **Teilnehmer\*innen**, singular
  **Schüler\*in** where a column or label needs it. A sentence about one student is rephrased
  rather than written as "der\*die Schüler\*in" ("Wer eingeteilt wurde, bekommt Bescheid"). Neutral
  nouns are preferred where they exist: Lehrkraft, Person, Administration, Organisation.
  **Klassenvorstand** stays: it is the function's name in Austrian school law, like
  Administration and Organisation.
- **Austrian school words** in both German variants: Klassenvorstand (KV), Schulstufe, Einheit,
  Stundenraster. A Germany-German variant is not part of v1.
- **Plain words, not the specification's.** No Lauf, Seed, Limit, Solver, Stufe (for a level of
  the objective), Fenster, Durchgang, Ersatzplatz, Personenliste, Stammdaten, händisch, erzwungen,
  "fix" for classes, and no sentence that reads like a contract. An error says what happened and
  what to do next. The technical detail, where an administrator needs it, follows after a colon.
- **Short sentences.** One thought per sentence; a semicolon only where the second half depends on
  the first.

## Decisions

| # | Question | Decision |
| - | -------- | -------- |
| Q1 | What a campaign is called | **Anmeldung** ("Anmeldung zur Projektwoche 2027", the list "Anmeldungen"). Where one campaign is meant, its own name. "Wahl" is kept for WPF (W1). Students *melden sich an* by giving their Wünsche. |
| Q2 | The result of the allocation | **Einteilung** for what students and teachers see ("Meine Einteilung", "Einteilung als Excel", "Einteilung veröffentlicht") and for every change after publication. **Zuteilung** only for the organizer's computation ("Zuteilung berechnen", "Zuteilung in Prüfung", the page Zuteilung). |
| Q3 | Gender form | The asterisk, everywhere (see Rules). |
| Q4 | Teachers | **Lehrkraft**, **Lehrkräfte**. |
| Q5 | A period of the timetable | **Einheit** ("ab der 2. Einheit, 2 Einheiten"), "2. EH" where space is short. |
| Q6 | The fee | **Kosten** ("Kosten: 25 €", "ohne Kosten"). |
| Q7 | Where the roster lives | **Klassenlisten** (the page, and "in den Klassenlisten"; one class's list is its Klassenliste). |
| — | Signing in, since Anmeldung is the campaign | **einloggen**: "Einloggen", "Ausloggen", "zuletzt eingeloggt". |

## Terms

| Concept (code) | `de` | `en` | Note |
| -------------- | ---- | ---- | ---- |
| campaign | Anmeldung, Anmeldungen | registration | Q1 |
| campaign states | In Vorbereitung · Angebote werden gesammelt · Katalog veröffentlicht · Anmeldung läuft · Nachfrist · Anmeldung beendet · Zuteilung wird berechnet · Zuteilung in Prüfung · Einteilung veröffentlicht · Abgeschlossen | in preparation · collecting activities · catalogue published · registration open · late registration · registration closed · allocating · allocation in review · allocation published · closed | Q2; English has one word, allocation |
| item | Aktivität | activity | "Angebot" only in "Angebote werden gesammelt" |
| class activity (D-24) | Klassenaktivität; "für die ganze 5A"; "Ganze Klassen, die fix teilnehmen (sie wählen für diese Zeit nichts)" | class activity; "whole class 5A" | |
| extra places of a class activity | "für die ganze 5A, dazu 6 freie Plätze" | "whole class 5A, plus 6 open places" | |
| places | Plätze | places | |
| minimum | Mindestzahl | minimum | one word for minimum participants everywhere |
| cancellable below minimum | "Fällt aus, wenn zu wenige kommen" | "Cancelled if too few" | |
| fee | Kosten | cost | Q6 |
| session | Termin | session | |
| period | Einheit, "2. EH" | period, "P2" | Q5 |
| period grid | Stundenraster | timetable | |
| session input mode | "Angabe in" (Einheiten / Uhrzeit) | "Given in" (periods / clock time) | |
| credited minutes | angerechnete Minuten | credited minutes | |
| time group (D-05) | Zeitblock; "Wünsche je Zeitblock" | time block | |
| wish, ranking | Wunsch, Wünsche; Wünsche abgeben | choice, choices | |
| choice window | Anmeldezeitraum | registration period | |
| grace week | Nachfrist | late registration | |
| swap window | Tauschzeit | swap period | |
| demand view | Plätze und Bedarf | places and demand | |
| progress during the window | Stand der Anmeldung; "wer sich schon angemeldet hat" | registration status | |
| on-behalf entry | "Für jemanden eintragen" | "Enter for someone" | |
| exemption | Befreiung, befreien | exemption, exempt | |
| allocation run | Berechnung; "Zuteilung berechnen"; "Berechnungen"; "Berechnung als Excel" | calculation; "Calculate allocation" | Q2 |
| seed | Losnummer | draw number | explained once: decides how ties are drawn |
| time limit | Rechenzeit | computing time | the deterministic second is the handbook's business |
| levels L1–L5 | Ziele (in dieser Reihenfolge) | goals (in this order) | each line says what it protects |
| average rank | durchschnittlicher Wunsch | average choice | |
| run status | gültig, vielleicht nicht die beste · keine Einteilung möglich · in der Rechenzeit keine gefunden · Fehler in den Daten | valid, maybe not the best · no allocation possible · none found in time · data error | |
| pass (D-20) | Runde ("1. Runde: Anmeldezeitraum, 2. Runde: Nachfrist") | round | |
| fallback place (D-06) | Restplatz | remaining place | "auf einen Restplatz ohne Kosten" |
| deficit | fehlende Minuten | missing minutes | |
| unplaced students | "Noch nicht für alle Tage eingeteilt" | "Not placed for every day" | |
| the solver | Berechnung (organizers); Rechenmodul (administrators) | calculation service | "Solver" stays in the deploy guide |
| change by hand | von Hand; "Einteilung von Hand ändern" | by hand | |
| change kinds | Tausch · Einteilung durch den Klassenvorstand · Wechsel · Abmeldung | swap · placed by the class teacher · moved · removed | |
| override | "trotzdem"; "Auch wenn die Aktivität voll ist oder dann zu wenige bleiben (wird vermerkt)" | "anyway" | |
| class teacher | Klassenvorstand (KV), Klassenvorstände | class teacher | |
| grade | Schulstufe | year | |
| roster | Klassenlisten | class lists | Q7 |
| import batch | Import, Importe; Übernehmen; Verwerfen | import; apply; discard | |
| Entra ids | Objekt-ID; Gruppen-ID | object ID; group ID | Entra's own words, administrators only |
| roles | Administration · Organisation · Einsicht | administration · organisation · read-only | |
| account, binding | Konto; zugeordnet | account; linked | |
| signing in | einloggen; Einloggen, Ausloggen | sign in; sign out | |
| retention purge | Aufbewahrung; "Schuljahr löschen" | retention; "delete school year" | |
| mail templates | E-Mail-Vorlagen | email templates | |
| mail pace, `MAIL_PER_HOUR` | Versand; "höchstens 200 E-Mails pro Stunde" | sending; "at most 200 emails an hour" | |
| pause sending | Versand anhalten, fortsetzen; angehalten | pause, resume sending; paused | |
| mail priority | persönliche E-Mails · an Lehrkräfte · an Schüler\*innen | personal · to teachers · to students | the order they go out in |
| expired mail | nicht mehr gesendet | no longer sent | a reminder whose window ended first |
| attendance | Anwesenheit; anwesend / abwesend / entschuldigt | attendance; present / absent / excused | |
| archive | Abschließen; Abgeschlossen | close; closed | |
| students, participants | Schüler\*innen, Schüler\*in; Teilnehmer\*innen | students; participants | Q3 |
| teachers | Lehrkraft, Lehrkräfte | teacher, teachers | Q4 |
