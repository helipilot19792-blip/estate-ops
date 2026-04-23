alter table public.turnover_job_slots
  add column if not exists offer_email_sent_at timestamptz,
  add column if not exists offer_reminder_sent_at timestamptz,
  add column if not exists day_of_reminder_sent_at timestamptz;

alter table public.grounds_job_slots
  add column if not exists offer_email_sent_at timestamptz,
  add column if not exists offer_reminder_sent_at timestamptz,
  add column if not exists day_of_reminder_sent_at timestamptz;
