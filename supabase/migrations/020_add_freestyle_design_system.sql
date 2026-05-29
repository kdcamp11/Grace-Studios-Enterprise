-- Add 'freestyle' to the design_system check constraint on briefs and reference_images

alter table public.briefs
  drop constraint if exists briefs_design_system_check;

alter table public.briefs
  add constraint briefs_design_system_check
  check (design_system in ('bold','gradient','program','culture','freestyle'));

alter table public.reference_images
  drop constraint if exists reference_images_design_system_check;

alter table public.reference_images
  add constraint reference_images_design_system_check
  check (design_system in ('bold','gradient','program','culture','freestyle'));
