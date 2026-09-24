-- Events remember which preset made them, so editing the preset can update them.
alter table public.events add column template_id uuid references public.event_templates (id) on delete set null;
create index events_template_idx on public.events (template_id) where template_id is not null;
