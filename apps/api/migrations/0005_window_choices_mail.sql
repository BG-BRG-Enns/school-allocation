-- The choice window (docs/domain-and-api.md §2–4, D-05, D-06, D-16, D-18):
-- the campaign's grace state and reminder setting; the pre-assignments
-- materialized when the window opens; the students' rankings with every
-- revision kept; the mail templates the organizer edits; the outbox the
-- sender works through. Compatible with the release before it: every
-- column has a default or allows null, nothing existing changes shape.
-- No grants here: the migrator applies apps/api/lib/runtime-privileges.ts.

-- The grace week is a state of its own (school-core's lifecycle). The
-- check was created unnamed with the column; it is found by what it says.
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'campaign'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%state = ANY%';
  if c is not null then execute format('alter table campaign drop constraint %I', c); end if;
end $$;
alter table campaign add constraint campaign_state_check
  check (state in ('draft', 'catalogue', 'published', 'open', 'grace', 'closed', 'allocating', 'review', 'results', 'archived'));
-- How many days before a close the reminder goes out; 0 means none.
alter table campaign add column reminder_days smallint not null default 1 check (reminder_days between 0 and 14);

-- A student placed into a class activity when the window opened (D-24),
-- or exempted from it by an organizer with a reason (then they choose for
-- that time). A placement by class is removed again when the class is no
-- longer fixed for the activity; an exemption, an organizer's decision,
-- is never removed or changed.
create table pre_assignment (
  campaign_id uuid not null references campaign (id),
  item_id uuid not null references catalog_item (id),
  person_id uuid not null references person (id),
  source text not null check (source in ('class', 'manual')),
  created_at timestamptz not null default now(),
  exempted_at timestamptz,
  exempted_by uuid references app_user (id),
  exempt_reason text check (exempt_reason is null or char_length(exempt_reason) between 1 and 500),
  primary key (campaign_id, item_id, person_id),
  check ((exempted_at is null) = (exempted_by is null) and (exempted_at is null) = (exempt_reason is null))
);
create index pre_assignment_person on pre_assignment (campaign_id, person_id);

create function pre_assignment_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.source = 'class' and old.exempted_at is null then
    return old;
  end if;
  if tg_op in ('DELETE', 'TRUNCATE') then
    perform refuse('an exempted or manual pre-assignment is never removed');
  end if;
  if new.source <> old.source or new.created_at <> old.created_at then
    perform refuse('a pre-assignment keeps its source');
  end if;
  if old.exempted_at is not null and (new.exempted_at is distinct from old.exempted_at or new.exempted_by is distinct from old.exempted_by or new.exempt_reason is distinct from old.exempt_reason) then
    perform refuse('an exemption stays as it was given');
  end if;
  return new;
end
$$;
create trigger pre_assignment_guard before update or delete on pre_assignment
  for each row execute function pre_assignment_guard();
create trigger pre_assignment_no_truncate before truncate on pre_assignment
  for each statement execute function pre_assignment_guard();

-- A student's ranking as it stands: per time group the item ids in order
-- ({"<group key>": ["<item id>", ...]}), the window it was last saved in
-- (first, or late in the grace week), and who saved it. Replaced as a
-- whole on every save; the revisions keep the history.
create table choice (
  campaign_id uuid not null references campaign (id),
  person_id uuid not null references person (id),
  ranking jsonb not null check (jsonb_typeof(ranking) = 'object'),
  saved_in text not null check (saved_in in ('first', 'late')),
  version integer not null check (version >= 1),
  updated_at timestamptz not null default now(),
  entered_by uuid not null references app_user (id),
  primary key (campaign_id, person_id)
);

create table choice_revision (
  seq bigint generated always as identity primary key,
  campaign_id uuid not null references campaign (id),
  person_id uuid not null references person (id),
  version integer not null check (version >= 1),
  ranking jsonb not null check (jsonb_typeof(ranking) = 'object'),
  saved_in text not null check (saved_in in ('first', 'late')),
  saved_at timestamptz not null default now(),
  entered_by uuid not null references app_user (id),
  -- Set when an organizer entered the list on the student's behalf.
  reason text check (reason is null or char_length(reason) between 1 and 500),
  unique (campaign_id, person_id, version)
);

create function choice_revision_guard() returns trigger language plpgsql as $$
begin
  perform refuse('a choice revision is never changed or removed');
  return null;
end
$$;
create trigger choice_revision_guard before update or delete on choice_revision
  for each row execute function choice_revision_guard();
create trigger choice_revision_no_truncate before truncate on choice_revision
  for each statement execute function choice_revision_guard();

-- The texts of the mails the window sends, by kind, with placeholders in
-- double braces; seeded with the product's German defaults, edited by the
-- organizer in the app (lib/mail/templates.ts lists each kind's placeholders).
create table mail_template (
  kind text primary key check (kind ~ '^[a-z_]{1,40}$'),
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 8000),
  updated_at timestamptz not null default now(),
  updated_by uuid references app_user (id)
);

insert into mail_template (kind, subject, body) values
  ('choice_invitation', 'Projektwoche {{wahl}}: Wünsche bis {{frist}} abgeben',
   E'Hallo {{vorname}},\n\ndie Wahl für {{wahl}} ({{projekttage}}) ist offen. Bitte gib deine Wünsche bis {{frist}} ab (mit dem Schulkonto anmelden):\n\n{{link}}\n\nWann du innerhalb der Frist wählst, spielt für die Zuteilung keine Rolle; bis {{frist}} kannst du deine Wünsche noch ändern. Bist du mit deiner Klasse fix bei einer Aktivität, wählst du nur für die übrige Zeit.\n\nViel Spaß beim Aussuchen!'),
  ('choice_reminder', 'Erinnerung: Wünsche für {{wahl}} bis {{frist}}',
   E'Hallo {{vorname}},\n\ndeine Wünsche für {{wahl}} sind noch nicht vollständig. Bitte gib sie bis {{frist}} ab:\n\n{{link}}\n\nFalls du es gerade erst erledigt hast, betrachte diese Nachricht als gegenstandslos.'),
  ('grace_invitation', 'Nachfrist: Wünsche für {{wahl}} bis {{frist}}',
   E'Hallo {{vorname}},\n\ndie Wahl für {{wahl}} ist zu Ende, deine Wünsche fehlen noch oder sind unvollständig. Bis {{frist}} kannst du sie nachholen:\n\n{{link}}\n\nWünsche aus der Nachfrist werden nach den anderen zugeteilt. Wer bis dahin nichts abgibt, bekommt einen Platz in einer Aktivität ohne Beitrag mit freien Plätzen.'),
  ('grace_reminder', 'Letzte Erinnerung: Wünsche für {{wahl}} bis {{frist}}',
   E'Hallo {{vorname}},\n\nmorgen endet die Nachfrist für {{wahl}}. Deine Wünsche fehlen noch:\n\n{{link}}'),
  ('missed_deadline', '{{wahl}}: Wünsche nicht abgegeben',
   E'Hallo {{vorname}},\n\ndie Frist für {{wahl}} ist abgelaufen, ohne dass vollständige Wünsche von dir vorliegen. Du bekommst einen Platz in einer Aktivität ohne Beitrag mit freien Plätzen, oder dein Klassenvorstand teilt dich zu. Dein Ergebnis siehst du nach der Veröffentlichung hier:\n\n{{link}}'),
  ('class_missing', '{{wahl}}: fehlende Wünsche der {{klasse}} ({{fenster}})',
   E'Hallo {{vorname}},\n\naus deiner Klasse {{klasse}} fehlen bei {{wahl}} ({{fenster}}) noch folgende Wünsche:\n\n{{liste}}\n\nBitte erinnere diese Schüler/innen daran. Den Stand der Klasse siehst du hier:\n\n{{link}}');

create function mail_template_guard() returns trigger language plpgsql as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    perform refuse('a mail template is edited, not removed');
  end if;
  return new;
end
$$;
create trigger mail_template_guard before update or delete on mail_template
  for each row execute function mail_template_guard();
create trigger mail_template_no_truncate before truncate on mail_template
  for each statement execute function mail_template_guard();

-- A notice to send: written in the same transaction as what triggered it,
-- once per dedupe key, and worked through by the sender (lib/mail/sender.ts):
-- queued → sending → sent, or failed after the attempts a transient error
-- gets, at once on a permanent one. Rows stay as the record of what was
-- sent; the retention purge (D-15) removes them with their campaign.
create table outbox_mail (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind ~ '^[a-z_]{1,40}$'),
  campaign_id uuid references campaign (id),
  person_id uuid references person (id),
  to_address text not null check (char_length(to_address) between 3 and 320),
  subject text not null check (char_length(subject) between 1 and 998),
  body text not null check (char_length(body) <= 100000),
  dedupe_key text not null unique check (char_length(dedupe_key) between 1 and 200),
  state text not null default 'queued' check (state in ('queued', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  -- The server's reply, or what went wrong; never logged elsewhere.
  detail text check (detail is null or char_length(detail) <= 2000),
  message_id text check (message_id is null or char_length(message_id) <= 998),
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  check ((state = 'sent') = (sent_at is not null))
);
create index outbox_mail_queue on outbox_mail (next_attempt_at) where state = 'queued';
create index outbox_mail_campaign on outbox_mail (campaign_id, created_at desc);

create function outbox_mail_guard() returns trigger language plpgsql as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    perform refuse('a mail stays in the outbox as the record of what was sent');
  end if;
  if new.kind <> old.kind or new.to_address <> old.to_address or new.subject <> old.subject or new.body <> old.body
     or new.dedupe_key <> old.dedupe_key or new.created_at <> old.created_at
     or new.campaign_id is distinct from old.campaign_id or new.person_id is distinct from old.person_id then
    perform refuse('a queued mail keeps what it says and whom it is for');
  end if;
  if old.state in ('sent', 'failed') and new.state <> old.state then
    perform refuse('a sent or failed mail stays so; a new one is queued instead');
  end if;
  return new;
end
$$;
create trigger outbox_mail_guard before update or delete on outbox_mail
  for each row execute function outbox_mail_guard();
create trigger outbox_mail_no_truncate before truncate on outbox_mail
  for each statement execute function outbox_mail_guard();
