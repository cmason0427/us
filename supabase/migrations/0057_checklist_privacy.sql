-- A saved "just mine" checklist stays private to whoever made it.
drop policy "checklist presets all" on public.checklist_presets;
create policy "checklist presets read" on public.checklist_presets for select to authenticated
  using (list_type <> 'personal' or created_by = auth.uid());
create policy "checklist presets write" on public.checklist_presets for all to authenticated
  using (list_type <> 'personal' or created_by = auth.uid())
  with check (list_type <> 'personal' or created_by = auth.uid());
drop policy "checklist prompts all" on public.checklist_prompts;
create policy "checklist prompts via preset" on public.checklist_prompts for all to authenticated
  using (exists (select 1 from public.checklist_presets p where p.id = preset_id))
  with check (exists (select 1 from public.checklist_presets p where p.id = preset_id));
