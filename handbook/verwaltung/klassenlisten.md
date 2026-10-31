# Klassenlisten

Die Klassenlisten sagen SchulWahl, wer an der Schule ist: alle Schüler\*innen mit Klasse und Schulstufe und alle Lehrkräfte. Nur wer in den Klassenlisten steht, macht bei einer Anmeldung mit. Sie kommen aus den **Entra-Gruppen** der Schule oder aus einer **CSV-Datei**. Beide Wege enden gleich: SchulWahl zeigt dir die eingelesene Liste zur Prüfung, und sie gilt erst, wenn du sie übernimmst.

## Aus den Entra-Gruppen

Führt die Schule ihre Klassen als Gruppen in Microsoft Entra, ist das der einfachere Weg: Die Gruppen nennen jedes Konto schon, und niemand muss beim ersten Einloggen erkannt werden.

### Die Gruppen eintragen

![Der Abschnitt Entra-Gruppen mit der Tabelle der Gruppen, den Knöpfen und dem Einlesen darunter](/bilder/de/entra-gruppen.png)

1. Klicke **Gruppe hinzufügen**.
2. Trage die **Gruppen-ID** ein. Sie steht in Entra bei der Gruppe, als Objekt-ID. Oder suche die Gruppe bei Microsoft (unten).
3. Gib ihr eine **Bezeichnung**, wähle die **Art** (eine Klasse oder die Lehrkräfte) und trage bei einer Klasse **Klasse** und **Schulstufe** ein. Die Gruppe der Lehrkräfte hat beides nicht.
4. Klicke **Gruppen speichern**.

Untergruppen liest SchulWahl mit. Trage eine Klasse deshalb nur einmal ein: entweder ihre Gruppe oder ihre Untergruppen (3A, oder 3AR und 3AG), sonst steht jede Person doppelt in der Liste.

### Gruppen bei Microsoft suchen

![Die Suche nach Gruppen: ein Feld für den Anfang des Namens, die gefundenen Klassengruppen mit Klasse und Schulstufe und je ein Knopf zum Übernehmen](/bilder/de/gruppen-suchen.png)

**Gruppen bei Microsoft suchen** führt dich einmal zu Microsoft, wo du dich einloggst. Danach suchst du die Gruppen nach dem Anfang ihres Namens. **Alle Klassengruppen suchen** findet jede Gruppe, deren Name eine Klasse ist (5A, 1B und so weiter), und belegt Klasse und Schulstufe aus dem Namen vor: 5A wird zur 9. Schulstufe. Prüfe die Vorbelegung, übernimm die Gruppen einzeln oder alle auf einmal und speichere.

### Einlesen

Unter **Aus den Entra-Gruppen einlesen** trägst du das **Schuljahr** ein (2026/27) und klickst **Jetzt einlesen**. Microsoft fragt dich, ob SchulWahl mit deinem Konto die Mitglieder der Gruppen lesen darf; welche Berechtigungen das sind, steht auf der Seite. Danach zeigt SchulWahl den Import zur Prüfung.

Sagt die Seite, dass Microsoft das Lesen der Gruppen verweigert, fehlen die Berechtigungen oder die Zustimmung der IT in Entra. Das richtet der Betrieb ein, wie die Betriebsanleitung beschreibt.

## Aus einer CSV-Datei

![Der Abschnitt CSV-Datei hochladen mit dem Link zur Vorlage, dem Feld für die Datei, dem eingefügten Inhalt und dem Schuljahr](/bilder/de/csv-hochladen.png)

Eine Zeile je Person, mit den Spalten der **Vorlage**, die du auf der Seite herunterlädst:

```csv
email;given_name;family_name;class;grade;kind;class_teacher_email
sara.pfnaexthuber@schule.example.org;Sara;Pfnäxthuber;5A;9;student;anna.zwexmhofer@schule.example.org
anna.zwexmhofer@schule.example.org;Anna;Zwexmhofer;;;teacher;
```

- `kind` ist `student` oder `teacher`. Lehrkräfte haben weder Klasse noch Schulstufe.
- `class_teacher_email` ist freiwillig und nennt den [Klassenvorstand](./klassenvorstaende) der Klasse.
- Trennzeichen ist ein Semikolon oder ein Komma.

Lade die Datei hoch oder füge ihren Inhalt ein, trag das **Schuljahr** ein und klicke **Einlesen**. Beim ersten Einloggen erkennt SchulWahl jede Person an ihrer Schul-E-Mail-Adresse, genau wie sie in der Liste steht. Wer sich mit einem Konto einloggt, das eine andere Adresse hat, bleibt ohne Zuordnung; du ordnest das Konto dann unter [Konten und Rollen](./konten-und-rollen) zu.

## Einen Import prüfen und übernehmen

![Ein Import aus den Entra-Gruppen: die Änderungen gegenüber den aktuellen Klassenlisten, mit neuen und entfernten Personen, und die Knöpfe Übernehmen und Verwerfen](/bilder/de/import-pruefen.png)

Der Import zeigt, was sich gegenüber den aktuellen Klassenlisten ändert: wer **neu** ist, wer **entfernt** wird und bei wem sich Klasse, Schulstufe, Name oder Adresse **geändert** hat.

- **Probleme**, etwa Schüler\*innen ohne Klasse oder dieselbe Person zweimal, lehnen die ganze Liste ab, mit der Zeile, in der sie stehen. Behebe sie in der Quelle und lies noch einmal ein.
- **Hinweise** halten den Import nicht auf. Eine Person ohne E-Mail-Adresse bekommt zum Beispiel keine E-Mails.
- **Übernehmen** macht die Liste zu den aktuellen Klassenlisten, sofort. **Verwerfen** lässt alles, wie es war.

Wurde seit dem Einlesen ein anderer Import übernommen, lässt sich dieser nicht mehr übernehmen. Lies die Klassenlisten dann noch einmal ein.

## Die Importe

![Die Tabelle der Importe mit Zeitpunkt, Quelle, Schuljahr, Personen, Änderungen und Stand](/bilder/de/importe.png)

Jeder Import bleibt mit seinem Stand in der Liste: zur Prüfung, übernommen, verworfen oder abgelehnt. **Ansehen** öffnet ihn.

## Was eine neue Liste ändert

- Wer neu in der Liste steht, macht ab jetzt mit, auch bei einer Anmeldung, die schon läuft.
- Wer in der neuen Liste fehlt, behält sein Konto. Unter Konten und Rollen steht dann „Nicht in den aktuellen Klassenlisten“, und die Person macht bei nichts mit, bis eine Liste sie wieder enthält. Ihre Wünsche und ihre Einteilung bleiben.
- Mit dem Ende einer Anmeldung hält SchulWahl für sie die Klassenlisten fest, die gerade gelten. Eine spätere Liste ändert an der Zuteilung dieser Anmeldung nichts mehr.
