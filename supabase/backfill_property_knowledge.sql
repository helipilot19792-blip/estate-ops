-- Run this after supabase/add_property_knowledge.sql.
-- It seeds Property Knowledge from existing setup data without overwriting
-- any knowledge fields that already have saved values.

with access_by_property as (
  select
    property_id,
    nullif(string_agg(nullif(trim(notes), ''), E'\n' order by id), '') as notes
  from public.property_access
  group by property_id
)
insert into public.property_knowledge (
  organization_id,
  property_id,
  wifi_network,
  wifi_password,
  access_summary,
  trash_instructions,
  updated_at
)
select
  p.organization_id,
  p.id as property_id,
  nullif(trim(p.wifi_network), '') as wifi_network,
  nullif(trim(p.wifi_password), '') as wifi_password,
  nullif(trim(pa.notes), '') as access_summary,
  nullif(
    concat_ws(
      E'\n',
      case
        when nullif(trim(p.garbage_day), '') is not null
          then 'Waste pickup: ' || trim(p.garbage_day)
        else null
      end,
      case
        when nullif(trim(p.garbage_week_a_label), '') is not null
          then 'Week A: ' || trim(p.garbage_week_a_label)
        else null
      end,
      case
        when nullif(trim(p.garbage_week_b_label), '') is not null
          then 'Week B: ' || trim(p.garbage_week_b_label)
        else null
      end,
      case
        when p.garbage_rotation_anchor_date is not null
          then 'Rotation anchor date: ' || p.garbage_rotation_anchor_date::text
        else null
      end,
      case
        when nullif(trim(p.garbage_notes), '') is not null
          then trim(p.garbage_notes)
        else null
      end
    ),
    ''
  ) as trash_instructions,
  now() as updated_at
from public.properties p
left join access_by_property pa
  on pa.property_id = p.id
where
  nullif(trim(p.wifi_network), '') is not null
  or nullif(trim(p.wifi_password), '') is not null
  or pa.notes is not null
  or nullif(trim(p.garbage_day), '') is not null
  or nullif(trim(p.garbage_week_a_label), '') is not null
  or nullif(trim(p.garbage_week_b_label), '') is not null
  or p.garbage_rotation_anchor_date is not null
  or nullif(trim(p.garbage_notes), '') is not null
on conflict (property_id) do update
set
  organization_id = excluded.organization_id,
  wifi_network = coalesce(nullif(property_knowledge.wifi_network, ''), excluded.wifi_network),
  wifi_password = coalesce(nullif(property_knowledge.wifi_password, ''), excluded.wifi_password),
  access_summary = coalesce(nullif(property_knowledge.access_summary, ''), excluded.access_summary),
  trash_instructions = coalesce(nullif(property_knowledge.trash_instructions, ''), excluded.trash_instructions),
  updated_at = now()
where
  (nullif(property_knowledge.wifi_network, '') is null and excluded.wifi_network is not null)
  or (nullif(property_knowledge.wifi_password, '') is null and excluded.wifi_password is not null)
  or (nullif(property_knowledge.access_summary, '') is null and excluded.access_summary is not null)
  or (nullif(property_knowledge.trash_instructions, '') is null and excluded.trash_instructions is not null);
