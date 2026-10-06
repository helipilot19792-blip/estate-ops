begin;

-- Accommodation facts belong to the operational property, not the marketing copy.
alter table public.properties
  add column if not exists property_type text,
  add column if not exists bedrooms integer check (bedrooms between 0 and 1000),
  add column if not exists bathrooms numeric check (bathrooms between 0 and 1000),
  add column if not exists max_guests integer check (max_guests between 1 and 1000),
  add column if not exists beds integer check (beds between 0 and 1000),
  add column if not exists parking_spaces integer check (parking_spaces between 0 and 1000);
create unique index if not exists properties_id_organization_publishing_idx on public.properties(id, organization_id);

create table public.website_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  website_url text not null default '',
  connector_type text not null default 'GULERA_SITE' check (connector_type in ('GULERA_SITE','CUSTOM_API','WORDPRESS','EMBED_WIDGET','WEBHOOK')),
  enabled boolean not null default false,
  auto_update boolean not null default false,
  status text not null default 'NOT_CONNECTED' check (status in ('NOT_CONNECTED','INTERNAL_API','UNSUPPORTED','FAILED')),
  -- Allowlisted, non-secret organization settings; no arbitrary credential JSON.
  settings jsonb not null default '{"licenceRequired":false,"roomsRequired":true,"minimumGallery":3,"preferredProvider":"DIRECT"}',
  secret_reference text, -- Future server-side vault reference. Never a password/token.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id),
  unique (id, organization_id)
);

create table public.property_public_listings (
  property_id uuid primary key,
  organization_id uuid not null,
  state text not null default 'PRIVATE' check (state in ('PRIVATE','DRAFT','READY','PUBLISHED','HIDDEN')),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  profile jsonb not null default '{}',
  published_profile jsonb,
  revision integer not null default 1,
  published_at timestamptz,
  last_published_at timestamptz,
  hidden_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (property_id,organization_id) references public.properties(id,organization_id) on delete cascade,
  unique (organization_id,slug),
  unique (property_id,organization_id),
  check (state <> 'PUBLISHED' or (published_profile is not null and published_at is not null))
);
-- Reserve both draft and established public slugs while editing.
create unique index website_published_slug_idx on public.property_public_listings(organization_id, (published_profile->>'slug')) where published_profile is not null;

create table public.website_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  organization_id uuid not null,
  property_id uuid not null,
  connection_id uuid not null,
  operation text not null check (operation in ('publish','update','unpublish')),
  status text not null default 'PENDING' check (status in ('PENDING','SUCCEEDED','FAILED')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (property_id,organization_id) references public.property_public_listings(property_id,organization_id) on delete cascade,
  foreign key (connection_id,organization_id) references public.website_connections(id,organization_id) on delete cascade
);
create index website_sync_jobs_pending_idx on public.website_sync_jobs(organization_id,status,created_at);
create index property_public_listings_visible_idx on public.property_public_listings(organization_id,state);
grant usage,select on sequence public.website_sync_jobs_sequence_seq to service_role;

-- No anonymous table access. Server APIs enforce admin membership before service-role writes.
do $$
declare t text;
begin
  foreach t in array array['website_connections','property_public_listings','website_sync_jobs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy organization_admin_read on public.%I for select to authenticated using (exists (select 1 from public.organization_members m join public.profiles p on p.id=m.profile_id where m.organization_id=%I.organization_id and m.profile_id=auth.uid() and m.role=''admin'' and p.role in (''admin'',''platform_admin'')))', t,t);
  end loop;
end $$;
-- Even tenant admins cannot read future vault references from the browser.
revoke select on public.website_connections from authenticated;
grant select(id,organization_id,name,website_url,connector_type,enabled,auto_update,status,settings,created_at,updated_at) on public.website_connections to authenticated;

create function public.enqueue_website_sync(p_org uuid,p_property uuid,p_operation text,p_automatic boolean default false)
returns void language sql security definer set search_path=public as $$
  insert into public.website_sync_jobs(organization_id,property_id,connection_id,operation)
  select p_org,p_property,id,p_operation from public.website_connections
  where organization_id=p_org and enabled and (not p_automatic or auto_update);
$$;

-- Atomic property facts + draft/snapshot + audit + outbox. Optimistic checks prevent stale approvals.
create function public.save_website_listing(p_org uuid,p_property uuid,p_actor uuid,p_revision integer,p_expected_facts jsonb,p_expected_settings jsonb,p_facts jsonb,p_profile jsonb,p_state text,p_action text)
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

create function public.website_property_facts_changed() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if row(new.property_type,new.bedrooms,new.bathrooms,new.max_guests,new.beds,new.parking_spaces,new.latitude,new.longitude) is distinct from
    row(old.property_type,old.bedrooms,old.bathrooms,old.max_guests,old.beds,old.parking_spaces,old.latitude,old.longitude) then
    if exists(select 1 from public.property_public_listings where property_id=new.id and organization_id=new.organization_id and state='PUBLISHED') then
      perform public.enqueue_website_sync(new.organization_id,new.id,'update',true);
    end if;
  end if;
  return new;
end $$;
create trigger website_property_facts_changed after update on public.properties for each row execute function public.website_property_facts_changed();

create function public.save_website_connection(p_org uuid,p_actor uuid,p_connection jsonb)
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

-- Phase 1 has no external worker. Complete internal API jobs atomically; unsupported
-- connectors fail explicitly and remain retryable, without touching property records.
create function public.process_internal_website_jobs(p_org uuid,p_actor uuid)
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

revoke all on function public.enqueue_website_sync(uuid,uuid,text,boolean),public.save_website_listing(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,text,text),public.website_property_facts_changed(),public.save_website_connection(uuid,uuid,jsonb),public.process_internal_website_jobs(uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_website_listing(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,text,text),public.save_website_connection(uuid,uuid,jsonb),public.process_internal_website_jobs(uuid,uuid) to service_role;
commit;
