begin;

create table public.support_email_quotas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  last_sent_at timestamptz,
  sent_count integer not null default 0
);
alter table public.support_email_quotas enable row level security;
revoke all on public.support_email_quotas from public, anon, authenticated;

-- Serialize requests per user across Edge Function instances.
-- Return zero on success, otherwise the seconds until retry.
create or replace function public.consume_support_email_quota(p_user_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  quota public.support_email_quotas%rowtype;
  current_time_value timestamptz := clock_timestamp();
begin
  insert into public.support_email_quotas(user_id) values (p_user_id)
    on conflict (user_id) do nothing;
  select * into quota from public.support_email_quotas
    where user_id = p_user_id for update;
  current_time_value := clock_timestamp();
  if quota.last_sent_at > current_time_value - interval '60 seconds' then
    return greatest(1, ceil(extract(epoch from
      quota.last_sent_at + interval '60 seconds' - current_time_value))::integer);
  end if;
  if quota.window_started_at <= current_time_value - interval '24 hours' then
    quota.window_started_at := current_time_value;
    quota.sent_count := 0;
  end if;
  if quota.sent_count >= 10 then
    return greatest(1, ceil(extract(epoch from
      quota.window_started_at + interval '24 hours' - current_time_value))::integer);
  end if;
  update public.support_email_quotas
    set window_started_at = quota.window_started_at,
        last_sent_at = current_time_value, sent_count = quota.sent_count + 1
    where user_id = p_user_id;
  return 0;
end;
$$;
revoke all on function public.consume_support_email_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_support_email_quota(uuid) to service_role;

commit;
