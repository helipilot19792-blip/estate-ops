alter table public.admin_whiteboard_drawings
  add column if not exists board_title text not null default 'Our whiteboard'
  check (length(trim(board_title)) between 1 and 120);
