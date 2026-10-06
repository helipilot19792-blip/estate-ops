begin;
create table public.company_announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check(kind in ('ANNOUNCEMENT','SURVEY','TESTIMONIAL')),
  audience text not null check(audience in ('ALL','OWNERS','CLEANERS','GROUNDS','ADMINS')),
  subject text not null check(length(subject) between 1 and 200 and subject !~ E'[\r\n]'),
  message text not null check(length(message) between 1 and 20000),
  link_url text not null default '',link_label text not null default '',
  status text not null default 'DRAFT' check(status in ('DRAFT','QUEUED')),
  revision integer not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),queued_at timestamptz,
  sender jsonb,
  unique(id,organization_id)
);
create table public.company_announcement_recipients (
  id uuid primary key default gen_random_uuid(),announcement_id uuid not null,organization_id uuid not null,
  recipient_key text not null,
  email text not null,full_name text not null default '',
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  status text not null default 'DRAFT' check(status in ('DRAFT','PENDING','RUNNING','SENT','FAILED','REVIEW','SKIPPED')),
  attempts integer not null default 0,first_attempt_at timestamptz,next_attempt_at timestamptz not null default now(),
  lease_token uuid,lease_until timestamptz,provider_id text,last_error text,sent_at timestamptz,
  foreign key(announcement_id,organization_id) references public.company_announcements(id,organization_id) on delete cascade,
  unique(announcement_id,email)
);
create table public.company_announcement_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,opted_out_at timestamptz not null default now(),primary key(organization_id,email)
);
create index company_announcements_org_idx on public.company_announcements(organization_id,created_at desc);
create index company_announcement_due_idx on public.company_announcement_recipients(next_attempt_at) where status in ('PENDING','FAILED','RUNNING');
alter table public.company_announcements enable row level security;
alter table public.company_announcement_recipients enable row level security;
alter table public.company_announcement_preferences enable row level security;
revoke all on public.company_announcements,public.company_announcement_recipients,public.company_announcement_preferences from anon,authenticated;
grant select on public.company_announcements,public.company_announcement_preferences to authenticated;
grant select(id,announcement_id,organization_id,recipient_key,email,full_name,status,attempts,first_attempt_at,next_attempt_at,provider_id,last_error,sent_at) on public.company_announcement_recipients to authenticated;
grant all on public.company_announcements,public.company_announcement_recipients,public.company_announcement_preferences to service_role;
create policy admin_read on public.company_announcements for select to authenticated using(exists(select 1 from public.organization_members m join public.profiles p on p.id=m.profile_id where m.organization_id=company_announcements.organization_id and m.profile_id=auth.uid() and m.role='admin' and p.role in ('admin','platform_admin')));
create policy admin_read on public.company_announcement_recipients for select to authenticated using(exists(select 1 from public.organization_members m join public.profiles p on p.id=m.profile_id where m.organization_id=company_announcement_recipients.organization_id and m.profile_id=auth.uid() and m.role='admin' and p.role in ('admin','platform_admin')));
create policy admin_read on public.company_announcement_preferences for select to authenticated using(exists(select 1 from public.organization_members m join public.profiles p on p.id=m.profile_id where m.organization_id=company_announcement_preferences.organization_id and m.profile_id=auth.uid() and m.role='admin' and p.role in ('admin','platform_admin')));

create function public.require_company_announcement_admin(p_org uuid,p_actor uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from organization_members m join profiles p on p.id=m.profile_id where m.organization_id=p_org and m.profile_id=p_actor and m.role='admin' and p.role in ('admin','platform_admin')) then raise exception 'Admin membership required' using errcode='42501'; end if;
end $$;
-- Recipient identities are drawn exclusively from this tenant's existing account directories.
create function public.company_announcement_contacts(p_org uuid) returns table(recipient_key text,email text,full_name text,audience text) language sql security definer set search_path=public as $$
  select 'OWNERS:'||o.id,lower(trim(o.email)),coalesce(o.full_name,''),'OWNERS' from owner_accounts o where o.organization_id=p_org
  union all select 'CLEANERS:'||c.id,lower(trim(c.email)),coalesce(c.display_name,''),'CLEANERS' from cleaner_accounts c where c.organization_id=p_org
  union all select 'GROUNDS:'||g.id,lower(trim(g.email)),coalesce(g.display_name,''),'GROUNDS' from grounds_accounts g where g.organization_id=p_org
  union all select 'ADMINS:'||p.id,lower(trim(p.email)),coalesce(p.full_name,''),'ADMINS' from organization_members m join profiles p on p.id=m.profile_id where m.organization_id=p_org and m.role='admin' and p.role in ('admin','platform_admin')
$$;
create function public.save_company_announcement(p_org uuid,p_actor uuid,p_id uuid,p_revision integer,p_draft jsonb,p_recipient_keys text[]) returns uuid language plpgsql security definer set search_path=public as $save$
declare a public.company_announcements; result uuid;
begin
  perform public.require_company_announcement_admin(p_org,p_actor);
  if p_recipient_keys is not null and (cardinality(p_recipient_keys)=0 or cardinality(p_recipient_keys)>1000 or exists(select 1 from unnest(p_recipient_keys) t(id) where not exists(select 1 from company_announcement_contacts(p_org) o where o.recipient_key=t.id and (p_draft->>'audience'='ALL' or o.audience=p_draft->>'audience')))) then raise exception 'Choose recipients in this organization and audience' using errcode='22023'; end if;
  if p_id is null then
    if p_revision<>0 then raise exception 'Draft conflict' using errcode='40001'; end if;
    insert into company_announcements(organization_id,created_by,kind,audience,subject,message,link_url,link_label) values(p_org,p_actor,p_draft->>'kind',p_draft->>'audience',p_draft->>'subject',p_draft->>'message',coalesce(p_draft->>'linkUrl',''),coalesce(p_draft->>'linkLabel','')) returning id into result;
  else
    select * into a from company_announcements where id=p_id and organization_id=p_org for update;
    if a.id is null then raise exception 'Announcement not found' using errcode='P0002'; end if;
    if a.status<>'DRAFT' or a.revision<>p_revision then raise exception 'Draft changed or is already queued' using errcode='40001'; end if;
    update company_announcements set kind=p_draft->>'kind',audience=p_draft->>'audience',subject=p_draft->>'subject',message=p_draft->>'message',link_url=coalesce(p_draft->>'linkUrl',''),link_label=coalesce(p_draft->>'linkLabel',''),revision=revision+1,updated_at=now() where id=p_id;
    result:=p_id;
    delete from company_announcement_recipients where announcement_id=result;
  end if;
  insert into company_announcement_recipients(announcement_id,organization_id,recipient_key,email,full_name)
  select result,p_org,recipient_key,email,coalesce(full_name,'') from (
    select distinct on(o.email) o.recipient_key,o.email,o.full_name
    from company_announcement_contacts(p_org) o where (p_draft->>'audience'='ALL' or o.audience=p_draft->>'audience') and (p_recipient_keys is null or o.recipient_key=any(p_recipient_keys))
      and length(trim(o.email))<=254 and trim(o.email) ~* $regex$^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$$regex$
      and not exists(select 1 from company_announcement_preferences pref where pref.organization_id=p_org and pref.email=lower(trim(o.email)))
    order by o.email,o.recipient_key
  ) owners;
  if not exists(select 1 from company_announcement_recipients where announcement_id=result) then raise exception 'No eligible email addresses' using errcode='22023'; end if;
  insert into audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id,metadata) values(p_actor,p_org,'company_announcement_saved','company_announcement',result::text,jsonb_build_object('recipient_count',(select count(*) from company_announcement_recipients where announcement_id=result)));
  return result;
end $save$;
create function public.queue_company_announcement(p_org uuid,p_actor uuid,p_id uuid,p_revision integer,p_sender jsonb) returns void language plpgsql security definer set search_path=public as $$
declare a public.company_announcements;
begin
  perform public.require_company_announcement_admin(p_org,p_actor);
  select * into a from company_announcements where id=p_id and organization_id=p_org for update;
  if a.id is null then raise exception 'Announcement not found' using errcode='P0002'; end if;
  if a.revision<>p_revision then raise exception 'Review the latest draft' using errcode='40001'; end if;
  if a.status='QUEUED' then return; end if;
  if not exists(select 1 from company_announcement_recipients where announcement_id=p_id) then raise exception 'No recipients' using errcode='22023'; end if;
  update company_announcements set status='QUEUED',sender=p_sender,queued_at=now(),updated_at=now() where id=p_id;
  update company_announcement_recipients set status='PENDING' where announcement_id=p_id and status='DRAFT';
  insert into audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id,metadata) values(p_actor,p_org,'company_announcement_queued','company_announcement',p_id::text,jsonb_build_object('revision',p_revision,'recipient_count',(select count(*) from company_announcement_recipients where announcement_id=p_id)));
end $$;
create function public.claim_company_announcement_emails(p_org uuid,p_id uuid,p_token uuid) returns setof public.company_announcement_recipients language plpgsql security definer set search_path=public as $$
begin
  -- Provider idempotency expires after 24h. Never blindly resend an uncertain old attempt.
  update company_announcement_recipients r set status='REVIEW',last_error='DELIVERY_REQUIRES_REVIEW',lease_token=null,lease_until=null
  where (p_org is null or r.organization_id=p_org) and (p_id is null or r.announcement_id=p_id)
    and r.status in ('PENDING','FAILED','RUNNING') and (r.lease_until is null or r.lease_until<now())
    and (r.first_attempt_at<now()-interval '23 hours' or r.attempts>=5);
  update company_announcement_recipients r set status='SKIPPED',last_error='RECIPIENT_UNAVAILABLE_OR_OPTED_OUT',lease_token=null,lease_until=null
  where (p_org is null or r.organization_id=p_org) and (p_id is null or r.announcement_id=p_id)
    and r.status in ('PENDING','FAILED','RUNNING') and (r.lease_until is null or r.lease_until<now())
    and (exists(select 1 from company_announcement_preferences pref where pref.organization_id=r.organization_id and pref.email=r.email)
      or not exists(select 1 from company_announcement_contacts(r.organization_id) o where o.recipient_key=r.recipient_key and o.email=r.email));
  return query with due as (
    select r.id from company_announcement_recipients r join company_announcements a on a.id=r.announcement_id and a.organization_id=r.organization_id
    where a.status='QUEUED' and (p_org is null or r.organization_id=p_org) and (p_id is null or r.announcement_id=p_id)
      and ((r.status in ('PENDING','FAILED') and r.next_attempt_at<=now()) or (r.status='RUNNING' and r.lease_until<now()))
    order by r.next_attempt_at,r.id limit 5 for update of r skip locked
  ) update company_announcement_recipients r set status='RUNNING',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease_token=p_token,lease_until=now()+interval '2 minutes' from due where r.id=due.id returning r.*;
end $$;
create function public.finish_company_announcement_email(p_id uuid,p_token uuid,p_provider_id text,p_error text) returns void language plpgsql security definer set search_path=public as $$
declare r public.company_announcement_recipients;
begin
  select * into r from company_announcement_recipients where id=p_id and status='RUNNING' and lease_token=p_token and lease_until>now() for update;
  if r.id is null then return; end if;
  update company_announcement_recipients set status=case when p_provider_id is not null then 'SENT' when attempts>=5 then 'REVIEW' else 'FAILED' end,
    provider_id=left(p_provider_id,200),sent_at=case when p_provider_id is not null then now() else null end,
    last_error=case when p_provider_id is not null then null else 'EMAIL_SEND_FAILED' end,
    next_attempt_at=now()+make_interval(secs=>30*power(2,least(attempts-1,4))::integer),lease_token=null,lease_until=null where id=p_id;
  insert into audit_logs(organization_id,action_type,target_type,target_id,metadata) values(r.organization_id,case when p_provider_id is not null then 'company_announcement_email_accepted' else 'company_announcement_email_failed' end,'company_announcement',r.announcement_id::text,jsonb_build_object('recipient_id',r.id,'attempt',r.attempts));
end $$;
create function public.retry_company_announcement(p_org uuid,p_actor uuid,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.require_company_announcement_admin(p_org,p_actor);
  update company_announcement_recipients set next_attempt_at=now() where organization_id=p_org and announcement_id=p_id and status='FAILED' and attempts<5 and first_attempt_at>now()-interval '23 hours';
  insert into audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id) values(p_actor,p_org,'company_announcement_retry','company_announcement',p_id::text);
end $$;
create function public.unsubscribe_company_announcements(p_token uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  insert into company_announcement_preferences(organization_id,email) select organization_id,email from company_announcement_recipients where unsubscribe_token=p_token on conflict do nothing;
end $$;
create function public.company_announcement_status(p_org uuid,p_id uuid) returns jsonb language sql security definer set search_path=public as $$
  select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from (select status,count(*) n from company_announcement_recipients where organization_id=p_org and announcement_id=p_id group by status) counts
$$;
revoke all on function public.company_announcement_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.company_announcement_status(uuid,uuid) to service_role;
revoke all on function public.company_announcement_contacts(uuid),public.require_company_announcement_admin(uuid,uuid),public.save_company_announcement(uuid,uuid,uuid,integer,jsonb,text[]),public.queue_company_announcement(uuid,uuid,uuid,integer,jsonb),public.claim_company_announcement_emails(uuid,uuid,uuid),public.finish_company_announcement_email(uuid,uuid,text,text),public.retry_company_announcement(uuid,uuid,uuid),public.unsubscribe_company_announcements(uuid) from public,anon,authenticated;
grant execute on function public.company_announcement_contacts(uuid),public.save_company_announcement(uuid,uuid,uuid,integer,jsonb,text[]),public.queue_company_announcement(uuid,uuid,uuid,integer,jsonb),public.claim_company_announcement_emails(uuid,uuid,uuid),public.finish_company_announcement_email(uuid,uuid,text,text),public.retry_company_announcement(uuid,uuid,uuid),public.unsubscribe_company_announcements(uuid) to service_role;
commit;
