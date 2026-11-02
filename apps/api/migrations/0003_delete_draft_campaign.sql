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
-- the deletion into the school's chain. Additive: no schema version.
create function delete_draft_campaign(campaign_id uuid) returns table (relation text, removed bigint)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  st text;
  n bigint;
begin
  select state into st from campaign where id = campaign_id for update;
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
  with d as (delete from campaign where id = delete_draft_campaign.campaign_id returning 1) select count(*) into n from d;
  relation := 'campaign'; removed := n; return next;
end
$$;
