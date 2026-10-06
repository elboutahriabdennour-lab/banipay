-- ZELTO — Rubrique Fournisseurs : table + protection (RLS)
-- À exécuter UNE fois dans Supabase > SQL Editor.

create table if not exists public.fournisseurs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  nom text not null,
  tel text,
  email text,
  ville text,
  adresse text,
  ice text,
  identifiant_fiscal text,
  conditions_paiement text,
  notes text,
  zelto_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists fournisseurs_user_idx on public.fournisseurs (user_id, nom);

alter table public.fournisseurs enable row level security;

drop policy if exists fournisseurs_select_own on public.fournisseurs;
drop policy if exists fournisseurs_insert_own on public.fournisseurs;
drop policy if exists fournisseurs_update_own on public.fournisseurs;
drop policy if exists fournisseurs_delete_own on public.fournisseurs;

-- Chaque entreprise ne voit et ne modifie que SES fournisseurs.
create policy fournisseurs_select_own on public.fournisseurs for select to authenticated using (user_id = auth.uid());
create policy fournisseurs_insert_own on public.fournisseurs for insert to authenticated with check (user_id = auth.uid());
create policy fournisseurs_update_own on public.fournisseurs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy fournisseurs_delete_own on public.fournisseurs for delete to authenticated using (user_id = auth.uid());

revoke all on public.fournisseurs from anon;
grant select, insert, update, delete on public.fournisseurs to authenticated;

-- Vérification : doit afficher 4 règles
select policyname, cmd from pg_policies where schemaname='public' and tablename='fournisseurs';
