-- Manual Phase 2 rollback. Export snapshot facts/revisions, delivery history and remote IDs first.
-- Restore Phase 1 functions; retain canonical facts, marketing snapshots and audit history.
begin;
drop function if exists public.claim_website_jobs(uuid,integer,uuid,boolean);
drop function if exists public.finish_website_job(uuid,uuid,boolean,text,text,text,uuid);
drop function if exists public.retry_website_jobs(uuid,uuid,uuid);
drop function if exists public.website_public_page(uuid,text,text,text,boolean,integer,integer);
drop function if exists public.record_website_connection_test(uuid,uuid,integer,boolean);
create or replace function public.enqueue_website_sync(p_org uuid,p_property uuid,p_operation text,p_automatic boolean default false)
returns void language sql security definer set search_path=public as $$
  insert into public.website_sync_jobs(organization_id,property_id,connection_id,operation)
  select p_org,p_property,id,p_operation from public.website_connections
  where organization_id=p_org and enabled and (not p_automatic or auto_update);
$$;

create or replace function public.save_website_listing(p_org uuid,p_property uuid,p_actor uuid,p_revision integer,p_expected_facts jsonb,p_expected_settings jsonb,p_facts jsonb,p_profile jsonb,p_state text,p_action text)
returns void language plpgsql security definer set search_path=public as $$
declare old_listing public.property_public_listings; current_facts jsonb; current_settings jsonb; old_state text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text, 0));
  select jsonb_build_object('property_type',property_type,'bedrooms',bedrooms,'bathrooms',bathrooms,'max_guests',max_guests,'beds',beds,'parking_spaces',parking_spaces,'latitude',latitude,'longitude',longitude)
    into current_facts from public.properties where id=p_property and organization_id=p_org for update;
  if current_facts is null then raise exception 'Property not found' using errcode='P0002'; end if;
  select settings into current_settings from public.website_connections where organization_id=p_org for update;
  if current_facts is distinct from p_expected_facts or current_settings is distinct from p_expected_settings then
    raise exception 'Property facts or publishing settings changed; reload before approving' using errcode='40001';
  end if;
  select * into old_listing from public.property_public_listings where property_id=p_property and organization_id=p_org for update;
  if coalesce(old_listing.revision,0) <> p_revision then raise exception 'Listing changed; reload before saving' using errcode='40001'; end if;
  -- Slugs cannot shadow another property's published or draft URL.
  if exists(select 1 from public.property_public_listings where organization_id=p_org and property_id<>p_property and (slug=p_profile->>'slug' or published_profile->>'slug'=p_profile->>'slug')) then
    raise exception 'Slug already in use' using errcode='23505';
  end if;
  old_state := coalesce(old_listing.state,'PRIVATE');
  update public.properties set property_type=p_facts->>'property_type', bedrooms=(p_facts->>'bedrooms')::integer,
    bathrooms=(p_facts->>'bathrooms')::numeric,max_guests=(p_facts->>'max_guests')::integer,beds=(p_facts->>'beds')::integer,parking_spaces=(p_facts->>'parking_spaces')::integer
    where id=p_property and organization_id=p_org;
  insert into public.property_public_listings(property_id,organization_id,state,slug,profile,published_profile,published_at,last_published_at,hidden_at)
    values(p_property,p_org,p_state,p_profile->>'slug',p_profile,case when p_action='publish' then p_profile else old_listing.published_profile end,
      coalesce(old_listing.published_at,case when p_action='publish' then now() end),
      case when p_action='publish' then now() else old_listing.last_published_at end,case when p_state='HIDDEN' then now() end)
  on conflict(property_id) do update set
    state=p_state,slug=p_profile->>'slug',profile=p_profile,revision=property_public_listings.revision+1,updated_at=now(),
    published_profile=case when p_action='publish' then p_profile else property_public_listings.published_profile end,
    published_at=coalesce(property_public_listings.published_at,case when p_action='publish' then now() end),
    last_published_at=case when p_action='publish' then now() else property_public_listings.last_published_at end,
    hidden_at=case when p_state in ('HIDDEN','PRIVATE') then now() else null end;
  insert into public.audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id,metadata)
    values(p_actor,p_org,'website_listing_'||p_action,'property',p_property::text,
      jsonb_build_object('from',old_state,'to',p_state,'revision',p_revision+1,
        'changed_public_fields',(select coalesce(jsonb_agg(key),'[]'::jsonb) from jsonb_each(p_profile) where value is distinct from old_listing.profile->key),
        'changed_property_facts',(select coalesce(jsonb_agg(key),'[]'::jsonb) from jsonb_each(p_facts) where value is distinct from current_facts->key)));
  if p_action='publish' then perform public.enqueue_website_sync(p_org,p_property,case when old_listing.published_at is null then 'publish' else 'update' end);
  elsif old_state='PUBLISHED' and p_state<>'PUBLISHED' then perform public.enqueue_website_sync(p_org,p_property,'unpublish'); end if;
end $$;

create or replace function public.website_property_facts_changed() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if row(new.property_type,new.bedrooms,new.bathrooms,new.max_guests,new.beds,new.parking_spaces,new.latitude,new.longitude) is distinct from
    row(old.property_type,old.bedrooms,old.bathrooms,old.max_guests,old.beds,old.parking_spaces,old.latitude,old.longitude) then
    if exists(select 1 from public.property_public_listings where property_id=new.id and organization_id=new.organization_id and state='PUBLISHED') then
      perform public.enqueue_website_sync(new.organization_id,new.id,'update',true);
    end if;
  end if;
  return new;
end $$;

create or replace function public.save_website_connection(p_org uuid,p_actor uuid,p_connection jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
  insert into public.website_connections(organization_id,name,website_url,connector_type,enabled,auto_update,status,settings)
    values(p_org,p_connection->>'name',p_connection->>'website_url',p_connection->>'connector_type',(p_connection->>'enabled')::boolean,
      (p_connection->>'auto_update')::boolean,p_connection->>'status',p_connection->'settings')
  on conflict(organization_id) do update set name=excluded.name,website_url=excluded.website_url,connector_type=excluded.connector_type,
    enabled=excluded.enabled,auto_update=excluded.auto_update,status=excluded.status,settings=excluded.settings,updated_at=now();
  insert into public.audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id)
    values(p_actor,p_org,'website_connection_saved','organization',p_org::text);
  -- Backfill existing published listings when a connection is enabled or settings change.
  insert into public.website_sync_jobs(organization_id,property_id,connection_id,operation)
    select p_org,l.property_id,c.id,'update' from public.property_public_listings l join public.website_connections c on c.organization_id=l.organization_id
    where l.organization_id=p_org and l.state='PUBLISHED' and c.enabled;
end $$;

create or replace function public.process_internal_website_jobs(p_org uuid,p_actor uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare job record; result text; count_processed integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
  for job in select j.*,c.connector_type,c.enabled from public.website_sync_jobs j join public.website_connections c on c.id=j.connection_id and c.organization_id=j.organization_id
    where j.organization_id=p_org and j.status in ('PENDING','FAILED') order by j.sequence limit 100 for update of j skip locked loop
    result := case when job.enabled and job.connector_type='GULERA_SITE' then 'SUCCEEDED' else 'FAILED' end;
    update public.website_sync_jobs set status=result,attempts=attempts+1,completed_at=now(),last_error=case when result='FAILED' then 'Connection disabled or connector not implemented in Phase 1' end where id=job.id;
    if result='SUCCEEDED' then update public.property_public_listings set last_sync_at=now() where property_id=job.property_id and organization_id=p_org; end if;
    insert into public.audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id,metadata)
      values(p_actor,p_org,'website_sync_'||lower(result),'website_sync_job',job.id::text,jsonb_build_object('operation',job.operation,'connector',job.connector_type));
    count_processed := count_processed+1;
  end loop;
  return count_processed;
end $$;
drop function if exists public.approve_website_snapshot(uuid,uuid,uuid);
drop function if exists public.website_profile_ready(jsonb,jsonb,jsonb);
drop function if exists public.website_collection_keys(jsonb,jsonb);
drop function if exists public.website_fact_snapshot(public.properties);
drop function if exists public.website_location_key(text);
drop table if exists public.website_remote_resources;
drop index if exists public.website_public_page_idx;
drop index if exists public.website_public_collections_idx;
drop index if exists public.website_sync_identity_idx;
drop index if exists public.website_sync_due_idx;
alter table public.website_sync_jobs drop constraint website_sync_jobs_status_check;
update public.website_sync_jobs set status='FAILED' where status not in ('PENDING','FAILED','SUCCEEDED');
alter table public.website_sync_jobs add constraint website_sync_jobs_status_check check(status in ('PENDING','FAILED','SUCCEEDED'));
alter table public.website_sync_jobs drop column generation,drop column publication_revision,drop column config_revision,drop column next_retry_at,drop column lease_token,drop column lease_until;
alter table public.property_public_listings drop column listing_id,drop column published_facts,drop column published_revision,drop column published_by,drop column publication_generation,drop column published_collections,drop column published_location,drop column published_featured,drop column published_priority;
alter table public.website_connections drop column publishing_mode,drop column configuration,drop column config_revision,drop column last_successful_sync,drop column last_test_at,drop column last_test_result;
commit;
