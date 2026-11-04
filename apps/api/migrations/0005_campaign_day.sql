-- The project days of a registration with what the organizer sets per day:
-- for now the attendance frame, the periods of the grid everyone is at
-- school in ("2.–6. EH"), by which Plätze und Bedarf counts the day period
-- by period instead of whole. One row per project day, written with the
-- days; a day without a frame has nulls. The array campaign.project_days
-- stays what every reader goes by; this table carries the days' settings.
-- Additive: no schema version.
create table campaign_day (
  campaign_id uuid not null references campaign (id) on delete cascade,
  day date not null,
  frame_from smallint check (frame_from between 1 and 20),
  frame_to smallint check (frame_to between 1 and 20),
  primary key (campaign_id, day),
  check ((frame_from is null) = (frame_to is null)),
  check (frame_to is null or frame_to >= frame_from)
);

-- Every registration there is gets its days, without a frame: nothing changes for them.
insert into campaign_day (campaign_id, day)
select c.id, d.day from campaign c cross join lateral unnest(c.project_days) as d(day);
