-- Narrow compatibility for reservations imported before calendar_sync_imports existed.
-- Never manufacture a mapping; require the existing exact source marker and one
-- untouched, scoped checkout cleaning. Conflicting identities remain in review.
DO $patch$
declare definition text;
 old text:='and exists(select 1 from calendar_sync_imports i where i.calendar_id=p_calendar and i.external_uid=x.external_uid
    and i.organization_id=p_org and i.property_id=p_property and i.booking_id=x.id)';
 replacement text:='and x.source=(select source from property_calendars where id=p_calendar and property_id=p_property and is_active=true)
   and (exists(select 1 from calendar_sync_imports i where i.calendar_id=p_calendar and i.external_uid=x.external_uid
    and i.organization_id=p_org and i.property_id=p_property and i.booking_id=x.id)
    or (not exists(select 1 from calendar_sync_imports i where i.calendar_id=p_calendar and i.external_uid=x.external_uid)
     and (select count(*) from turnover_jobs j where j.booking_event_id=x.id and j.organization_id=p_org and j.property_id=p_property and j.status<>''cancelled'')=1
     and exists(select 1 from turnover_jobs j where j.booking_event_id=x.id and j.organization_id=p_org and j.property_id=p_property
      and j.status not in(''cancelled'',''completed'',''in_progress'') and j.scheduled_for=x.checkout_date
      and strpos(coalesce(j.notes,''''),''[AUTO_SYNC:''||x.source||'':''||x.external_uid||'']'')>0)))';
begin
 definition:=pg_get_functiondef('public.calendar_reconcile_absences(uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,old,'')))/length(old)<>1 then
  raise exception 'Legacy reconciliation source differs; stop without changes';
 end if;
 execute replace(definition,old,replacement);
end $patch$;
