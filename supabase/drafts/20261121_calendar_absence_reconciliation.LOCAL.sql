-- LOCAL ONLY: additive extension of the existing snapshot/cancellation pipeline.
-- Apply the cancelled-booking overlap draft first. No production execution here.
create table public.calendar_absence_evidence (
 calendar_id uuid not null, booking_id uuid not null, organization_id uuid not null,
 property_id uuid not null, first_missing_at timestamptz not null,
 last_counted_at timestamptz not null, last_observed_at timestamptz not null,
 observation_count integer not null check(observation_count>0), last_token uuid not null,
 snapshot_hash text not null, primary key(calendar_id,booking_id)
);
alter table public.calendar_absence_evidence enable row level security;
revoke all on public.calendar_absence_evidence from public,anon,authenticated;
grant all on public.calendar_absence_evidence to service_role;

create function public.calendar_reconcile_absences(p_org uuid,p_property uuid,p_calendar uuid,p_token uuid,p_hash text,p_events jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $body$
declare marker jsonb; missing integer; baseline integer; b property_booking_events;
 evidence calendar_absence_evidence; change_id uuid; eligible boolean;
begin
 -- Only the fresh-download entry point establishes this transaction-local marker.
 marker:=nullif(current_setting('gulera.calendar_observation',true),'')::jsonb;
 if marker is null or marker->>'token' is distinct from p_token::text
  or marker->>'calendar' is distinct from p_calendar::text
  or marker->>'organization' is distinct from p_org::text
  or marker->>'property' is distinct from p_property::text
  or marker->>'hash' is distinct from p_hash then return; end if;
 if not exists(select 1 from calendar_sync_leases where property_id=p_property and organization_id=p_org and token=p_token and expires_at>now())
  or not exists(select 1 from calendar_sync_feeds where calendar_id=p_calendar and organization_id=p_org and snapshot_hash=p_hash and state='completed') then
  raise exception 'Observation scope/fence mismatch'; end if;
 -- Reappearance resets evidence. Untrusted, empty or discontinuous downloads never count.
 delete from calendar_absence_evidence a where a.calendar_id=p_calendar and a.organization_id=p_org
  and (exists(select 1 from jsonb_array_elements(p_events)e where e->>'uid'=(select external_uid from property_booking_events where id=a.booking_id))
   or a.last_observed_at<now()-interval '20 minutes');
 if marker->>'fresh' is distinct from 'true' or jsonb_array_length(p_events)=0 then
  delete from calendar_absence_evidence where calendar_id=p_calendar and organization_id=p_org;
  return;
 end if;
 select count(*),count(*) filter(where not exists(select 1 from jsonb_array_elements(p_events)e where e->>'uid'=x.external_uid))
 into baseline,missing from property_booking_events x
 where x.organization_id=p_org and x.property_id=p_property and x.property_calendar_id=p_calendar
  and x.calendar_cancelled_at is null and x.checkout_date >= (now() at time zone 'America/Toronto')::date;
 -- A single missing reservation is allowed; larger simultaneous drops are quarantined.
 if missing>greatest(1,floor(baseline*0.25)::integer) then
  delete from calendar_absence_evidence where calendar_id=p_calendar and organization_id=p_org;
  return;
 end if;
 for b in select x.* from property_booking_events x
  where x.organization_id=p_org and x.property_id=p_property and x.property_calendar_id=p_calendar
   and x.calendar_cancelled_at is null and x.checkout_date >= (now() at time zone 'America/Toronto')::date
   and not exists(select 1 from jsonb_array_elements(p_events)e where e->>'uid'=x.external_uid)
   and exists(select 1 from calendar_sync_imports i where i.calendar_id=p_calendar and i.external_uid=x.external_uid
    and i.organization_id=p_org and i.property_id=p_property and i.booking_id=x.id)
 loop
  select exists(select 1 from turnover_jobs j where j.booking_event_id=b.id and j.organization_id=p_org and j.property_id=p_property
   and j.status not in('cancelled','completed','in_progress')
   and not exists(select 1 from turnover_job_slots s where s.job_id=j.id and (s.status in('completed','in_progress') or s.payment_status is distinct from 'unpaid' or coalesce(s.paid_amount,0)<>0))
   and not exists(select 1 from cleaner_payment_records p where p.job_id=j.id)
   and not exists(select 1 from turnover_job_slots s left join cleaner_accounts a on a.id=s.cleaner_account_id and a.organization_id=p_org
    where s.job_id=j.id and s.status in('offered','accepted') and a.id is null)
   and not exists(select 1 from calendar_sync_changes c where c.organization_id=p_org and c.property_id=p_property
    and c.external_uid=b.external_uid and c.state='rejected' and c.reason='booking_cancelled')) into eligible;
  if not eligible then
   delete from calendar_absence_evidence where calendar_id=p_calendar and booking_id=b.id;
   continue;
  end if;
  insert into calendar_absence_evidence values(p_calendar,b.id,p_org,p_property,now(),now(),now(),1,p_token,p_hash)
  on conflict(calendar_id,booking_id) do update set
   last_observed_at=now(),snapshot_hash=p_hash,last_token=p_token,
   observation_count=calendar_absence_evidence.observation_count+case when calendar_absence_evidence.last_token<>p_token and calendar_absence_evidence.last_counted_at<=now()-interval '15 minutes' then 1 else 0 end,
   last_counted_at=case when calendar_absence_evidence.last_token<>p_token and calendar_absence_evidence.last_counted_at<=now()-interval '15 minutes' then now() else calendar_absence_evidence.last_counted_at end
  returning * into evidence;
  if evidence.observation_count>=3 and evidence.first_missing_at<=now()-interval '30 minutes' then
   -- Create the ordinary cancellation proposal and retire work through its atomic archive/outbox path.
   insert into calendar_sync_changes(organization_id,property_id,calendar_id,external_uid,snapshot_hash,reason,proposal)
   select p_org,p_property,p_calendar,b.external_uid,p_hash,'booking_cancelled',jsonb_build_object('source',b.source,'job_id',j.id,'booking_id',b.id,'previous_date',j.scheduled_for,'evidence','repeated_fresh_absence')
   from turnover_jobs j where j.booking_event_id=b.id and j.organization_id=p_org and j.property_id=p_property and j.status<>'cancelled'
   on conflict(calendar_id,external_uid,snapshot_hash,reason) do update set proposal=excluded.proposal,
    state=case when calendar_sync_changes.state='obsolete' then 'review' else calendar_sync_changes.state end
   returning id into change_id;
   if change_id is not null then perform calendar_apply_change_internal(change_id,p_org,null,false); end if;
  end if;
 end loop;
end $body$;
revoke all on function public.calendar_reconcile_absences(uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.calendar_reconcile_absences(uuid,uuid,uuid,uuid,text,jsonb) to service_role;

-- Keep the current capture/date-change wrappers and authorization intact.
DO $patch$
declare definition text; old text; replacement text;
begin
 definition:=pg_get_functiondef('public.calendar_capture_snapshot_review(uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure);
 old:=' for e in select value from jsonb_array_elements(p_events) loop';
 if (length(definition)-length(replace(definition,old,'')))/length(old)<>1 then raise exception 'Capture source differs; stop'; end if;
 replacement:=' perform calendar_reconcile_absences(p_org,p_property,p_calendar,p_token,p_hash,p_events);'||E'\n'||old;
 execute replace(definition,old,replacement);
 definition:=pg_get_functiondef('public.calendar_apply_change_internal(uuid,uuid,uuid,boolean)'::regprocedure);
 old:='then raise exception ''Cancellation/date change requires confirmation''; end if;';
 if (length(definition)-length(replace(definition,old,'')))/length(old)<>1 then raise exception 'Cancellation source differs; stop'; end if;
 replacement:='and not(c.reason=''booking_cancelled'' and public.calendar_absence_authorized(c.id,p_org)) '||old;
 execute replace(definition,old,replacement);
end $patch$;

create function public.calendar_absence_authorized(p_change uuid,p_org uuid) returns boolean
language sql security definer set search_path=public,pg_temp as $body$
 select exists(select 1 from calendar_sync_changes c join calendar_absence_evidence a
  on a.booking_id=(c.proposal->>'booking_id')::uuid and a.calendar_id=c.calendar_id
  and a.organization_id=c.organization_id and a.property_id=c.property_id
  join calendar_sync_leases l on l.property_id=a.property_id and l.organization_id=a.organization_id and l.token=a.last_token
  where c.id=p_change and c.organization_id=p_org and c.reason='booking_cancelled' and c.state='review'
   and a.snapshot_hash=c.snapshot_hash and a.observation_count>=3 and a.first_missing_at<=now()-interval '30 minutes'
   and a.last_counted_at=now() and a.last_observed_at=now() and l.expires_at>now()
   and nullif(current_setting('gulera.calendar_observation',true),'')::jsonb->>'token'=a.last_token::text
   and nullif(current_setting('gulera.calendar_observation',true),'')::jsonb->>'fresh'='true')
$body$;
revoke all on function public.calendar_absence_authorized(uuid,uuid) from public,anon,authenticated;
grant execute on function public.calendar_absence_authorized(uuid,uuid) to service_role;

create function public.apply_calendar_snapshot_observed(p_org uuid,p_property uuid,p_calendar uuid,p_token uuid,p_hash text,p_events jsonb,p_fresh boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $body$
declare result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_property::text,33));
 if not exists(select 1 from calendar_sync_leases where property_id=p_property and organization_id=p_org and token=p_token and expires_at>now()) then raise exception 'Stale calendar worker'; end if;
 if exists(select 1 from calendar_sync_feeds where calendar_id=p_calendar and organization_id=p_org and state<>'completed') then
  delete from calendar_absence_evidence where calendar_id=p_calendar and organization_id=p_org;
 end if;
 perform set_config('gulera.calendar_observation',jsonb_build_object('token',p_token,'calendar',p_calendar,'organization',p_org,'property',p_property,'hash',p_hash,'fresh',p_fresh)::text,true);
 result:=apply_calendar_snapshot(p_org,p_property,p_calendar,p_token,p_hash,p_events);
 perform set_config('gulera.calendar_observation','',true);
 return result;
end $body$;
revoke all on function public.apply_calendar_snapshot_observed(uuid,uuid,uuid,uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.apply_calendar_snapshot_observed(uuid,uuid,uuid,uuid,text,jsonb,boolean) to service_role;
