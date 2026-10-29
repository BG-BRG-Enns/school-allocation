-- The publication of an allocation (docs/domain-and-api.md §4, mvp-plan S4c):
-- the three notices it sends, seeded as templates the organizer edits like
-- the window's (0005). The run and its rows already carry publication
-- (allocation_run.published_at, 0006); nothing else changes shape, so the
-- release before this one runs on the schema. No grants here.

insert into mail_template (kind, subject, body) values
  ('result_published', '{{wahl}}: deine Zuteilung',
   E'Hallo {{vorname}},\n\ndie Zuteilung für {{wahl}} steht fest. Das ist dein Programm:\n\n{{zuteilung}}\n\n{{#if tauschfenster}}Wer tauschen möchte: Im Zeitraum {{tauschfenster}} kannst du in eine Aktivität mit freien Plätzen wechseln.\n\n{{/if}}Alle Einzelheiten und die Begründung der Zuteilung siehst du hier:\n\n{{link}}'),
  ('class_unplaced', '{{wahl}}: Schüler/innen der {{klasse}} ohne vollständigen Platz',
   E'Hallo {{vorname}},\n\nbei der Zuteilung für {{wahl}} konnten aus deiner Klasse {{klasse}} nicht alle vollständig untergebracht werden:\n\n{{liste}}\n\nBitte teile diese Schüler/innen einer Aktivität mit freien Plätzen zu. Den Stand der Klasse siehst du hier:\n\n{{link}}'),
  ('item_cancelled', '{{wahl}}: {{aktivitaet}} findet nicht statt',
   E'Hallo {{vorname}},\n\ndeine Aktivität „{{aktivitaet}}“ bei {{wahl}} hat die Mindestteilnehmerzahl von {{minimum}} nicht erreicht ({{anmeldungen}} Wünsche) und wurde bei der Zuteilung abgesagt. Die Schüler/innen wurden auf ihre weiteren Wünsche verteilt.\n\n{{link}}')
on conflict (kind) do nothing;
