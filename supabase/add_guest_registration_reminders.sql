alter table public.property_knowledge
  add column if not exists guest_registration_required boolean not null default false,
  add column if not exists guest_registration_lead_days integer not null default 3,
  add column if not exists guest_registration_instructions text;

alter table public.property_knowledge
  drop constraint if exists property_knowledge_guest_registration_lead_days_check;

alter table public.property_knowledge
  add constraint property_knowledge_guest_registration_lead_days_check
  check (guest_registration_lead_days >= 0 and guest_registration_lead_days <= 30);

comment on column public.property_knowledge.guest_registration_required is
  'When true, admins should be reminded to register guests before check-in for this property.';

comment on column public.property_knowledge.guest_registration_lead_days is
  'How many days before check-in the admin reminder should fire.';

comment on column public.property_knowledge.guest_registration_instructions is
  'Optional instructions for how to complete the guest registration.';

alter table public.property_booking_events
  add column if not exists guest_registration_reminder_sent_at timestamptz;

comment on column public.property_booking_events.guest_registration_reminder_sent_at is
  'Tracks when the admin guest-registration reminder push was last sent for this booking event.';
