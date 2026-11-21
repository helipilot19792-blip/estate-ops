-- LOCAL REVIEW DRAFT ONLY. No production execution authorized.
-- Guarded patch of the existing hosted capture function; preserves its current
-- lease/fencing, privileges, identity checks and cancellation review behavior.
-- Requires provider-confirmed cancellation; absence alone remains insufficient.
DO $patch$
DECLARE
 definition text;
 overlap_old text := 'elsif exists(select 1 from property_booking_events where property_id=p_property and checkin_date<(e->>''checkout_date'')::date and checkout_date>(e->>''checkin_date'')::date) then';
 overlap_new text := 'elsif exists(select 1 from property_booking_events where organization_id=p_org and property_id=p_property and calendar_cancelled_at is null and checkin_date<(e->>''checkout_date'')::date and checkout_date>(e->>''checkin_date'')::date) then';
 apply_old text := 'if c is not null then perform apply_calendar_change(c,p_org);changes:=changes+1; end if;';
 apply_new text := 'if c is not null then
     perform apply_calendar_change(c,p_org);changes:=changes+1;
     -- Retain the earlier overlap proposal as resolved history after successful import.
     update calendar_sync_changes set state=''obsolete''
      where organization_id=p_org and property_id=p_property and calendar_id=p_calendar
       and external_uid=e->>''uid'' and reason=''ambiguous_overlap'' and state=''review'';
    end if;';
BEGIN
 definition := pg_get_functiondef('public.calendar_capture_snapshot_review(uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure);
 IF (length(definition)-length(replace(definition,overlap_old,'')))/length(overlap_old) <> 1
  OR (length(definition)-length(replace(definition,apply_old,'')))/length(apply_old) <> 1 THEN
  RAISE EXCEPTION 'Calendar capture source differs from reviewed baseline; stop without changes';
 END IF;
 EXECUTE replace(replace(definition,overlap_old,overlap_new),apply_old,apply_new);
END
$patch$;
