begin;
alter table public.company_announcements drop constraint company_announcements_status_check;
alter table public.company_announcements add constraint company_announcements_status_check check(status in ('DRAFT','QUEUED','SCHEDULED','SENDING','COMPLETED','COMPLETED_WITH_ERRORS','CANCELLED'));
alter table public.company_announcements drop constraint company_announcements_subject_check;
alter table public.company_announcements add constraint company_announcements_subject_check check(length(subject)<=200 and subject !~ E'[\r\n]');
alter table public.company_announcements drop constraint company_announcements_message_check;
alter table public.company_announcements add constraint company_announcements_message_check check(length(message)<=20000);
alter table public.company_announcements
  add column category text not null default 'GENERAL' check(category in ('GENERAL','OWNER_UPDATE','CLEANER_UPDATE','GROUNDS_UPDATE','POLICY','SEASONAL','SURVEY','TESTIMONIAL','CUSTOM')),
  add column channel text not null default 'EMAIL' check(channel='EMAIL'),
  add column scheduled_at timestamptz,add column schedule_timezone text not null default 'America/Toronto',
  add column confirmed_at timestamptz,add column started_at timestamptz,add column completed_at timestamptz,
  add column updated_by uuid references public.profiles(id) on delete set null,
  add column selection_keys text[],add column exclusion_summary jsonb not null default '{}';
alter table public.company_announcement_recipients drop constraint company_announcement_recipients_status_check;
alter table public.company_announcement_recipients add constraint company_announcement_recipients_status_check check(status in ('DRAFT','PENDING','RUNNING','SENT','FAILED','REVIEW','SKIPPED','OPTED_OUT','EXCLUDED'));
alter table public.company_announcement_recipients add column recipient_role text not null default '',add column last_attempted_at timestamptz,add column retry_succeeded_at timestamptz;
update public.company_announcement_recipients set recipient_role=split_part(recipient_key,':',1),last_attempted_at=first_attempt_at;
update public.company_announcements set confirmed_at=queued_at,status=case when status='QUEUED' then 'SENDING' else status end,updated_by=created_by;
-- Existing drafts did not retain their selection mode. Preserve their reviewed set where it fits the individual picker.
update public.company_announcements a set selection_keys=array(select r.recipient_key from company_announcement_recipients r where r.announcement_id=a.id order by r.recipient_key)
where a.status='DRAFT' and (select count(*) from company_announcement_recipients r where r.announcement_id=a.id)<=1000;
grant select(recipient_role,last_attempted_at,retry_succeeded_at) on public.company_announcement_recipients to authenticated;
create index company_schedule_due_idx on public.company_announcements(scheduled_at) where status='SCHEDULED';
create table public.company_announcement_templates (
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 150),category text not null check(category in ('GENERAL','OWNER_UPDATE','CLEANER_UPDATE','GROUNDS_UPDATE','POLICY','SEASONAL','SURVEY','TESTIMONIAL','CUSTOM')),
  kind text not null check(kind in ('ANNOUNCEMENT','SURVEY','TESTIMONIAL')),subject text not null,message text not null,link_url text not null default '',link_label text not null default '',
  revision integer not null default 1,created_by uuid references public.profiles(id) on delete set null,updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),archived_at timestamptz
);
create table public.company_announcement_tests (
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),request_id uuid not null,payload jsonb not null,
  status text not null default 'PENDING' check(status in ('PENDING','RUNNING','SENT','FAILED')),provider_id text,
  first_attempt_at timestamptz,lease_token uuid,lease_until timestamptz,created_at timestamptz not null default now(),
  unique(organization_id,actor_id,request_id)
);
alter table public.company_announcement_templates enable row level security;
alter table public.company_announcement_tests enable row level security;
revoke all on public.company_announcement_templates,public.company_announcement_tests from anon,authenticated;
grant all on public.company_announcement_templates,public.company_announcement_tests to service_role;
grant select on public.company_announcement_templates to authenticated;
create policy admin_read on public.company_announcement_templates for select to authenticated using(exists(select 1 from organization_members m join profiles p on p.id=m.profile_id where m.organization_id=company_announcement_templates.organization_id and m.profile_id=auth.uid() and m.role='admin' and p.role in ('admin','platform_admin')));

create or replace function public.company_announcement_contacts(p_org uuid) returns table(recipient_key text,email text,full_name text,audience text) language sql security definer set search_path=public as $$
  select 'OWNERS:'||o.id,lower(trim(o.email)),coalesce(o.full_name,''),'OWNERS' from owner_accounts o where o.organization_id=p_org and coalesce(to_jsonb(o)->>'is_active','true')='true'
  union all select 'CLEANERS:'||c.id,lower(trim(c.email)),coalesce(c.display_name,''),'CLEANERS' from cleaner_accounts c where c.organization_id=p_org and coalesce(to_jsonb(c)->>'active','true')='true'
  union all select 'GROUNDS:'||g.id,lower(trim(g.email)),coalesce(g.display_name,''),'GROUNDS' from grounds_accounts g where g.organization_id=p_org and coalesce(to_jsonb(g)->>'active','true')='true'
  union all select 'ADMINS:'||p.id,lower(trim(p.email)),coalesce(p.full_name,''),'ADMINS' from organization_members m join profiles p on p.id=m.profile_id where m.organization_id=p_org and m.role='admin' and p.role in ('admin','platform_admin')
$$;
create or replace function public.save_company_announcement(p_org uuid,p_actor uuid,p_id uuid,p_revision integer,p_draft jsonb,p_recipient_keys text[]) returns uuid language plpgsql security definer set search_path=public as $save$
declare a public.company_announcements; result uuid; exclusions jsonb;
begin
  perform public.require_company_announcement_admin(p_org,p_actor);
  if p_recipient_keys is not null and (cardinality(p_recipient_keys)>1000 or exists(select 1 from unnest(p_recipient_keys) k where not exists(select 1 from company_announcement_contacts(p_org) c where c.recipient_key=k and (p_draft->>'audience'='ALL' or c.audience=p_draft->>'audience')))) then raise exception 'Choose recipients in this organization and audience' using errcode='22023'; end if;
  if p_id is null then
    if p_revision<>0 then raise exception 'Draft conflict' using errcode='40001'; end if;
    insert into company_announcements(organization_id,created_by,updated_by,kind,audience,subject,message,link_url,link_label,category,selection_keys)
    values(p_org,p_actor,p_actor,p_draft->>'kind',p_draft->>'audience',p_draft->>'subject',p_draft->>'message',coalesce(p_draft->>'linkUrl',''),coalesce(p_draft->>'linkLabel',''),coalesce(p_draft->>'category','GENERAL'),p_recipient_keys) returning id into result;
  else
    select * into a from company_announcements where id=p_id and organization_id=p_org for update;
    if a.id is null then raise exception 'Announcement not found' using errcode='P0002'; end if;
    if a.status<>'DRAFT' or a.revision<>p_revision then raise exception 'Return the schedule to draft or review the latest revision' using errcode='40001'; end if;
    update company_announcements set kind=p_draft->>'kind',audience=p_draft->>'audience',subject=p_draft->>'subject',message=p_draft->>'message',link_url=coalesce(p_draft->>'linkUrl',''),link_label=coalesce(p_draft->>'linkLabel',''),category=coalesce(p_draft->>'category','GENERAL'),selection_keys=p_recipient_keys,revision=revision+1,updated_at=now(),updated_by=p_actor where id=p_id;
    result:=p_id;delete from company_announcement_recipients where announcement_id=result;
  end if;
  insert into company_announcement_recipients(announcement_id,organization_id,recipient_key,email,full_name,recipient_role)
  select result,p_org,recipient_key,email,full_name,audience from (
    select distinct on(c.email) c.* from company_announcement_contacts(p_org) c
    where (p_draft->>'audience'='ALL' or c.audience=p_draft->>'audience') and (p_recipient_keys is null or c.recipient_key=any(p_recipient_keys))
      and length(c.email)<=254 and c.email ~* $regex$^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$$regex$
      and not exists(select 1 from company_announcement_preferences pref where pref.organization_id=p_org and pref.email=c.email)
    order by c.email,c.recipient_key
  ) contacts;
  select jsonb_build_object('optedOut',count(distinct c.email) filter(where exists(select 1 from company_announcement_preferences p where p.organization_id=p_org and p.email=c.email)),'invalid',count(*) filter(where c.email is null or c.email='' or c.email !~ '^[^,;[:space:]@]+@[^,;[:space:]@]+[.][^,;[:space:]@]+$')) into exclusions
  from company_announcement_contacts(p_org) c where (p_draft->>'audience'='ALL' or c.audience=p_draft->>'audience') and (p_recipient_keys is null or c.recipient_key=any(p_recipient_keys));
  update company_announcements set exclusion_summary=exclusions where id=result;
  insert into audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id,metadata) values(p_actor,p_org,case when p_id is null then 'company_announcement_created' else 'company_announcement_edited' end,'company_announcement',result::text,jsonb_build_object('recipient_count',(select count(*) from company_announcement_recipients where announcement_id=result)));
  return result;
end $save$;
create function public.confirm_company_announcement(p_org uuid,p_actor uuid,p_id uuid,p_revision integer,p_sender jsonb,p_scheduled timestamptz,p_zone text) returns void language plpgsql security definer set search_path=public as $$
declare a public.company_announcements;
begin
  perform public.require_company_announcement_admin(p_org,p_actor);
  select * into a from company_announcements where id=p_id and organization_id=p_org for update;
  if a.id is null then raise exception 'Announcement not found' using errcode='P0002'; end if;
  if a.revision<>p_revision then raise exception 'Review the latest draft' using errcode='40001'; end if;
  if a.status in ('SENDING','SCHEDULED','COMPLETED','COMPLETED_WITH_ERRORS') then return; end if;
  if a.status<>'DRAFT' then raise exception 'Create a new draft to send again' using errcode='22023'; end if;
  if length(trim(a.subject))=0 or length(trim(a.message))=0 or (a.kind<>'ANNOUNCEMENT' and a.link_url='') then raise exception 'Complete the message before confirming' using errcode='22023'; end if;
  if not exists(select 1 from pg_timezone_names where name=p_zone) then raise exception 'Choose a valid timezone' using errcode='22023'; end if;
  if p_scheduled is not null and (p_scheduled<now()+interval '1 minute' or p_scheduled>now()+interval '366 days') then raise exception 'Schedule between one minute and one year from now' using errcode='22023'; end if;
  update company_announcement_recipients r set status='OPTED_OUT',last_error='OPTED_OUT' where announcement_id=p_id and exists(select 1 from company_announcement_preferences p where p.organization_id=r.organization_id and p.email=r.email);
  update company_announcement_recipients r set status='SKIPPED',last_error='RECIPIENT_UNAVAILABLE' where announcement_id=p_id and status='DRAFT' and not exists(select 1 from company_announcement_contacts(p_org) c where c.recipient_key=r.recipient_key and c.email=r.email);
  if not exists(select 1 from company_announcement_recipients where announcement_id=p_id and status='DRAFT') then raise exception 'No eligible recipients remain' using errcode='22023'; end if;
  update company_announcements set status=case when p_scheduled is null then 'SENDING' else 'SCHEDULED' end,sender=p_sender,scheduled_at=p_scheduled,schedule_timezone=p_zone,confirmed_at=now(),queued_at=now(),updated_by=p_actor where id=p_id;
  update company_announcement_recipients set status='PENDING',next_attempt_at=coalesce(p_scheduled,now()) where announcement_id=p_id and status='DRAFT';
  insert into audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id,metadata) values(p_actor,p_org,case when p_scheduled is null then 'company_announcement_queued' else 'company_announcement_scheduled' end,'company_announcement',p_id::text,jsonb_build_object('revision',p_revision,'scheduled_at',p_scheduled));
end $$;
create or replace function public.queue_company_announcement(p_org uuid,p_actor uuid,p_id uuid,p_revision integer,p_sender jsonb) returns void language plpgsql security definer set search_path=public as $$
begin perform public.confirm_company_announcement(p_org,p_actor,p_id,p_revision,p_sender,null,'America/Toronto');end $$;
create function public.change_company_announcement_schedule(p_org uuid,p_actor uuid,p_id uuid,p_revision integer,p_action text) returns void language plpgsql security definer set search_path=public as $$
declare a public.company_announcements;
begin
  perform public.require_company_announcement_admin(p_org,p_actor);
  select * into a from company_announcements where id=p_id and organization_id=p_org for update;
  if a.id is null then raise exception 'Announcement not found' using errcode='P0002'; end if;
  if a.status<>'SCHEDULED' or a.revision<>p_revision or a.started_at is not null then raise exception 'Schedule has changed or sending has started' using errcode='40001'; end if;
  if p_action not in ('cancel','edit') then raise exception 'Invalid schedule action' using errcode='22023'; end if;
  update company_announcements set status=case when p_action='cancel' then 'CANCELLED' else 'DRAFT' end,scheduled_at=null,sender=null,confirmed_at=null,revision=revision+1,updated_at=now(),updated_by=p_actor where id=p_id;
  update company_announcement_recipients set status=case when p_action='cancel' then 'SKIPPED' else 'DRAFT' end,last_error=case when p_action='cancel' then 'CANCELLED' else null end where announcement_id=p_id and status in ('PENDING','OPTED_OUT');
  insert into audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id) values(p_actor,p_org,case when p_action='cancel' then 'company_announcement_schedule_cancelled' else 'company_announcement_schedule_changed' end,'company_announcement',p_id::text);
end $$;
create function public.refresh_company_announcement_state(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  update company_announcements a set status=case when exists(select 1 from company_announcement_recipients r where r.announcement_id=a.id and r.status in ('FAILED','REVIEW')) then 'COMPLETED_WITH_ERRORS' else 'COMPLETED' end,completed_at=now()
  where a.id=p_id and a.status='SENDING' and not exists(select 1 from company_announcement_recipients r where r.announcement_id=a.id and r.status in ('PENDING','RUNNING') or (r.announcement_id=a.id and r.status='FAILED' and r.attempts<5 and r.first_attempt_at>now()-interval '23 hours'));
end $$;
create or replace function public.claim_company_announcement_emails(p_org uuid,p_id uuid,p_token uuid) returns setof public.company_announcement_recipients language plpgsql security definer set search_path=public as $$
declare campaign uuid;
begin
  -- Campaign row locks serialize schedule cancellation/edits with the first claim.
  for campaign in select id from company_announcements where (p_org is null or organization_id=p_org) and (p_id is null or id=p_id) and status in ('SCHEDULED','SENDING') and coalesce(scheduled_at,now())<=now() order by coalesce(scheduled_at,queued_at),id limit 10 for update skip locked loop
    update company_announcements set status='SENDING',started_at=coalesce(started_at,now()) where id=campaign;
    update company_announcement_recipients r set status='OPTED_OUT',last_error='OPTED_OUT',lease_token=null,lease_until=null where announcement_id=campaign and status in ('PENDING','FAILED','RUNNING') and (lease_until is null or lease_until<now()) and exists(select 1 from company_announcement_preferences p where p.organization_id=r.organization_id and p.email=r.email);
    update company_announcement_recipients r set status='SKIPPED',last_error='RECIPIENT_UNAVAILABLE',lease_token=null,lease_until=null where announcement_id=campaign and status in ('PENDING','FAILED','RUNNING') and (lease_until is null or lease_until<now()) and not exists(select 1 from company_announcement_contacts(r.organization_id) c where c.recipient_key=r.recipient_key and c.email=r.email);
    update company_announcement_recipients set status='REVIEW',last_error='DELIVERY_REQUIRES_REVIEW',lease_token=null,lease_until=null where announcement_id=campaign and status in ('PENDING','FAILED','RUNNING') and (lease_until is null or lease_until<now()) and (first_attempt_at<now()-interval '23 hours' or attempts>=5);
    perform public.refresh_company_announcement_state(campaign);
  end loop;
  return query with due as (
    select r.id from company_announcement_recipients r join company_announcements a on a.id=r.announcement_id and a.organization_id=r.organization_id
    where a.status='SENDING' and (p_org is null or r.organization_id=p_org) and (p_id is null or r.announcement_id=p_id)
      and ((r.status in ('PENDING','FAILED') and r.next_attempt_at<=now()) or (r.status='RUNNING' and r.lease_until<now()))
      and r.attempts<5 and (r.first_attempt_at is null or r.first_attempt_at>now()-interval '23 hours')
    order by r.next_attempt_at,r.id limit 5 for update of r skip locked
  ) update company_announcement_recipients r set status='RUNNING',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),last_attempted_at=now(),lease_token=p_token,lease_until=now()+interval '2 minutes' from due where r.id=due.id returning r.*;
end $$;
create or replace function public.finish_company_announcement_email(p_id uuid,p_token uuid,p_provider_id text,p_error text) returns void language plpgsql security definer set search_path=public as $$
declare r public.company_announcement_recipients;
begin
  select * into r from company_announcement_recipients where id=p_id and status='RUNNING' and lease_token=p_token and lease_until>now() for update;
  if r.id is null then return; end if;
  update company_announcement_recipients set status=case when p_provider_id is not null then 'SENT' when p_error='OPTED_OUT' then 'OPTED_OUT' when p_error='RECIPIENT_UNAVAILABLE' then 'SKIPPED' when p_error='DELIVERY_REQUIRES_REVIEW' or attempts>=5 then 'REVIEW' else 'FAILED' end,
    provider_id=left(p_provider_id,200),sent_at=case when p_provider_id is not null then now() else null end,retry_succeeded_at=case when p_provider_id is not null and attempts>1 then now() else null end,
    last_error=case when p_provider_id is not null then null when p_error in ('OPTED_OUT','RECIPIENT_UNAVAILABLE') then p_error else 'EMAIL_SEND_FAILED' end,next_attempt_at=now()+make_interval(secs=>30*power(2,least(attempts-1,4))::integer),lease_token=null,lease_until=null where id=p_id;
  insert into audit_logs(organization_id,action_type,target_type,target_id,metadata) values(r.organization_id,case when p_provider_id is not null then 'company_announcement_email_accepted' else 'company_announcement_email_failed' end,'company_announcement',r.announcement_id::text,jsonb_build_object('recipient_id',r.id,'attempt',r.attempts));
  perform public.refresh_company_announcement_state(r.announcement_id);
end $$;
create or replace function public.retry_company_announcement(p_org uuid,p_actor uuid,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.require_company_announcement_admin(p_org,p_actor);
  perform 1 from company_announcements where id=p_id and organization_id=p_org and status in ('SENDING','COMPLETED_WITH_ERRORS') for update;
  if not found then raise exception 'No retryable broadcast' using errcode='22023'; end if;
  update company_announcement_recipients r set next_attempt_at=now() where organization_id=p_org and announcement_id=p_id and status='FAILED' and attempts<5 and first_attempt_at>now()-interval '23 hours' and not exists(select 1 from company_announcement_preferences p where p.organization_id=r.organization_id and p.email=r.email) and exists(select 1 from company_announcement_contacts(p_org) c where c.recipient_key=r.recipient_key and c.email=r.email);
  if found then update company_announcements set status='SENDING',completed_at=null where id=p_id;end if;
  insert into audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id) values(p_actor,p_org,'company_announcement_retry','company_announcement',p_id::text);
end $$;
create function public.duplicate_company_announcement(p_org uuid,p_actor uuid,p_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
  perform public.require_company_announcement_admin(p_org,p_actor);
  insert into company_announcements(organization_id,kind,audience,subject,message,link_url,link_label,category,created_by,updated_by)
  select p_org,kind,'ALL',subject,message,link_url,link_label,category,p_actor,p_actor from company_announcements where id=p_id and organization_id=p_org returning id into result;
  if result is null then raise exception 'Announcement not found' using errcode='P0002';end if;
  insert into audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id) values(p_actor,p_org,'company_announcement_duplicated','company_announcement',result::text);return result;
end $$;
create function public.manage_company_announcement_template(p_org uuid,p_actor uuid,p_id uuid,p_revision integer,p_action text,p_template jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare t public.company_announcement_templates;result uuid;
begin
  perform public.require_company_announcement_admin(p_org,p_actor);
  if p_id is not null then select * into t from company_announcement_templates where id=p_id and organization_id=p_org and archived_at is null for update;if t.id is null then raise exception 'Template not found' using errcode='P0002';end if;if t.revision<>p_revision then raise exception 'Template changed' using errcode='40001';end if;end if;
  if p_action='archive' then update company_announcement_templates set archived_at=now(),updated_at=now(),updated_by=p_actor,revision=revision+1 where id=p_id;result:=p_id;
  elsif p_action='duplicate' then insert into company_announcement_templates(organization_id,name,category,kind,subject,message,link_url,link_label,created_by,updated_by) values(p_org,left(t.name,140)||' (copy)',t.category,t.kind,t.subject,t.message,t.link_url,t.link_label,p_actor,p_actor) returning id into result;
  elsif p_action='save' then
    if p_id is null then insert into company_announcement_templates(organization_id,name,category,kind,subject,message,link_url,link_label,created_by,updated_by) values(p_org,p_template->>'name',p_template->>'category',p_template->>'kind',p_template->>'subject',p_template->>'message',coalesce(p_template->>'linkUrl',''),coalesce(p_template->>'linkLabel',''),p_actor,p_actor) returning id into result;
    else update company_announcement_templates set name=p_template->>'name',category=p_template->>'category',kind=p_template->>'kind',subject=p_template->>'subject',message=p_template->>'message',link_url=coalesce(p_template->>'linkUrl',''),link_label=coalesce(p_template->>'linkLabel',''),updated_by=p_actor,updated_at=now(),revision=revision+1 where id=p_id;result:=p_id;end if;
  else raise exception 'Unsupported template action' using errcode='22023';end if;
  insert into audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id,metadata) values(p_actor,p_org,'company_template_'||p_action,'company_template',result::text,'{}');return result;
end $$;
create function public.reserve_company_announcement_test(p_org uuid,p_actor uuid,p_request uuid,p_payload jsonb,p_token uuid) returns public.company_announcement_tests language plpgsql security definer set search_path=public as $$
declare t public.company_announcement_tests;
begin
  perform public.require_company_announcement_admin(p_org,p_actor);
  insert into company_announcement_tests(organization_id,actor_id,request_id,payload) values(p_org,p_actor,p_request,p_payload) on conflict do nothing;
  select * into t from company_announcement_tests where organization_id=p_org and actor_id=p_actor and request_id=p_request for update;
  if t.payload<>p_payload then raise exception 'Use a new test identity for edited content' using errcode='40001';end if;
  if t.status='SENT' then return t;end if;
  if t.lease_until>now() or t.first_attempt_at<now()-interval '23 hours' then raise exception 'Test is in progress or requires review' using errcode='40001';end if;
  update company_announcement_tests set status='RUNNING',first_attempt_at=coalesce(first_attempt_at,now()),lease_token=p_token,lease_until=now()+interval '2 minutes' where id=t.id returning * into t;
  insert into audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id) values(p_actor,p_org,'company_announcement_test_requested','company_test',t.id::text);return t;
end $$;
create function public.finish_company_announcement_test(p_id uuid,p_token uuid,p_provider text) returns void language plpgsql security definer set search_path=public as $$
declare t public.company_announcement_tests;
begin
  update company_announcement_tests set status=case when p_provider is null then 'FAILED' else 'SENT' end,provider_id=left(p_provider,200),lease_token=null,lease_until=null where id=p_id and lease_token=p_token and lease_until>now() returning * into t;
  if t.id is not null then insert into audit_logs(actor_profile_id,organization_id,action_type,target_type,target_id) values(t.actor_id,t.organization_id,case when p_provider is null then 'company_announcement_test_failed' else 'company_announcement_test_sent' end,'company_test',t.id::text);end if;
end $$;
create function public.company_announcement_history(p_org uuid,p_filters jsonb,p_limit integer,p_offset integer) returns setof jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object('id',a.id,'kind',a.kind,'category',a.category,'audience',a.audience,'subject',a.subject,'status',a.status,'created_at',a.created_at,'queued_at',a.queued_at,'scheduled_at',a.scheduled_at,'sender_name',coalesce(p.full_name,p.email,''),'counts',public.company_announcement_status(p_org,a.id))
  from company_announcements a left join profiles p on p.id=coalesce(a.updated_by,a.created_by) where a.organization_id=p_org
  and (coalesce(p_filters->>'q','')='' or position(lower(p_filters->>'q') in lower(a.subject))>0)
  and (coalesce(p_filters->>'status','')='' or a.status=p_filters->>'status') and (coalesce(p_filters->>'audience','')='' or a.audience=p_filters->>'audience')
  and (coalesce(p_filters->>'category','')='' or a.category=p_filters->>'category') and (coalesce(p_filters->>'kind','')='' or a.kind=p_filters->>'kind')
  and (coalesce(p_filters->>'from','')='' or a.created_at>=(p_filters->>'from')::date) and (coalesce(p_filters->>'to','')='' or a.created_at<(p_filters->>'to')::date+interval '1 day')
  and (coalesce(p_filters->>'sender','')='' or position(lower(p_filters->>'sender') in lower(coalesce(p.full_name,'')||' '||coalesce(p.email,'')))>0)
  and (coalesce(p_filters->>'recipient','')='' or exists(select 1 from company_announcement_recipients r where r.announcement_id=a.id and position(lower(p_filters->>'recipient') in lower(r.email||' '||r.full_name))>0))
  order by a.created_at desc,a.id limit greatest(1,least(p_limit,100)) offset greatest(0,least(p_offset,1000000))
$$;
revoke all on function public.confirm_company_announcement(uuid,uuid,uuid,integer,jsonb,timestamptz,text),public.change_company_announcement_schedule(uuid,uuid,uuid,integer,text),public.refresh_company_announcement_state(uuid),public.duplicate_company_announcement(uuid,uuid,uuid),public.manage_company_announcement_template(uuid,uuid,uuid,integer,text,jsonb),public.reserve_company_announcement_test(uuid,uuid,uuid,jsonb,uuid),public.finish_company_announcement_test(uuid,uuid,text),public.company_announcement_history(uuid,jsonb,integer,integer) from public,anon,authenticated;
grant execute on function public.confirm_company_announcement(uuid,uuid,uuid,integer,jsonb,timestamptz,text),public.change_company_announcement_schedule(uuid,uuid,uuid,integer,text),public.duplicate_company_announcement(uuid,uuid,uuid),public.manage_company_announcement_template(uuid,uuid,uuid,integer,text,jsonb),public.reserve_company_announcement_test(uuid,uuid,uuid,jsonb,uuid),public.finish_company_announcement_test(uuid,uuid,text),public.company_announcement_history(uuid,jsonb,integer,integer) to service_role;
create function public.company_announcement_delivery_eligibility(p_org uuid,p_key text,p_email text) returns text language sql security definer set search_path=public as $$
  select case when exists(select 1 from company_announcement_preferences p where p.organization_id=p_org and p.email=p_email) then 'OPTED_OUT'
  when not exists(select 1 from company_announcement_contacts(p_org) c where c.recipient_key=p_key and c.email=p_email) then 'RECIPIENT_UNAVAILABLE' else null end
$$;
create function public.company_announcement_review(p_org uuid,p_id uuid) returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object('eligible',count(*) filter(where reason is null),'optedOut',count(*) filter(where reason='OPTED_OUT'),'unavailable',count(*) filter(where reason='RECIPIENT_UNAVAILABLE'))
  from (select company_announcement_delivery_eligibility(p_org,r.recipient_key,r.email) reason from company_announcement_recipients r where r.organization_id=p_org and r.announcement_id=p_id and r.status='DRAFT') review
$$;
revoke all on function public.company_announcement_delivery_eligibility(uuid,text,text),public.company_announcement_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.company_announcement_delivery_eligibility(uuid,text,text),public.company_announcement_review(uuid,uuid) to service_role;
create function public.company_announcement_delivery_check(p_org uuid,p_id uuid,p_token uuid) returns text language plpgsql security definer set search_path=public as $$
declare r public.company_announcement_recipients;
begin
  select * into r from company_announcement_recipients where organization_id=p_org and id=p_id and status='RUNNING' and lease_token=p_token and lease_until>now()+interval '10 seconds';
  if r.id is null then return 'LEASE_EXPIRED';end if;
  if r.first_attempt_at<now()-interval '23 hours' then return 'DELIVERY_REQUIRES_REVIEW';end if;
  return public.company_announcement_delivery_eligibility(p_org,r.recipient_key,r.email);
end $$;
revoke all on function public.company_announcement_delivery_check(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.company_announcement_delivery_check(uuid,uuid,uuid) to service_role;
commit;
