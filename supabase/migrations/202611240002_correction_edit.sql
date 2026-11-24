-- Manager corrections: a finished fight's result edited directly in Manage (owner, 2026-11-24).
alter table public.correction_log drop constraint correction_log_kind_check;
alter table public.correction_log add constraint correction_log_kind_check
  check (kind in ('reopen', 'edit', 'replay', 'keep', 'order', 'order_reset', 'swap', 'swap_reset'));
