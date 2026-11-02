# Anlegen und Katalog

## Eine Anmeldung anlegen

![Das Formular Neue Anmeldung mit Bezeichnung, Schuljahr und zwei Projekttagen](/bilder/de/anmeldung-anlegen.png)

Unter **Anmeldungen** trägst du bei **Neue Anmeldung** die **Bezeichnung** (Projektwoche 2027), das **Schuljahr** (2026/27) und die **Projekttage** ein; neben jedem Datum steht sein Wochentag, damit ein falscher Monat auffällt, und **Tag hinzufügen** schlägt den Tag nach dem letzten vor. **Anmeldung anlegen** legt sie im Stand „In Vorbereitung“ an. Noch sieht sie außer der Organisation niemand, und du kannst in Ruhe die [Einstellungen](./einstellungen) eintragen. Eine Anmeldung, die in Vorbereitung bleibt (das falsche Schuljahr, ein Versuch), löschst du mit **Anmeldung löschen**: Sie geht mit ihren Regeln und den Entwürfen ihrer Aktivitäten; das Protokoll der Schule hält fest, dass es sie gab.

## Angebote sammeln

**Angebote sammeln** öffnet die Anmeldung für die Lehrkräfte: Sie sehen sie und reichen mit **Neue Aktivität** ihre Aktivitäten ein. Wie jeder Schritt wird er noch einmal bestätigt; **Zurück zur Vorbereitung** nimmt ihn zurück, solange der Katalog nicht veröffentlicht ist, die Entwürfe der Lehrkräfte bleiben. Wie das Formular funktioniert, beschreibt das Handbuch [Lehrkräfte](/lehrkraefte/aktivitaet). Du kannst selbst Aktivitäten anlegen, auch für eine Lehrkraft, die du im Formular einträgst.

Die **Leitung** einer Aktivität hat, wer sie angelegt hat, solange sie oder er unter ihren Lehrkräften ist; sonst die zuerst genannte Lehrkraft. Bist du selbst Lehrkraft, stehst du in einer neuen Aktivität schon darin: Legst du sie für jemand anderen an, nimm dich heraus, dann leitet die zuerst genannte Lehrkraft.

## Aktivitäten prüfen

![Eine eingereichte Aktivität in der Liste der Anmeldung: Titel und Kosten, Lehrkraft, Termin, Plätze, Stand und die Knöpfe Bearbeiten, Genehmigen, Zurückgeben und Zurückziehen](/bilder/de/aktivitaeten-pruefen.png)

Die Tabelle zeigt jede Aktivität mit Lehrkräften, Terminen, Plätzen, Kosten und Stand; der Abschnitt Organisation zählt Entwürfe, eingereichte, genehmigte und zurückgezogene. Für eine eingereichte Aktivität hast du drei Knöpfe:

- **Genehmigen** nimmt sie in den Katalog.
- **Zurückgeben** schickt sie mit einer **Rückmeldung an die Lehrkräfte** zurück. Sie ist dann wieder ein Entwurf, und die Lehrkräfte sehen deine Rückmeldung.
- **Zurückziehen** nimmt sie mit einer Begründung heraus.

**Bearbeiten** öffnet jede Aktivität. Was du an der Aktivität einer Lehrkraft änderst, wird protokolliert.

## Plätze und Bedarf

![Plätze und Bedarf: je Projekttag und Schulstufe, wie viele Schüler\*innen noch einen Platz suchen, das Ziel und wie viele die Aktivitäten anbieten](/bilder/de/bedarf.png)

Je Projekttag und Schulstufe steht hier, wie viele Schüler\*innen noch einen Platz suchen, das **Ziel** und wie viele Plätze die eingereichten und genehmigten Aktivitäten ihnen anbieten. Wer schon mit der ganzen Klasse in einer Klassenaktivität ist, zählt nicht mit. Das Ziel liegt um die **Plätze über dem Bedarf** darüber, 20 %, wenn du in den [Einstellungen](./einstellungen) nichts anderes einträgst: So haben die Wünsche Platz. Eine Schulstufe unter dem Ziel ist markiert; dort fehlen noch Aktivitäten. Die Lehrkräfte sehen diese Tabelle auch, solange Angebote gesammelt werden.

## Lehrkräfte je Tag

**Lehrkräfte je Tag** im Abschnitt Organisation zeigt für jede Lehrkraft und jeden Projekttag, ob sie verfügbar ist, was sie leitet und was sie begleitet, oder dass sie frei ist. Ein Tag, an dem jemand nicht oder nur wenn nötig verfügbar ist, ist markiert. Darüber steht, wer an keinem Tag etwas leitet. Es zählen die Aktivitäten, die noch stattfinden können: genehmigte, außer die Einteilung sagt sie ab; eingereichte, bis die Anmeldung öffnet; Entwürfe, solange Angebote gesammelt werden.

![Lehrkräfte je Tag: je Lehrkraft und Projekttag die Verfügbarkeit und was sie leitet oder begleitet](/bilder/de/lehrkraefte-je-tag.png)

Ihre Verfügbarkeit tragen die Lehrkräfte selbst ein, solange Angebote gesammelt werden ([Verfügbarkeit](/lehrkraefte/verfuegbarkeit)). Hier änderst du sie für jede Lehrkraft, bis die Anmeldung abgeschlossen ist; jede Änderung wird festgehalten. **Lehrkräfte je Tag als Excel** liefert die Übersicht als Tabelle ([Excel-Dateien](./excel)).

![Verfügbarkeit aus einer CSV-Datei: die eingefügte Liste, darunter die Prüfung mit den Tagen je Lehrkraft, bisher und neu, und dem Knopf Übernehmen](/bilder/de/verfuegbarkeit-import.png)

Hat die Schule die Verfügbarkeit schon in einer Liste, lädst du sie unter **Verfügbarkeit aus einer CSV-Datei** hoch: eine Zeile je Lehrkraft, benannt mit der E-Mail-Adresse oder dem Kürzel ([Klassenvorstände](/verwaltung/klassenvorstaende)), und eine Spalte je Projekttag, mit dem Datum oder dem Wochentag als Namen (`MO`, `DI`, `MI`). Leer heißt verfügbar, `N` nicht verfügbar, `F` nur wenn nötig. Die Liste der Schule mit den Spalten `Name`, `MO`, `DI`, `MI`, `Leitung` und `Anmerkung` wird so gelesen, wie die Tabelle sie exportiert; eine leere Spalte am Ende, wie sie nach dem Löschen einer Spalte bleibt, stört nicht. Eine Spalte `Anmerkung` wird zur Notiz, die neben dem Namen steht; eine Spalte `Leitung` wird übergangen; jede andere Spalte lehnt der Import ab, damit kein Tag unbemerkt verloren geht; ein Wochentag, auf den keiner der Projekttage fällt, nennt die Tage der Anmeldung. Die **Vorlage mit dem Stand von heute** enthält alle Lehrkräfte mit Adresse, Kürzel, Tagen und Notiz. **Prüfen** zeigt je Lehrkraft und Tag bisher und neu und listet die Zeilen, die ein Problem haben: ohne Kürzel oder Adresse, mit einem Kürzel, das in den Stammdaten fehlt, mit einer Lehrkraft, die nicht zur Anmeldung gehört. Diese Zeilen werden übersprungen, die anderen übernommen. Erst **Übernehmen** schreibt, für alle in der Datei auf einmal und als ein Eintrag im Protokoll. Lehrkräfte und Tage, die nicht in der Datei stehen, bleiben, wie sie sind.

Fehlt einer Lehrkraft das Kürzel, oder stimmt es nicht mit der Liste überein, setzt du es hier neben dem Namen: **Bearbeiten**, das Kürzel eintragen, **Kürzel speichern**. Ein Kürzel, das schon eine andere Lehrkraft hat, wird abgelehnt.

## Den Katalog veröffentlichen

**Katalog veröffentlichen** schließt die Einreichung. Die genehmigten Aktivitäten bekommen ihre Nummern und bilden den Katalog, den ab jetzt alle sehen, auch die Schüler\*innen. Bezeichnung, Schuljahr und Projekttage stehen ab jetzt fest. Vor dem Schritt steht, was er bewirkt, und ob etwas fehlt: keine genehmigte Aktivität, ein Beginn in der Vergangenheit, zu dem die Anmeldung gleich von selbst öffnen würde. **Zurück zum Sammeln** nimmt die Veröffentlichung zurück; vergebene Nummern bleiben, eine neue Veröffentlichung nummeriert nur die weiteren.

![Der Katalog: der Name der Anmeldung, die Projekttage und je Aktivität Nummer, Titel, Termin, Plätze, für wen und Kosten](/bilder/de/katalog.png)

**Katalog ansehen** zeigt ihn, wie die Schüler\*innen ihn lesen; **Drucken** druckt ihn. **Katalog als Excel** liefert ihn als Tabelle ([Excel-Dateien](./excel)). Ob der Katalog die Lehrkräfte nennt, stellst du in den [Einstellungen](./einstellungen) ein.
