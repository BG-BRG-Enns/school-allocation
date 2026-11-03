# Emails

Under **Administration** → **Emails** the administration and the organisation see every email SchulWahl has sent or will send: to whom, from which registration, in which state. The page shows neither subject nor text; those come from the [email templates](./e-mail-vorlagen).

## Sending

SchulWahl sends the emails one after the other, at most 200 an hour; the operator can set the server to a slower pace. The invitation to 600 students thus takes about three hours. Personal emails go first (a swap confirmation, a changed allocation, the test email), then those to teachers and class teachers, and those to students last: whoever can report a mistake sees it first. Under **Sending** you see how many emails are waiting and when the last one should be sent.

![Sending: the pace, how many emails are waiting and when the last one should be sent, and the Pause sending button](/bilder/en/e-mail-versand.png)

If the emails contain a mistake, stop with **Pause sending**; **Resume sending** carries on where it stopped. If sending email is not configured on the server, the page says so: everything waits until the operator sets it up, and goes out afterwards.

A reminder still waiting when its registration period or late registration ends is no longer sent; the list shows it as “no longer sent”.

## All emails

The list shows the newest 200 emails, filtered by state, kind and registration; above it stands how many there are in all. A registration with emails still waiting links here from its page.

![All emails: the filters by state, kind and registration, the list with kind, registration, recipient, state and the server's reply, and the discard buttons](/bilder/en/e-mails.png)

**Discard** takes waiting emails out of sending: the selected ones, or with **Discard all waiting of …** all of a registration, those beyond the list's 200 included. A registration opened by mistake, or a template with a mistake, are the cases for it. A discarded email stays in the list as “discarded”, and the registration's log records who discarded how many. An email being sent right now cannot be held back any more; if its sending fails, it is not tried again.

**Send again** puts a failed or discarded email back in line, as a new copy with the same text: the old one stays as it was. A failed email shows in the Reply column what the server said; “interrupted” means the server was restarted while it was on its way.
