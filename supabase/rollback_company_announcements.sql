-- Export announcement delivery/audit history before using this destructive schema rollback.
begin;
drop function if exists public.company_announcement_status(uuid,uuid);
drop function if exists public.unsubscribe_company_announcements(uuid);
drop function if exists public.retry_company_announcement(uuid,uuid,uuid);
drop function if exists public.finish_company_announcement_email(uuid,uuid,text,text);
drop function if exists public.claim_company_announcement_emails(uuid,uuid,uuid);
drop function if exists public.queue_company_announcement(uuid,uuid,uuid,integer,jsonb);
drop function if exists public.save_company_announcement(uuid,uuid,uuid,integer,jsonb,text[]);
drop function if exists public.company_announcement_contacts(uuid);
drop function if exists public.require_company_announcement_admin(uuid,uuid);
drop table if exists public.company_announcement_recipients;
drop table if exists public.company_announcement_preferences;
drop table if exists public.company_announcements;
commit;
