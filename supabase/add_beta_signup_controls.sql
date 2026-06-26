alter table public.platform_settings
  add column if not exists beta_signup_enabled boolean not null default true,
  add column if not exists beta_signup_limit integer;

update public.platform_settings
set
  beta_signup_enabled = coalesce(beta_signup_enabled, true),
  beta_signup_limit = coalesce(beta_signup_limit, 10)
where id = true;

insert into public.platform_settings (id, ai_copilot_enabled, beta_signup_enabled, beta_signup_limit)
values (true, false, true, 10)
on conflict (id) do update
set
  beta_signup_enabled = coalesce(public.platform_settings.beta_signup_enabled, excluded.beta_signup_enabled),
  beta_signup_limit = coalesce(public.platform_settings.beta_signup_limit, excluded.beta_signup_limit),
  updated_at = now();
