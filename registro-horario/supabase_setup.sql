-- Ejecuta este SQL en Supabase → SQL Editor → New Query

create table if not exists storage (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz default now()
);

-- Permite acceso sin autenticación (solo tú usas la app)
alter table storage enable row level security;

create policy "Allow all operations"
  on storage for all
  using (true)
  with check (true);
