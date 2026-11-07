-- The minimum length of an activity per project day (the project lead's
-- decision of 2026-11-07): what an activity must credit on that day, in
-- minutes, summed over its sessions, or it is refused with the rule
-- (school-core checkItem, below_minimum_length). Minutes alone: the grid
-- allows periods of unequal length, so a count of them would mean one
-- thing or another. A day without a value asks for nothing. Additive: a
-- release built before it ignores the column.

alter table campaign_day
  add column min_activity_minutes smallint check (min_activity_minutes between 1 and 1440);
