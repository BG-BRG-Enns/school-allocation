-- Campaigns and their catalogue (docs/domain-and-api.md §1–3, D-24 revised):
-- a campaign with its project days and lifecycle state; the activities
-- teachers propose and organizers approve, with their sessions, the credit
-- per project day, the places students may rank, the classes they are fixed
-- for and who may rank them. Lifecycle windows (which state allows what) are
-- school-core's guards, asked by the routes; the triggers here keep only
-- what stored rows must satisfy whoever writes them. No grants here: the
-- migrator applies apps/api/lib/runtime-privileges.ts.

-- A campaign: a project week (or, later, the electives) of one school year.
create table campaign (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('project_week', 'wpf')),
  name text not null check (char_length(name) between 1 and 200),
  school_year text not null check (school_year ~ '^\d{4}/\d{2}$'),
  state text not null default 'draft'
    check (state in ('draft', 'catalogue', 'published', 'open', 'closed', 'allocating', 'review', 'results', 'archived')),
  -- The days activities take place on, local dates; a few at most.
  project_days date[] not null check (cardinality(project_days) between 1 and 10),
  -- Per-campaign settings a later slice reads (ranks to give, reminders).
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object'),
  -- The roster batch frozen when the window closes; null until then.
  roster_batch_id uuid references import_batch (id),
  created_by uuid not null references app_user (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaign_year on campaign (school_year, created_at desc);

-- A role may be granted for one campaign; the column existed, the campaign
-- did not.
alter table role_grant add constraint role_grant_campaign foreign key (campaign_id) references campaign (id);

-- An activity of a campaign. `places` are the places students may rank: the
-- capacity of a choosable activity, the extra places of an activity fixed
-- for classes (whose students are pre-assigned and count against nothing).
-- An item is numbered when the catalogue is published; the number is for
-- the printed catalogue and never changes.
create table catalog_item (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaign (id),
  number integer check (number >= 1),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  location text not null default '' check (char_length(location) <= 200),
  fee_cents integer not null default 0 check (fee_cents between 0 and 100000),
  fee_note text not null default '' check (char_length(fee_note) <= 500),
  places integer not null default 0 check (places between 0 and 1000),
  min_participants integer not null default 0 check (min_participants between 0 and 1000),
  cancellable_below_min boolean not null default true,
  fixed_classes text[] not null default '{}',
  eligible_grades smallint[] not null default '{}',
  eligible_classes text[] not null default '{}',
  state text not null default 'draft' check (state in ('draft', 'proposed', 'approved', 'withdrawn')),
  -- The account that proposed it; the teachers are roster persons (item_teacher).
  proposed_by uuid not null references app_user (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The organizer's note when returning a proposal for changes.
  review_note text not null default '' check (char_length(review_note) <= 1000),
  approved_at timestamptz,
  approved_by uuid references app_user (id),
  withdrawn_at timestamptz,
  withdrawn_by uuid references app_user (id),
  withdraw_reason text check (withdraw_reason is null or char_length(withdraw_reason) between 1 and 500),
  check ((approved_at is null) = (approved_by is null)),
  check ((withdrawn_at is null) = (withdrawn_by is null)),
  check ((state = 'withdrawn') = (withdrawn_at is not null)),
  check (state <> 'withdrawn' or withdraw_reason is not null),
  check (state <> 'approved' or approved_at is not null)
);
create unique index catalog_item_number on catalog_item (campaign_id, number) where number is not null;
create index catalog_item_campaign on catalog_item (campaign_id, state);

create function catalog_item_guard() returns trigger language plpgsql as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    -- A draft nobody has reviewed may go; anything later, and anything that
    -- was in a published catalogue (it has a number), is withdrawn, so the
    -- record of what was proposed stays and no number is given out twice.
    if tg_op = 'TRUNCATE' or old.state <> 'draft' or old.number is not null then
      perform refuse('an item past draft or with a catalogue number is withdrawn, not removed');
    end if;
    return old;
  end if;
  if new.campaign_id <> old.campaign_id or new.proposed_by <> old.proposed_by or new.created_at <> old.created_at then
    perform refuse('an item stays with its campaign and proposer');
  end if;
  if old.number is not null and new.number is distinct from old.number then
    perform refuse('an item keeps its catalogue number');
  end if;
  return new;
end
$$;
create trigger catalog_item_guard before update or delete on catalog_item
  for each row execute function catalog_item_guard();
create trigger catalog_item_no_truncate before truncate on catalog_item
  for each statement execute function catalog_item_guard();

-- The teachers of an activity: roster persons, in the order they are named.
create table item_teacher (
  item_id uuid not null references catalog_item (id) on delete cascade,
  person_id uuid not null references person (id),
  position smallint not null check (position >= 0),
  primary key (item_id, person_id)
);

-- A session of an activity: when, where, and the minutes it credits per
-- local date it touches ([{"date": "2027-06-22", "minutes": 360}, ...]),
-- given by the teacher since travel and breaks do not count. Sessions are
-- replaced as a whole when an item is edited.
create table item_session (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references catalog_item (id) on delete cascade,
  position smallint not null check (position >= 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null default '' check (char_length(location) <= 200),
  credits jsonb not null check (jsonb_typeof(credits) = 'array'),
  check (ends_at > starts_at),
  unique (item_id, position)
);
create index item_session_item on item_session (item_id, starts_at);
