-- schema-version: 4
-- What a session credits per project day is its clock minutes inside the
-- day's window (the project lead's decision of 2026-11-07, school-core
-- creditsOf, written by the server whenever a session's times are set):
-- the attendance frame of the registration's day, from the start of its
-- first period to the end of its last; without a frame, or with one none of
-- whose periods the grid still has, from the start of the grid's first
-- period to the end of its last. Breaks inside the window count: nobody
-- knows whether a teacher uses them. The night and what lies outside the
-- window count nothing, so an evening activity credits nothing at all and
-- is an extra its teachers place students into. Never more than a day's
-- 1440 minutes.
--
-- Until now (0009) a session credited the minutes it shared with the
-- grid's periods, breaks left out, and by the clock when it shared none.
-- This brings the sessions stored so far to the new rule, once, for the
-- registrations not yet open (in preparation, collecting activities,
-- catalogue published). A registration that has opened keeps what its
-- choices and its runs computed with. The server does the same when the
-- grid or a registration's frames change (services/credits.ts);
-- apps/api/test/catalogue.test.ts holds this statement to the server's
-- arithmetic. The zone is the school's, fixed (lib/time.ts
-- SCHOOL_TIME_ZONE). An activity accepted before is not checked again
-- against the minimum length; the organization keeps an eye on it.
--
-- The column keeps its shape, its meaning changes: a release built before
-- this one would derive the old credits again on the next edit, and would
-- offer an extra to rank, which the run never assigns. Hence schema
-- version 4: an earlier release does not start on a database this
-- migration ran on.
with touched as (
  select s.id, s.starts_at, s.ends_at, i.campaign_id, d::date as day
    from item_session s
    join catalog_item i on i.id = s.item_id
    join campaign c on c.id = i.campaign_id
    cross join lateral generate_series(
      (s.starts_at at time zone 'Europe/Vienna')::date,
      ((s.ends_at - interval '1 millisecond') at time zone 'Europe/Vienna')::date,
      interval '1 day') as d
   where c.state in ('draft', 'catalogue', 'published')
),
windowed as (
  select t.id, t.day, t.starts_at, t.ends_at,
         coalesce(f.starts, g.starts) as w_starts,
         coalesce(f.ends, g.ends) as w_ends
    from touched t
    left join campaign_day cd on cd.campaign_id = t.campaign_id and cd.day = t.day
    left join lateral (
      select min(p.starts) as starts, max(p.ends) as ends
        from period_grid p
       where p.period between cd.frame_from and cd.frame_to
      having count(*) > 0
    ) f on true
    cross join (select min(starts) as starts, max(ends) as ends from period_grid) g
),
minutes as (
  select w.id, w.day,
         case when w.w_starts is null
              then greatest(0, round(extract(epoch from
                     least(w.ends_at, (w.day + 1)::timestamp at time zone 'Europe/Vienna')
                     - greatest(w.starts_at, w.day::timestamp at time zone 'Europe/Vienna')) / 60))
              else greatest(0, round(extract(epoch from
                     least(w.ends_at, (w.day + w.w_ends) at time zone 'Europe/Vienna')
                     - greatest(w.starts_at, (w.day + w.w_starts) at time zone 'Europe/Vienna')) / 60))
         end::integer as minutes
    from windowed w
),
derived as (
  select m.id,
         jsonb_agg(jsonb_build_object('date', to_char(m.day, 'YYYY-MM-DD'), 'minutes', least(1440, m.minutes)) order by m.day) as credits
    from minutes m
   group by m.id
)
update item_session s set credits = d.credits from derived d where d.id = s.id;
