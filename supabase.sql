-- Cole este arquivo inteiro no Supabase: SQL Editor > New query > Run
-- Pode rodar mais de uma vez sem problema.

-- ========== TABELAS ==========
create table if not exists ordens   (id text primary key, data jsonb not null, updated_at timestamptz default now());
create table if not exists usuarios (id text primary key, data jsonb not null, updated_at timestamptz default now());
create table if not exists eventos  (id text primary key, data jsonb not null, updated_at timestamptz default now());
create table if not exists avisos   (id text primary key, data jsonb not null, updated_at timestamptz default now());
create table if not exists estoque  (id text primary key, data jsonb not null, updated_at timestamptz default now());
create table if not exists compras  (id text primary key, data jsonb not null, updated_at timestamptz default now());
create table if not exists config   (k  text primary key, v    jsonb not null, updated_at timestamptz default now());

alter table ordens   enable row level security;
alter table usuarios enable row level security;
alter table eventos  enable row level security;
alter table avisos   enable row level security;
alter table estoque  enable row level security;
alter table compras  enable row level security;
alter table config   enable row level security;

drop policy if exists "app_ordens"   on ordens;
drop policy if exists "app_usuarios" on usuarios;
drop policy if exists "app_eventos"  on eventos;
drop policy if exists "app_avisos"   on avisos;
drop policy if exists "app_estoque"  on estoque;
drop policy if exists "app_compras"  on compras;
drop policy if exists "app_config"   on config;

create policy "app_ordens"   on ordens   for all to anon using (true) with check (true);
create policy "app_usuarios" on usuarios for all to anon using (true) with check (true);
create policy "app_eventos"  on eventos  for all to anon using (true) with check (true);
create policy "app_avisos"   on avisos   for all to anon using (true) with check (true);
create policy "app_estoque"  on estoque  for all to anon using (true) with check (true);
create policy "app_compras"  on compras  for all to anon using (true) with check (true);
create policy "app_config"   on config   for all to anon using (true) with check (true);

-- ========== FOTOS (Storage) ==========
-- O bucket precisa existir; sem ele o app funciona, mas sem enviar fotos.
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do update set public = true;

drop policy if exists "fotos_ler"     on storage.objects;
drop policy if exists "fotos_enviar"  on storage.objects;
drop policy if exists "fotos_alterar" on storage.objects;
drop policy if exists "fotos_apagar"  on storage.objects;

create policy "fotos_ler"     on storage.objects for select to anon using (bucket_id = 'fotos');
create policy "fotos_enviar"  on storage.objects for insert to anon with check (bucket_id = 'fotos');
create policy "fotos_alterar" on storage.objects for update to anon using (bucket_id = 'fotos');
create policy "fotos_apagar"  on storage.objects for delete to anon using (bucket_id = 'fotos');

-- ========== AJUDA A MANUTENÇÃO ==========
-- Índice por data de atualização: deixa a leitura das tabelas mais rápida
-- quando o app sincroniza muitos registros.
create index if not exists ordens_updated_idx   on ordens   (updated_at desc);
create index if not exists usuarios_updated_idx on usuarios (updated_at desc);
create index if not exists eventos_updated_idx  on eventos  (updated_at desc);
create index if not exists avisos_updated_idx   on avisos   (updated_at desc);
create index if not exists estoque_updated_idx  on estoque  (updated_at desc);
create index if not exists compras_updated_idx  on compras  (updated_at desc);

-- Remove avisos com mais de 30 dias (o app também os descarta na leitura).
-- Rode este trecho manualmente de vez em quando, se quiser limpar o banco:
--   delete from avisos where (data->>'em')::bigint < (extract(epoch from now()) - 2592000) * 1000;

-- ========== CONFERIR SE FICOU TUDO CERTO ==========
-- Depois de rodar, estas duas consultas devem devolver 7 linhas cada:
--   select table_name from information_schema.tables
--    where table_schema = 'public' order by table_name;
--   select id, public from storage.buckets;

