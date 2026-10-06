-- Manual rollback only. Export publishing data before running this script.
-- Canonical accommodation facts and all existing audit history are retained.
begin;
drop trigger if exists website_property_facts_changed on public.properties;
drop function if exists public.website_property_facts_changed();
drop function if exists public.save_website_listing(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,text,text);
drop function if exists public.save_website_connection(uuid,uuid,jsonb);
drop function if exists public.process_internal_website_jobs(uuid,uuid);
drop function if exists public.enqueue_website_sync(uuid,uuid,text,boolean);
drop table if exists public.website_sync_jobs;
drop table if exists public.property_public_listings;
drop table if exists public.website_connections;
drop index if exists public.properties_id_organization_publishing_idx;
-- Do not drop property_type, bedrooms, bathrooms, max_guests, beds or parking_spaces:
-- they may contain valuable operational data after adoption.
commit;
