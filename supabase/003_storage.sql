-- Photo uploads for lots. Creates a public 'lots' bucket and lets the browser
-- (anon) upload to it + everyone read. Run once in Supabase SQL Editor.
insert into storage.buckets (id, name, public)
values ('lots', 'lots', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'lots_anon_upload' and tablename = 'objects') then
    create policy lots_anon_upload on storage.objects for insert to anon with check (bucket_id = 'lots');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'lots_public_read' and tablename = 'objects') then
    create policy lots_public_read on storage.objects for select using (bucket_id = 'lots');
  end if;
end $$;
