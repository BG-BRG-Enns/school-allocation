-- A registration still in preparation may go: created in the wrong year, the
-- wrong month in the picker, a try. The runtime role never deletes a campaign
-- (runtime-privileges.ts); this definer function, owned by the migrator, is
-- the one path, and it takes only what a preparation can have: the rules
-- and the items still drafts without a number (the item guard lets such a
-- draft go). Anything else refuses with SQLSTATE 55000, which the service
-- answers as campaign_state: an item past draft or once numbered, a grant
-- scoped to the campaign (the grant guard keeps every grant; the app makes
-- none scoped to a campaign), a notice, a placement, a choice, a run. The
-- campaign's audit chain stays as the record that it was; the service writes
-- the deletion into the school's chain. A tombstone keeps the chain's scope
-- with its school year, so the year's retention purge finds it
-- (purge_deleted_campaigns below): the purge of a year reads its campaigns,
-- and this one is gone. Additive: no schema version.
create table deleted_campaign (
  id uuid primary key,
  school_year text not null check (school_year ~ '^\d{4}/\d{2}$'),
  name text not null,
  deleted_at timestamptz not null default app_now()
);
create index deleted_campaign_school_year on deleted_campaign (school_year);

create function delete_draft_campaign(campaign_id uuid) returns table (relation text, removed bigint)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  st text;
  yr text;
  nm text;
  n bigint;
begin
  select state, school_year, name into st, yr, nm from campaign where id = campaign_id for update;
  if st is null then
    raise exception 'no such campaign' using errcode = '02000';
  end if;
  if st <> 'draft' then
    raise exception 'a campaign past preparation is not deleted' using errcode = '55000';
  end if;
  if exists (select 1 from catalog_item where catalog_item.campaign_id = delete_draft_campaign.campaign_id and (state <> 'draft' or number is not null)) then
    raise exception 'a campaign with an item past draft is not deleted' using errcode = '55000';
  end if;
  if exists (select 1 from role_grant where role_grant.campaign_id = delete_draft_campaign.campaign_id) then
    raise exception 'a campaign with a grant scoped to it is not deleted' using errcode = '55000';
  end if;
  if exists (select 1 from outbox_mail where outbox_mail.campaign_id = delete_draft_campaign.campaign_id)
     or exists (select 1 from pre_assignment where pre_assignment.campaign_id = delete_draft_campaign.campaign_id)
     or exists (select 1 from choice where choice.campaign_id = delete_draft_campaign.campaign_id)
     or exists (select 1 from allocation_run where allocation_run.campaign_id = delete_draft_campaign.campaign_id) then
    raise exception 'a campaign with records of a window is not deleted' using errcode = '55000';
  end if;
  with d as (delete from catalog_item where catalog_item.campaign_id = delete_draft_campaign.campaign_id returning 1) select count(*) into n from d;
  relation := 'catalog_item'; removed := n; return next;
  with d as (delete from campaign_rule where campaign_rule.campaign_id = delete_draft_campaign.campaign_id returning 1) select count(*) into n from d;
  relation := 'campaign_rule'; removed := n; return next;
  insert into deleted_campaign (id, school_year, name) values (delete_draft_campaign.campaign_id, yr, nm);
  with d as (delete from campaign where id = delete_draft_campaign.campaign_id returning 1) select count(*) into n from d;
  relation := 'campaign'; removed := n; return next;
end
$$;

-- The retention purge of a year (purge_school_year) reads the year's campaigns and takes their audit chains with them; a
-- campaign deleted in preparation left its chain behind, under its tombstone. This takes those chains and the tombstones
-- once the year's retention has ended and every campaign of the year is archived, the same rules as the purge's, held
-- here for whoever calls; the service calls both in one transaction.
create function purge_deleted_campaigns(year text) returns table (relation text, removed bigint)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  scopes uuid[];
  n bigint;
begin
  if year !~ '^\d{4}/\d{2}$' then
    raise exception 'not a school year: %', year using errcode = '22023';
  end if;
  if now() < make_timestamptz(substring(year from 1 for 4)::integer + 2, 9, 1, 0, 0, 0, 'Europe/Vienna') then
    raise exception 'the retention of % has not ended', year using errcode = '55000';
  end if;
  if exists (select 1 from campaign where school_year = year and state <> 'archived') then
    raise exception 'a campaign of % is not archived', year using errcode = '55000';
  end if;
  select coalesce(array_agg(id), '{}') into scopes from deleted_campaign where school_year = year;
  perform set_config('schulwahl.purge', 'on', true);
  with d as (delete from audit_event where scope_id = any(scopes) returning 1) select count(*) into n from d;
  relation := 'audit_event_deleted_campaigns'; removed := n; return next;
  with d as (delete from deleted_campaign where id = any(scopes) returning 1) select count(*) into n from d;
  relation := 'deleted_campaign'; removed := n; return next;
end
$$;
