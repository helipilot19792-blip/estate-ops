alter table public.organizations
  add column if not exists organization_type text not null default 'property_management';

update public.organizations
set organization_type = 'property_management'
where organization_type is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_organization_type_check'
  ) then
    alter table public.organizations
      add constraint organizations_organization_type_check
      check (organization_type in ('property_management', 'cleaning_company'));
  end if;
end $$;
