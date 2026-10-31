-- schema-version: 4
-- Categories and rules: the school keeps one list of categories (sport,
-- creative, careers …), an activity belongs to none, one or several, and a
-- registration asks of the students of some grades (or classes of them) at
-- least so many activities or minutes of a category. The allocation meets
-- a rule where it can, after the days and before the wishes.
--
-- It raises the schema version: a run's snapshot and the solver contract
-- carry the rules now (allocation/v2), and a release before it would
-- allocate a registration as if it had none.
--
-- The categories are the school's, outside any school year, like the
-- period grid: renamed freely, removed only while nothing names them (the
-- references below have no cascade). An activity's categories and a
-- registration's rules go with their activity and registration, the
-- retention purge included.
--
-- No grants here: the migrator applies apps/api/lib/runtime-privileges.ts.

create table category (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  created_at timestamptz not null default app_now(),
  updated_at timestamptz not null default app_now()
);
-- "Sport" and "sport" are one category.
create unique index category_name on category (lower(name));

create table item_category (
  item_id uuid not null references catalog_item (id) on delete cascade,
  category_id uuid not null references category (id),
  primary key (item_id, category_id)
);
create index item_category_category on item_category (category_id);

-- A rule in the order the organizer set; it applies to the listed grades,
-- and to the listed classes of them when any are listed.
create table campaign_rule (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaign (id) on delete cascade,
  position smallint not null check (position >= 0),
  category_id uuid not null references category (id),
  grades smallint[] not null check (cardinality(grades) between 1 and 13),
  classes text[] not null default '{}' check (cardinality(classes) <= 40),
  unit text not null check (unit in ('items', 'minutes')),
  minimum integer not null check (minimum between 1 and 10000),
  unique (campaign_id, position)
);
create index campaign_rule_category on campaign_rule (category_id);
