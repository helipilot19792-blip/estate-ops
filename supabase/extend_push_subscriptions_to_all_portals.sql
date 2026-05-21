alter table public.staff_push_subscriptions
  drop constraint if exists staff_push_subscriptions_portal_check;

alter table public.staff_push_subscriptions
  add constraint staff_push_subscriptions_portal_check
  check (portal in ('admin', 'cleaner', 'grounds', 'owner'));
