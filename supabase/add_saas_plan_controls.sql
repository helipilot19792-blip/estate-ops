alter table public.organizations
  add column if not exists account_type text not null default 'beta',
  add column if not exists plan_name text not null default 'Beta trial',
  add column if not exists property_limit integer,
  add column if not exists member_limit integer,
  add column if not exists billing_override_reason text;

update public.organizations
set
  account_type = coalesce(account_type, 'beta'),
  plan_name = coalesce(plan_name, 'Beta trial'),
  property_limit = coalesce(property_limit, 10),
  member_limit = coalesce(member_limit, 15)
where account_type <> 'internal';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_account_type_check'
  ) then
    alter table public.organizations
      add constraint organizations_account_type_check
      check (account_type in ('internal', 'beta', 'customer'));
  end if;
end $$;
