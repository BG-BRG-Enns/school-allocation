# E-Mail-Vorlagen

SchulWahl schickt an festen Stellen einer Anmeldung E-Mails. Ihre Texte kommen aus den Vorlagen, die die Administration und die Organisation ändern: unter **Verwaltung** → **E-Mail-Vorlagen**, oder von der Seite einer Anmeldung aus. Die E-Mails gehen an die Adressen aus den Klassenlisten; wer dort keine hat, bekommt keine.

| Vorlage | Wann | An wen |
| ------- | ---- | ------ |
| Einladung zur Anmeldung | beim Öffnen der Anmeldung | alle Schüler\*innen, die mitmachen |
| Erinnerung vor dem Ende der Anmeldung | einen Tag vor dem Ende des Anmeldezeitraums | wer noch keine vollständigen Wünsche hat |
| Einladung zur Nachfrist | am Ende des Anmeldezeitraums, wenn eine Nachfrist folgt | wer noch keine vollständigen Wünsche hat |
| Erinnerung vor dem Ende der Nachfrist | einen Tag vor dem Ende der Nachfrist | wer noch keine vollständigen Wünsche hat |
| Frist versäumt | am Ende der Anmeldung | wer keine vollständigen Wünsche abgegeben hat |
| Fehlende Wünsche, an den Klassenvorstand | am Ende des Anmeldezeitraums und am Ende der Anmeldung | die Klassenvorstände, mit der Liste ihrer Klasse |
| Einteilung veröffentlicht | bei der Veröffentlichung | alle Schüler\*innen, mit ihrem Programm |
| Noch nicht ganz eingeteilt, an den Klassenvorstand | bei der Veröffentlichung | die Klassenvorstände, mit der Liste ihrer Klasse |
| Aktivität fällt aus, an die Lehrkräfte | bei der Veröffentlichung | die Lehrkräfte einer ausgefallenen Aktivität |
| Tausch bestätigt | nach einem Tausch | wer getauscht hat |
| Einteilung geändert | nach einer Einteilung durch den Klassenvorstand oder einer Änderung von Hand | die Person, deren Einteilung sich geändert hat |

## Der Versand

SchulWahl schickt die E-Mails eine nach der anderen, höchstens 200 pro Stunde; der Betrieb kann den Server langsamer einstellen. Die Einladung an 600 Schüler\*innen braucht so etwa drei Stunden. Zuerst gehen die persönlichen E-Mails hinaus (eine Tauschbestätigung, eine geänderte Einteilung, die Test-E-Mail), dann die an Lehrkräfte und Klassenvorstände, zuletzt die an die Schüler\*innen: Wer einen Fehler melden kann, sieht ihn als Erster. Unter **Versand** steht, wie viele E-Mails warten und wann die letzte voraussichtlich verschickt ist.

Steckt ein Fehler in den E-Mails, halte den Versand mit **Versand anhalten** an; **Versand fortsetzen** schickt weiter, wo er stand. Eine E-Mail bekommt ihren Text, wenn sie zu warten beginnt: Eine geänderte Vorlage gilt erst für die E-Mails danach, und was schon wartet, geht so hinaus, wie es ist.

Eine Erinnerung, die beim Ende ihres Anmeldezeitraums oder ihrer Nachfrist noch wartet, wird nicht mehr gesendet; in der Liste der Anmeldung steht sie als „nicht mehr gesendet“.

## Eine Vorlage bearbeiten

![Eine Vorlage beim Bearbeiten: Betreff und Text mit Platzhaltern, daneben die Platzhalter der Vorlage zum Anklicken](/bilder/de/e-mail-vorlage.png)

**Bearbeiten** öffnet Betreff und Text. Platzhalter in doppelten geschweiften Klammern, etwa <code v-pre>{{first_name}}</code>, füllt SchulWahl beim Versand; neben dem Formular steht, wofür jeder steht. Ein Klick auf einen Platzhalter fügt ihn dort ein, wo der Cursor zuletzt stand, im Betreff oder im Text. Jede Vorlage kennt nur ihre eigenen Platzhalter; einen anderen weist SchulWahl beim Speichern zurück.

Nach dem **Speichern** steht bei der Vorlage „Eigener Text der Schule“. **Zurücksetzen** löscht ihn wieder, und es gilt der vorgegebene Text.

## Test-E-Mail

**Test-E-Mail an mich** schickt die Vorlage an deine Adresse, mit Beispielwerten in jedem Platzhalter. Steht oben, dass der E-Mail-Versand auf diesem Server nicht eingerichtet ist, warten alle E-Mails, bis er es ist; einrichten kann ihn der Betrieb.

## Die Sprache der Vorlagen

Die vorgegebenen Texte sprechen die Sprache der Schule. Ein Text, den die Schule gespeichert hat, bleibt in der Sprache, in der er geschrieben wurde. Stellt die Administration die Sprache der Schule um, weist die Seite auf jeden solchen Text hin: Übersetze ihn oder setze ihn zurück.
