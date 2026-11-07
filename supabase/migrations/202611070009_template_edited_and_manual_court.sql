-- Bracket editor and fight plan (owner, 2026-11-07):
--   * categories.ko_template_edited: the KO template was adjusted by hand in
--     the bracket editor; it is used by the draw and kept when a draw is undone;
--   * matches.court_manual: the court of this fight was changed by hand in the
--     fight plan; shiaijo plan changes leave it alone.
alter table public.categories add column ko_template_edited boolean not null default false;
alter table public.matches add column court_manual boolean not null default false;
