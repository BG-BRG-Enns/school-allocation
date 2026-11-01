# Klassenvorstände

Der Klassenvorstand begleitet die Klasse durch eine Anmeldung:

- sieht während der Anmeldung, wer sich schon angemeldet hat;
- teilt nach der Veröffentlichung ein, wem an einem Tag noch Zeit fehlt;
- trägt die Anwesenheit ein;
- bekommt die E-Mails mit den fehlenden Wünschen und mit den noch nicht ganz Eingeteilten der Klasse.

Wie das geht, beschreibt das Handbuch [Lehrkräfte](/lehrkraefte/klassenvorstand).

![Die Klassen mit ihren Klassenvorständen und das Formular, mit dem eine Lehrkraft als Klassenvorstand der 5A hinzukommt](/bilder/de/klassenvorstand-zuordnen.png)

## Zuordnen

1. Klicke in der Zeile der Klasse **Zuordnen**.
2. Suche die Lehrkraft unter **Lehrkraft hinzufügen**, nach dem Namen oder dem Kürzel, und füge sie hinzu. Eine Klasse kann mehrere Klassenvorstände haben.
3. Klicke **Speichern**.

Die Organisation ordnet Klassenvorstände ebenso zu; sie erreicht die Seite von einer Anmeldung aus.

## Aus der Klassenliste

Nennt die CSV-Datei der Klassenlisten in der Spalte `class_teacher_email` einen Klassenvorstand, gilt diese Zuordnung auch hier. Die Tabelle schreibt dann „(laut Klassenliste)“ dazu. Ein Klassenvorstand, den du hier zuordnest, kommt zu dem aus der Klassenliste hinzu.

## Aus einer CSV-Datei

![Der Abschnitt Aus einer CSV-Datei: die eingefügte Liste, darunter die Prüfung mit den Kürzeln je Lehrkraft und dem Knopf Übernehmen](/bilder/de/klassenvorstaende-csv.png)

Die Kürzel der Lehrkräfte und die Klassenvorstände kommen auch aus einer Datei, eine Zeile je Lehrkraft:

- `email`: die E-Mail-Adresse der Lehrkraft, wie sie in den Klassenlisten steht;
- `short_name`: das Kürzel, bis zu 8 Zeichen; danach findet die Suche nach Lehrkräften eine Lehrkraft auch über ihr Kürzel, und die Tabellen zeigen es;
- `class`: die Klasse, deren Klassenvorstand sie ist; für zwei Klassen zwei Zeilen.

Nur `email` muss die Datei haben. Eine Liste aus dem Schulverwaltungsprogramm mit den Spalten „Address Email“, „Name“ (das Kürzel) und „Kv Von“ wird genauso gelesen; andere Spalten lässt der Import aus und sagt es. Die **Vorlage mit dem Stand von heute** enthält alle Lehrkräfte der Klassenlisten mit ihren Kürzeln und Klassen, zum Ergänzen in Excel.

Wähle die Datei oder füge den Inhalt ein und klicke **Prüfen**. Die Prüfung zeigt je Lehrkraft das neue Kürzel und je Klasse die Klassenvorstände bisher und neu; Zeilen mit einem Problem (eine Adresse, die in den Klassenlisten fehlt, eine unbekannte Klasse, ein Kürzel, das eine andere Lehrkraft hat) stehen darüber. Erst **Übernehmen** schreibt: Für jede Klasse, die in der Datei steht, gelten danach genau ihre Klassenvorstände aus der Datei; Klassen, die nicht in der Datei stehen, bleiben, wie sie sind, und ein Klassenvorstand laut Klassenliste bleibt daneben.
