# Stundenraster

Das Stundenraster enthält die Einheiten der Schule mit Beginn und Ende. Lehrkräfte geben ihre Termine darin an („ab der 2. Einheit, 4 Einheiten lang“), und SchulWahl rechnet die Uhrzeit aus. Termine zu anderen Zeiten, etwa ein Ausflug, geben sie nach der Uhrzeit an.

![Das Stundenraster: je Einheit Beginn und Ende, darunter die Buttons Einheit anfügen, Letzte entfernen und Speichern](/bilder/de/stundenraster.png)

Ändere Beginn und Ende, füge mit **Einheit anfügen** eine Einheit am Ende an oder entferne mit **Letzte entfernen** die letzte, und klicke **Speichern**. SchulWahl prüft dabei:

- Die Einheiten sind von 1 an ohne Lücke nummeriert.
- Jede Uhrzeit hat die Form HH:MM.
- Jede Einheit endet nach ihrem Beginn.
- Keine Einheit beginnt, bevor die vorige endet.

Termine, die schon eingetragen sind, behalten ihre Uhrzeit, wenn du das Stundenraster später änderst. Was sie an Minuten zählen, ist ihre Zeit im Anwesenheitsrahmen eines Tags, ohne Rahmen die Zeit von der ersten bis zur letzten Einheit ([Einstellungen](/organisation/einstellungen#anwesenheitsrahmen-je-projekttag)): Bei Anmeldungen, die noch nicht geöffnet sind, zählt SchulWahl diese Minuten mit dem neuen Stundenraster neu; eine geöffnete Anmeldung behält, womit ihre Wünsche und ihre Zuteilung rechnen.
