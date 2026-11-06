-- What a session credits per project day is no longer entered by the
-- teacher but derived from the school's periods it covers (school-core
-- creditsOf, written by the server whenever a session's times are set):
-- per local date the session touches, the minutes it shares with the
-- periods of period_grid on that date, so breaks and what lies outside the
-- timetable do not count; a session that shares nothing with the grid on
-- any of its dates credits its clock minutes per date instead. Never more
-- than a day's 1440 minutes.
--
-- This brings the sessions entered so far to the same rule, once, for the
-- registrations not yet open (in preparation, collecting activities,
-- catalogue published): what a session of theirs credits was typed by
-- hand, most often the clock minutes the form proposed, breaks included.
-- A registration that has opened keeps what its choices and its runs
-- computed with. The server does the same when the grid changes
-- (services/settings.ts); apps/api/test/catalogue.test.ts holds this
-- statement to the server's arithmetic. The zone is the school's, fixed
-- (lib/time.ts SCHOOL_TIME_ZONE). Additive: no schema version.
with touched as (
  select s.id, s.starts_at, s.ends_at, d::date as day
    from item_session s
    join catalog_item i on i.id = s.item_id
    join campaign c on c.id = i.campaign_id
    cross join lateral generate_series(
      (s.starts_at at time zone 'Europe/Vienna')::date,
      ((s.ends_at - interval '1 millisecond') at time zone 'Europe/Vienna')::date,
      interval '1 day') as d
   where c.state in ('draft', 'catalogue', 'published')
),
minutes as (
  select t.id, t.day,
         coalesce((select sum(greatest(0, round(extract(epoch from
                            least(t.ends_at, (t.day + p.ends) at time zone 'Europe/Vienna')
                            - greatest(t.starts_at, (t.day + p.starts) at time zone 'Europe/Vienna')) / 60)))
                     from period_grid p), 0)::integer as on_grid,
         greatest(0, round(extract(epoch from
                    least(t.ends_at, (t.day + 1)::timestamp at time zone 'Europe/Vienna')
                    - greatest(t.starts_at, t.day::timestamp at time zone 'Europe/Vienna')) / 60))::integer as by_clock
    from touched t
),
derived as (
  select m.id,
         jsonb_agg(jsonb_build_object('date', to_char(m.day, 'YYYY-MM-DD'),
                                      'minutes', least(1440, case when g.any_on_grid then m.on_grid else m.by_clock end))
                   order by m.day) as credits
    from minutes m
    join (select id, bool_or(on_grid > 0) as any_on_grid from minutes group by id) g on g.id = m.id
   group by m.id
)
update item_session s set credits = d.credits from derived d where d.id = s.id;
