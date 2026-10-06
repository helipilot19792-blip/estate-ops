begin;
alter table public.website_connections
  add column publishing_mode text not null default 'MANUAL_APPROVAL' check(publishing_mode in ('MANUAL_APPROVAL','AUTOMATIC')),
  add column configuration jsonb not null default '{"adapter":"GENERIC","transport":"UNCONFIGURED"}',
  add column config_revision integer not null default 1,
  add column last_successful_sync timestamptz,
  add column last_test_at timestamptz,
  add column last_test_result jsonb;
grant select(publishing_mode,configuration,config_revision,last_successful_sync,last_test_at,last_test_result) on public.website_connections to authenticated;

alter table public.property_public_listings
  add column listing_id uuid not null default gen_random_uuid() unique,
  add column published_facts jsonb,
  add column published_revision integer,
  add column published_by uuid references public.profiles(id) on delete set null,
  add column publication_generation integer not null default 0,
  add column published_collections text[] not null default '{}',
  add column published_location text not null default '',
  add column published_featured boolean not null default false,
  add column published_priority integer not null default 0;

create function public.website_fact_snapshot(p public.properties) returns jsonb language sql immutable set search_path=public as $$
  select jsonb_build_object('property_type',p.property_type,'bedrooms',p.bedrooms,'bathrooms',p.bathrooms,'max_guests',p.max_guests,'beds',p.beds,'parking_spaces',p.parking_spaces,'latitude',p.latitude,'longitude',p.longitude)
$$;
-- Match the application's location slug normalization, including existing accented locations.
create function public.website_location_key(p text) returns text language sql immutable set search_path=public as $$
  select trim(trailing '-' from left(trim(both '-' from regexp_replace(lower(regexp_replace(normalize(coalesce(p,''),NFKD),U&'[\0300-\036f]','','g')),'[^a-z0-9]+','-','g')),100))
$$;
create function public.website_collection_keys(p jsonb,f jsonb) returns text[] language sql immutable set search_path=public as $$
  select coalesce(array_agg(distinct tag order by tag),'{}') from (
    select jsonb_array_elements_text(coalesce(p->'tags','[]')) tag union all
    select jsonb_array_elements_text(coalesce(p->'seasonalTags','[]')) union all
    select name from (values ('petFriendly','pet-friendly'),('waterfront','waterfront'),('beachAccess','beach-access'),('pool','pool'),('hotTub','hot-tub'),('golfCart','golf-cart'),('generator','generator'),('fireplace','fireplace'),('workFriendly','work-friendly')) as features(key,name) where p->'features'->key='true'::jsonb union all
    select 'sleeps-8-plus' where (f->>'max_guests')::numeric>=8 union all
    select 'featured' where p->'featured'='true'::jsonb
  ) tags where tag<>''
$$;
create function public.website_profile_ready(p jsonb,f jsonb,s jsonb) returns boolean language sql immutable set search_path=public as $$
  select coalesce(
    p->'enabled'='true'::jsonb and length(trim(p->>'name'))>0 and p->>'slug' ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(p->>'slug')<=100
    and length(trim(p->>'description'))>0 and (f->>'max_guests')::numeric>0
    and (coalesce(s->>'roomsRequired','true')='false' or ((f->>'bedrooms')::numeric>=0 and (f->>'bathrooms')::numeric>0))
    and (coalesce(s->>'licenceRequired','false')='false' or length(trim(p->>'licence'))>0)
    and (select count(*) from jsonb_array_elements(coalesce(p->'photos','[]')) photo where photo->'approved'='true'::jsonb and photo->'hero'='true'::jsonb and photo->>'status' in ('APPROVED','ENHANCED') and photo->>'publicUrl' ~ '^https://')=1
    and exists(select 1 from jsonb_array_elements(coalesce(p->'channels','[]')) c where c->'enabled'='true'::jsonb and c->>'url' ~ '^https://'), false)
$$;

-- Freeze existing approvals at migration time; do not approve working drafts.
update public.property_public_listings l set published_facts=public.website_fact_snapshot(p),
  published_revision=coalesce((select (a.metadata->>'revision')::integer from public.audit_logs a where a.organization_id=l.organization_id and a.target_id=l.property_id::text and a.action_type='website_listing_publish' and a.metadata->>'revision' ~ '^[0-9]+$' order by a.created_at desc limit 1),l.revision),
  published_by=(select a.actor_profile_id from public.audit_logs a where a.organization_id=l.organization_id and a.target_id=l.property_id::text and a.action_type='website_listing_publish' order by a.created_at desc limit 1),
  publication_generation=case when l.published_profile is null then 0 else 1 end,
  published_collections=public.website_collection_keys(l.published_profile,public.website_fact_snapshot(p)),
  published_location=public.website_location_key(l.published_profile->>'location'),
  published_featured=coalesce((l.published_profile->>'featured')::boolean,false),
  published_priority=coalesce((l.published_profile->>'homepagePriority')::integer,0)
from public.properties p where l.property_id=p.id and l.organization_id=p.organization_id and l.published_profile is not null;

alter table public.website_sync_jobs drop constraint website_sync_jobs_status_check;
alter table public.website_sync_jobs add constraint website_sync_jobs_status_check check(status in ('PENDING','RUNNING','FAILED','SUCCEEDED','DEAD','SUPERSEDED'));
alter table public.website_sync_jobs
  add column generation integer not null default 0,
  add column publication_revision integer,
  add column config_revision integer not null default 1,
  add column next_retry_at timestamptz not null default now(),
  add column lease_token uuid,
  add column lease_until timestamptz;
-- Preserve old audit/job history and supersede unversioned deliveries.
update public.website_sync_jobs set status='SUPERSEDED',completed_at=now() where status in ('PENDING','FAILED');
create unique index website_sync_identity_idx on public.website_sync_jobs(connection_id,property_id,generation,config_revision) where generation>0;
create index website_sync_due_idx on public.website_sync_jobs(next_retry_at,sequence) where status in ('PENDING','FAILED','RUNNING');
create index website_public_page_idx on public.property_public_listings(organization_id,published_priority,listing_id) where state='PUBLISHED';
create index website_public_collections_idx on public.property_public_listings using gin(published_collections) where state='PUBLISHED';

create table public.website_remote_resources (
  connection_id uuid not null,
  property_id uuid not null,
  organization_id uuid not null,
  remote_resource_id text,
  remote_url text,
  last_pushed_revision integer,
  last_generation integer not null default 0,
  last_successful_sync timestamptz,
  primary key(connection_id,property_id),
  foreign key(connection_id,organization_id) references public.website_connections(id,organization_id) on delete cascade,
  foreign key(property_id,organization_id) references public.property_public_listings(property_id,organization_id) on delete cascade
);
alter table public.website_remote_resources enable row level security;
revoke all on public.website_remote_resources from anon,authenticated;
grant select on public.website_remote_resources to authenticated;
grant all on public.website_remote_resources to service_role;
create policy organization_admin_read on public.website_remote_resources for select to authenticated using(exists(select 1 from public.organization_members m join public.profiles p on p.id=m.profile_id where m.organization_id=website_remote_resources.organization_id and m.profile_id=auth.uid() and m.role='admin' and p.role in ('admin','platform_admin')));

create or replace function public.enqueue_website_sync(p_org uuid,p_property uuid,p_operation text,p_automatic boolean default false)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.website_sync_jobs(organization_id,property_id,connection_id,operation,generation,config_revision,publication_revision)
  select p_org,p_property,c.id,p_operation,l.publication_generation,c.config_revision,l.published_revision
  from public.website_connections c join public.property_public_listings l on l.organization_id=c.organization_id
  where c.organization_id=p_org and l.property_id=p_property and c.enabled and l.publication_generation>0
  on conflict(connection_id,property_id,generation,config_revision) where generation>0 do nothing;
  update public.website_sync_jobs j set status='SUPERSEDED',completed_at=now()
  from public.property_public_listings l,public.website_connections c
  where j.organization_id=p_org and j.property_id=p_property and l.property_id=j.property_id and c.id=j.connection_id
    and j.status in ('PENDING','FAILED','DEAD') and (j.generation<l.publication_generation or j.config_revision<c.config_revision);
end $$;

create function public.approve_website_snapshot(p_org uuid,p_property uuid,p_actor uuid)
returns void language plpgsql security definer set search_path=public as $$
declare l public.property_public_listings; f jsonb; s jsonb; unchanged boolean;
begin
  select * into l from public.property_public_listings where property_id=p_property and organization_id=p_org for update;
  select public.website_fact_snapshot(p) into f from public.properties p where p.id=p_property and p.organization_id=p_org;
  select settings into s from public.website_connections where organization_id=p_org;
  if not public.website_profile_ready(l.profile,f,s) then raise exception 'Listing is not ready for approval' using errcode='22023'; end if;
  unchanged := l.state='PUBLISHED' and l.published_profile=l.profile and l.published_facts=f;
  update public.property_public_listings set state='PUBLISHED',published_profile=profile,published_facts=f,published_revision=revision,published_by=p_actor,
    published_at=coalesce(published_at,now()),last_published_at=now(),hidden_at=null,
    publication_generation=publication_generation+case when unchanged then 0 else 1 end,
    published_collections=public.website_collection_keys(profile,f),
    published_location=public.website_location_key(profile->>'location'),
    published_featured=coalesce((profile->>'featured')::boolean,false),
    published_priority=case when coalesce((profile->>'featured')::boolean,false) then coalesce((profile->>'featuredPriority')::integer,(profile->>'homepagePriority')::integer,0) else coalesce((profile->>'homepagePriority')::integer,0) end
  where property_id=p_property and organization_id=p_org;
  if not unchanged then perform public.enqueue_website_sync(p_org,p_property,case when l.published_revision is null then 'publish' else 'update' end); end if;
end $$;

create or replace function public.save_website_listing(p_org uuid,p_property uuid,p_actor uuid,p_revision integer,p_expected_facts jsonb,p_expected_settings jsonb,p_facts jsonb,p_profile jsonb,p_state text,p_action text)
returns void language plpgsql security definer set search_path=public as $$
declare l public.property_public_listings; f jsonb; s jsonb; mode text; config_version integer; previous_guard text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
  select public.website_fact_snapshot(p) into f from public.properties p where id=p_property and organization_id=p_org for update;
  if f is null then raise exception 'Property not found' using errcode='P0002'; end if;
  select settings,publishing_mode,config_revision into s,mode,config_version from public.website_connections where organization_id=p_org for update;
  if f is distinct from p_expected_facts or s is distinct from (case when p_expected_settings ? 'settings' then p_expected_settings->'settings' else p_expected_settings end)
    or (p_expected_settings ? 'configRevision' and config_version is distinct from (p_expected_settings->>'configRevision')::integer)
    then raise exception 'Property facts or publishing settings changed; reload before approving' using errcode='40001'; end if;
  select * into l from public.property_public_listings where property_id=p_property and organization_id=p_org for update;
  if coalesce(l.revision,0)<>p_revision then raise exception 'Listing changed; reload before saving' using errcode='40001'; end if;
  if p_action not in ('save','ready','publish','hide','private','revert') then raise exception 'Invalid action' using errcode='22023'; end if;
  if exists(select 1 from public.property_public_listings where organization_id=p_org and property_id<>p_property and (slug=p_profile->>'slug' or published_profile->>'slug'=p_profile->>'slug')) then raise exception 'Slug already in use' using errcode='23505'; end if;
  if p_action='revert' then
    if l.published_profile is null then raise exception 'No approved snapshot to restore' using errcode='22023'; end if;
    -- Restore marketing only. Canonical operational facts must never be rolled back by discarding a draft.
    update public.property_public_listings set profile=published_profile,slug=published_profile->>'slug',revision=revision+1,updated_at=now() where property_id=p_property and organization_id=p_org;
  else
    previous_guard:=current_setting('gulera.website_save',true);
    perform set_config('gulera.website_save',p_property::text,true);
    update public.properties set property_type=p_facts->>'property_type',bedrooms=(p_facts->>'bedrooms')::integer,bathrooms=(p_facts->>'bathrooms')::numeric,
      max_guests=(p_facts->>'max_guests')::integer,beds=(p_facts->>'beds')::integer,parking_spaces=(p_facts->>'parking_spaces')::integer where id=p_property and organization_id=p_org;
    perform set_config('gulera.website_save',coalesce(previous_guard,''),true);
    -- Published state is retained during draft saves. Only explicit actions change visibility.
    insert into public.property_public_listings(property_id,organization_id,profile,slug,state)
    values(p_property,p_org,p_profile,p_profile->>'slug',case when p_action in ('hide','private') then p_state when p_action='ready' then 'READY' else case when p_profile->'enabled'='true'::jsonb then 'DRAFT' else 'PRIVATE' end end)
    on conflict(property_id) do update set profile=p_profile,slug=p_profile->>'slug',revision=property_public_listings.revision+1,updated_at=now(),
      state=case when p_action in ('hide','private') then case when p_action='hide' then 'HIDDEN' else 'PRIVATE' end
        when property_public_listings.state in ('PUBLISHED','HIDDEN') then property_public_listings.state
        when p_profile->'enabled'<>'true'::jsonb then 'PRIVATE' when p_action='ready' then 'READY' else 'DRAFT' end;
    if p_action='publish' or (p_action='save' and l.state='PUBLISHED' and mode='AUTOMATIC' and public.website_profile_ready(p_profile,public.website_fact_snapshot((select p from public.properties p where id=p_property)),s)) then
      perform public.approve_website_snapshot(p_org,p_property,p_actor);
    elsif p_action in ('hide','private') and l.state='PUBLISHED' then
      update public.property_public_listings set publication_generation=publication_generation+1,hidden_at=now() where property_id=p_property and organization_id=p_org;
      perform public.enqueue_website_sync(p_org,p_property,'unpublish');
    end if;
  end if;
  insert into public.audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id,metadata)
    select p_actor,p_org,'website_listing_'||p_action,'property',p_property::text,
      jsonb_build_object('from',l.state,'to',state,'draftRevision',revision,'publishedRevision',published_revision,'mode',coalesce(mode,'MANUAL_APPROVAL'),
        'changed_public_fields',(select coalesce(jsonb_agg(key),'[]'::jsonb) from jsonb_each(p_profile) where key<>'locationKey' and value is distinct from l.profile->key),
        'changed_property_facts',(select coalesce(jsonb_agg(key),'[]'::jsonb) from jsonb_each(p_facts) where value is distinct from f->key))
    from public.property_public_listings where property_id=p_property and organization_id=p_org;
end $$;

create or replace function public.website_property_facts_changed() returns trigger language plpgsql security definer set search_path=public as $$
declare l public.property_public_listings; s jsonb; mode text;
begin
  if current_setting('gulera.website_save',true)=new.id::text or public.website_fact_snapshot(new)=public.website_fact_snapshot(old) then return new; end if;
  select * into l from public.property_public_listings where property_id=new.id and organization_id=new.organization_id for update;
  if not found then return new; end if;
  update public.property_public_listings set revision=revision+1,updated_at=now() where property_id=new.id and organization_id=new.organization_id;
  select settings,publishing_mode into s,mode from public.website_connections where organization_id=new.organization_id;
  if mode='AUTOMATIC' and l.state='PUBLISHED' and public.website_profile_ready(l.profile,public.website_fact_snapshot(new),s) then perform public.approve_website_snapshot(new.organization_id,new.id,auth.uid()); end if;
  insert into public.audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id,metadata)
    values(auth.uid(),new.organization_id,'website_property_facts_changed','property',new.id::text,jsonb_build_object('approvalMode',coalesce(mode,'MANUAL_APPROVAL')));
  return new;
end $$;

create or replace function public.save_website_connection(p_org uuid,p_actor uuid,p_connection jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare c public.website_connections;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
  insert into public.website_connections(organization_id,name,website_url,connector_type,enabled,auto_update,status,settings,publishing_mode,configuration)
  values(p_org,p_connection->>'name',p_connection->>'website_url',p_connection->>'connector_type',(p_connection->>'enabled')::boolean,(p_connection->>'auto_update')::boolean,p_connection->>'status',p_connection->'settings',coalesce(p_connection->>'publishing_mode','MANUAL_APPROVAL'),coalesce(p_connection->'configuration','{"adapter":"GENERIC","transport":"UNCONFIGURED"}'))
  on conflict(organization_id) do update set name=excluded.name,website_url=excluded.website_url,connector_type=excluded.connector_type,enabled=excluded.enabled,auto_update=excluded.auto_update,status=excluded.status,settings=excluded.settings,publishing_mode=excluded.publishing_mode,configuration=excluded.configuration,config_revision=website_connections.config_revision+1,updated_at=now()
  returning * into c;
  insert into public.audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id,metadata) values(p_actor,p_org,'website_connection_saved','organization',p_org::text,jsonb_build_object('publishingMode',c.publishing_mode));
  perform public.enqueue_website_sync(p_org,property_id,case when state='PUBLISHED' then 'update' else 'unpublish' end) from public.property_public_listings where organization_id=p_org and publication_generation>0;
end $$;

create function public.claim_website_jobs(p_org uuid,p_limit integer,p_token uuid,p_manual boolean default false)
returns setof public.website_sync_jobs language plpgsql security definer set search_path=public as $$
begin
  -- Expired final attempts need attention. Other expired leases are retried with the same identity.
  update public.website_sync_jobs set status='DEAD',last_error='WORKER_LEASE_EXPIRED',lease_token=null,lease_until=null where status='RUNNING' and lease_until<now() and attempts>=5 and (p_org is null or organization_id=p_org);
  update public.website_sync_jobs j set status='SUPERSEDED',completed_at=now(),lease_token=null,lease_until=null
  from public.property_public_listings l,public.website_connections c where j.property_id=l.property_id and j.organization_id=l.organization_id and j.connection_id=c.id and (p_org is null or j.organization_id=p_org)
    and j.status in ('PENDING','FAILED','DEAD','RUNNING') and (j.status<>'RUNNING' or j.lease_until<now()) and (j.generation<>l.publication_generation or j.config_revision<>c.config_revision);
  return query with eligible as (
    select j.id from public.website_sync_jobs j join public.website_connections c on c.id=j.connection_id and c.organization_id=j.organization_id
    where (p_org is null or j.organization_id=p_org) and c.enabled and (p_manual or c.auto_update)
      and ((j.status in ('PENDING','FAILED') and j.next_retry_at<=now()) or (j.status='RUNNING' and j.lease_until<now())) and j.attempts<5
      and not exists(select 1 from public.website_sync_jobs other where other.connection_id=j.connection_id and other.property_id=j.property_id and other.status='RUNNING' and other.lease_until>=now())
    order by j.sequence limit greatest(1,least(p_limit,20)) for update of j skip locked
  ) update public.website_sync_jobs j set status='RUNNING',lease_token=p_token,lease_until=now()+interval '120 seconds',attempts=attempts+1 from eligible e where j.id=e.id returning j.*;
end $$;

create function public.finish_website_job(p_job uuid,p_token uuid,p_ok boolean,p_error text,p_remote_id text,p_remote_url text,p_actor uuid default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare j public.website_sync_jobs; l public.property_public_listings; c public.website_connections; stale boolean;
begin
  select * into j from public.website_sync_jobs where id=p_job and status='RUNNING' and lease_token=p_token and lease_until>=now() for update;
  if not found then return false; end if;
  select * into l from public.property_public_listings where property_id=j.property_id and organization_id=j.organization_id for update;
  select * into c from public.website_connections where id=j.connection_id and organization_id=j.organization_id;
  stale:=j.generation<>l.publication_generation or j.config_revision<>c.config_revision or not c.enabled;
  update public.website_sync_jobs set status=case when stale then 'SUPERSEDED' when p_ok then 'SUCCEEDED' when attempts>=5 then 'DEAD' else 'FAILED' end,
    last_error=case when not p_ok then left(p_error,100) end,next_retry_at=now()+make_interval(secs=>least(3600,30*power(2,greatest(0,attempts-1)))::integer),
    completed_at=now(),lease_token=null,lease_until=null where id=p_job;
  if p_ok and not stale then
    insert into public.website_remote_resources(connection_id,property_id,organization_id,remote_resource_id,remote_url,last_pushed_revision,last_generation,last_successful_sync)
    values(j.connection_id,j.property_id,j.organization_id,left(p_remote_id,200),left(p_remote_url,2048),j.publication_revision,j.generation,now())
    on conflict(connection_id,property_id) do update set remote_resource_id=coalesce(excluded.remote_resource_id,website_remote_resources.remote_resource_id),remote_url=excluded.remote_url,last_pushed_revision=excluded.last_pushed_revision,last_generation=excluded.last_generation,last_successful_sync=now();
    update public.property_public_listings set last_sync_at=now() where property_id=j.property_id and organization_id=j.organization_id;
    update public.website_connections set last_successful_sync=now() where id=j.connection_id;
  end if;
  insert into public.audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id,metadata) values(p_actor,j.organization_id,'website_sync_attempt','website_sync_job',j.id::text,jsonb_build_object('generation',j.generation,'attempt',j.attempts,'ok',p_ok,'superseded',stale));
  return true;
end $$;

create function public.retry_website_jobs(p_org uuid,p_property uuid,p_actor uuid) returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  update public.website_sync_jobs j set status='PENDING',attempts=0,next_retry_at=now(),last_error=null from public.property_public_listings l,public.website_connections c
    where j.organization_id=p_org and (p_property is null or j.property_id=p_property) and j.property_id=l.property_id and j.connection_id=c.id and j.generation=l.publication_generation and j.config_revision=c.config_revision and j.status in ('FAILED','DEAD');
  get diagnostics n=row_count;
  insert into public.audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id,metadata) values(p_actor,p_org,'website_sync_manual_retry','organization',p_org::text,jsonb_build_object('jobs',n));
  return n;
end $$;

create function public.record_website_connection_test(p_org uuid,p_actor uuid,p_revision integer,p_ok boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.website_connections set last_test_at=now(),last_test_result=jsonb_build_object('ok',p_ok,'code',case when p_ok then 'AVAILABLE' else 'NOT_CONFIGURED' end)
    where organization_id=p_org and config_revision=p_revision;
  if not found then raise exception 'Connection changed; reload before testing' using errcode='40001'; end if;
  insert into public.audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id,metadata) values(p_actor,p_org,'website_connection_test','organization',p_org::text,jsonb_build_object('ok',p_ok));
end $$;

-- Legacy processor must not bypass leases/idempotency/status. Retained as an explicit migration guard.
create or replace function public.process_internal_website_jobs(p_org uuid,p_actor uuid) returns integer language plpgsql security definer set search_path=public as $$
begin raise exception 'Use the versioned Website Publishing worker'; end $$;

create function public.website_public_page(p_org uuid,p_slug text,p_collection text,p_location text,p_featured boolean,p_limit integer,p_offset integer)
returns setof public.property_public_listings language sql stable security definer set search_path=public as $$
  select l.* from public.property_public_listings l where l.organization_id=p_org and l.state='PUBLISHED' and l.published_profile->'enabled'='true'::jsonb and l.published_facts is not null
    and (p_slug is null or l.published_profile->>'slug'=p_slug) and (p_collection is null or p_collection=any(l.published_collections))
    and (p_location is null or l.published_location=p_location) and (p_featured is null or l.published_featured=p_featured)
  order by l.published_priority,l.listing_id limit least(greatest(p_limit,1),101) offset greatest(p_offset,0)
$$;

-- New RPCs/helpers are service-side only. The public API always reserializes an explicit DTO.
revoke all on function public.website_location_key(text),public.website_fact_snapshot(public.properties),public.website_collection_keys(jsonb,jsonb),public.website_profile_ready(jsonb,jsonb,jsonb),public.approve_website_snapshot(uuid,uuid,uuid),public.claim_website_jobs(uuid,integer,uuid,boolean),public.finish_website_job(uuid,uuid,boolean,text,text,text,uuid),public.retry_website_jobs(uuid,uuid,uuid),public.website_public_page(uuid,text,text,text,boolean,integer,integer),public.record_website_connection_test(uuid,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.claim_website_jobs(uuid,integer,uuid,boolean),public.finish_website_job(uuid,uuid,boolean,text,text,text,uuid),public.retry_website_jobs(uuid,uuid,uuid),public.website_public_page(uuid,text,text,text,boolean,integer,integer),public.record_website_connection_test(uuid,uuid,integer,boolean) to service_role;
-- Queue current approved desired states after upgrading. No new content is approved.
select public.enqueue_website_sync(organization_id,property_id,case when state='PUBLISHED' then 'update' else 'unpublish' end) from public.property_public_listings where publication_generation>0;
commit;
