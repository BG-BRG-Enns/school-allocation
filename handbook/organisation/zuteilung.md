# Zuteilung

Ist die Anmeldung beendet, berechnet SchulWahl die Zuteilung: eine Einteilung, die alle Bedingungen einhält. Keine Aktivität bekommt mehr Schüler\*innen als Plätze (eine Klassenaktivität ihre ganzen Klassen und dazu höchstens ihre zusätzlichen Plätze), keine zwei Aktivitäten einer Person überschneiden sich, jede Aktivität bekommt nur, wer zu ihrer Schulstufe oder Klasse passt, und eine Klassenaktivität behält ihre ganzen Klassen. In eine Aktivität mit Kosten teilt die Berechnung nur ein, wer sie sich gewünscht hat, außer den ganzen Klassen einer Klassenaktivität, und nie als Restplatz.

Innerhalb dieser Bedingungen verfolgt die Berechnung ihre Ziele, in dieser Reihenfolge:

1. Möglichst niemand bleibt ohne volle Woche, also ohne die Mindestminuten an jedem Projekttag.
2. Es fehlen insgesamt so wenige Minuten wie möglich.
3. Hat die Anmeldung [Regeln](./kategorien-und-regeln): Möglichst wenigen Schüler\*innen fehlt eine Regel, und insgesamt fehlen so wenige Aktivitäten und Minuten für Regeln wie möglich.
4. So wenige Schüler\*innen wie möglich bekommen im Schnitt späte Wünsche.
5. Das Ganze geht so gut wie möglich aus: möglichst frühe Wünsche für alle.
6. Wo zwei Einteilungen gleich gut sind, entscheidet das Los.

Reichen die Wünsche einer Person nicht, für die Minuten oder eine Regel, bekommt sie einen **Restplatz**: einen freien Platz in einer Aktivität ohne Kosten. Eine Aktivität mit „Fällt aus, wenn zu wenige kommen“ kann ausfallen, wenn sich zu wenige für ihre Mindestzahl finden. Wünsche aus der Nachfrist kommen in einer zweiten **Runde** dran, nach allen anderen.

Vor der ersten Berechnung brauchen alle Schulstufen der Anmeldung ihre Mindestminuten je Tag ([Einstellungen](./einstellungen)).

## Berechnen

![Neue Berechnung mit Losnummer und Rechenzeit, darunter die Berechnungen mit Stand, Losnummer, Rechenzeit und fehlenden Minuten](/bilder/de/zuteilung-berechnen.png)

**Zuteilung** auf der Seite der Anmeldung öffnet die Seite der Berechnungen.

- **Losnummer**: Sie entscheidet, wie Gleichstände ausgehen. Leer zieht SchulWahl eine.
- **Rechenzeit je Ziel**, 1 bis 60: Mehr Rechenzeit findet eher die beste Einteilung, dauert aber länger.

**Zuteilung berechnen** startet die Berechnung; nach einigen Sekunden steht sie in der Liste **Berechnungen**. Dieselbe Losnummer mit derselben Rechenzeit ergibt dieselbe Einteilung, solange sich an der Anmeldung nichts geändert hat; **Wiederholen** rechnet eine Berechnung so noch einmal. Du kannst beliebig viele Berechnungen machen, etwa mit anderen Losnummern, und sie vergleichen.

Sagt die Seite, dass die Berechnung auf diesem Server nicht eingerichtet ist oder das Rechenmodul nicht antwortet, ist das Sache des Betriebs.

## Eine Berechnung prüfen

![Die Prüfung einer Berechnung: oben Veröffentlichen, darunter Losnummer und Rechenzeit, die Zahlen der Berechnung und die Ziele mit ihren Werten je Runde](/bilder/de/zuteilung-pruefen.png)

Eine fertige Berechnung zeigt zuerst ihre Zahlen: wie viele Schüler\*innen an allen Tagen eingeteilt sind, wie vielen Minuten fehlen, wie viele einen Restplatz haben, wie vielen eine Regel fehlt, wie viele Aktivitäten ausfallen. Darunter die **Ziele** mit ihrem Wert je Runde. „✓ bestmöglich“ heißt, dass es keine bessere Einteilung gibt; „≈ vielleicht nicht bestmöglich“, dass die Rechenzeit nicht gereicht hat, das zu beweisen. Mehr Rechenzeit hilft dann oft.

Weiter unten:

- **Wünsche**: wie oft der 1., 2., 3. Wunsch, ein Restplatz oder eine Klassenaktivität vergeben wurde;
- **Fehlende Minuten**: wem an welchem Tag wie viel fehlt;
- **Restplätze**: wer wo einen Restplatz hat;
- **Regeln**: je Regel, wie viele sie erfüllen, und unter **Fehlende Regeln**, wem welche fehlt und wie viel;
- **Aktivitäten**: je Aktivität die Eingeteilten, die ganzen Klassen und die Mindestzahl, und welche ausfällt oder leer bleibt;
- **Klassen**: je Klasse, wie vielen Minuten fehlen, wie viele einen Restplatz haben und wie vielen eine Regel fehlt;
- **Schüler\*innen**: jede Person mit ihren Aktivitäten, ihrem Wunsch im Schnitt und den Regeln, die ihr fehlen.

**Berechnung als Excel** liefert das alles als Tabelle ([Excel-Dateien](./excel)).

Steht über der Berechnung ein **Hinweis vor der Berechnung**, kommen für eine Aktivität weniger Schüler\*innen in Frage, als ihre Mindestzahl verlangt, und sie darf nicht ausfallen. Findet die Berechnung dann keine Einteilung, liegt es meist daran: Erlaube den Ausfall, senke die Mindestzahl oder ziehe die Aktivität zurück. Ein **Hinweis zu den Regeln** sagt, dass für eine Regel die Plätze der Kategorie nicht für alle Schüler\*innen einer Schulstufe reichen; die Berechnung erfüllt sie dann, so weit es geht. Hat sich seit einer Berechnung der Katalog, die Kategorien einer Aktivität, die Klassenlisten oder eine Klassenaktivität geändert, sagt die Seite das; berechne dann neu, bevor du veröffentlichst.

## Zwei Berechnungen vergleichen

![Der Vergleich zweier Berechnungen: die andere Berechnung zur Auswahl, darunter die Zahl der Schüler\*innen, die anders eingeteilt sind](/bilder/de/zuteilung-vergleich.png)

Unter **Vergleich** wählst du **Mit Berechnung** eine andere. Die Seite zeigt dann, wie viele Schüler\*innen anders eingeteilt sind, und bei jeder Person ihre Aktivitäten in beiden Berechnungen. Die Ziele bekommen eine Spalte mit dem Unterschied.

## Veröffentlichen

![Veröffentlichen: die Aktivitäten, die ausfallen, das Häkchen zur Bestätigung und der Knopf Jetzt veröffentlichen](/bilder/de/veroeffentlichen.png)

Der Knopf **Berechnung … veröffentlichen …** über einer Berechnung, mit ihrer Nummer, öffnet die Bestätigung. Fallen Aktivitäten aus, stehen sie dort, und du bestätigst sie mit dem Häkchen. **Jetzt veröffentlichen** macht die Berechnung zur Einteilung der Anmeldung:

- Die Schüler\*innen bekommen ihr Programm per E-Mail und sehen es in SchulWahl.
- Die Klassenvorstände bekommen die Liste derer, die noch nicht für alle Tage eingeteilt sind.
- Die Lehrkräfte einer ausgefallenen Aktivität bekommen Bescheid.

Danach wird nicht mehr neu berechnet. Was sich noch ändert, beschreibt [Nach der Veröffentlichung](./nach-der-veroeffentlichung).

![Der Abschnitt Veröffentlicht: welche Berechnung die Einteilung ist, seit wann, und die Einteilung und die Anwesenheit als Excel](/bilder/de/veroeffentlicht.png)
