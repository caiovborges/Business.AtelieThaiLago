-- ATENCAO: use somente em emergencia.
-- Desfaz 20261106132647_fechar_acesso_aprovados.sql e REABRE o problema de
-- seguranca: qualquer conta logada volta a acessar todos os dados, e excluir
-- um evento volta a apagar os lancamentos dele. Nao altera nenhum registro.

begin;

alter table public.transacoes drop constraint transacoes_evento_id_fkey;
alter table public.transacoes
  add constraint transacoes_evento_id_fkey
  foreign key (evento_id) references public.eventos (id) on delete cascade;

drop policy "Aprovados tem acesso total" on public.clients;
drop policy "Aprovados tem acesso total" on public.eventos;
drop policy "Aprovados tem acesso total" on public.transacoes;
drop policy "Aprovados tem acesso total" on public.categorias;
drop policy "Aprovados tem acesso total" on public.propostas;
drop policy "Aprovados tem acesso total" on public.proposta_itens;
drop policy "Aprovados tem acesso total" on public.leads;
drop policy "Aprovados tem acesso total" on public.lead_followups;

create policy "Enable all for authenticated users" on public.clients for all to authenticated using (true) with check (true);
create policy "Enable all for authenticated users" on public.eventos for all to authenticated using (true) with check (true);
create policy "Enable all for authenticated users" on public.transacoes for all to authenticated using (true) with check (true);
create policy "Enable all for authenticated users" on public.categorias for all to authenticated using (true) with check (true);
create policy "Enable all for authenticated users" on public.propostas for all to authenticated using (true) with check (true);
create policy "Enable all for authenticated users" on public.proposta_itens for all to authenticated using (true) with check (true);
create policy "Enable all for authenticated users" on public.leads for all to authenticated using (true) with check (true);
create policy "Enable all for authenticated users" on public.lead_followups for all to authenticated using (true) with check (true);

drop policy "Aprovados leem cidades" on public.cidades;
drop policy "Aprovados criam cidades" on public.cidades;
drop policy "Aprovados leem estados" on public.estados;

create policy "Authenticated users can read cidades" on public.cidades for select to authenticated using (true);
create policy "Authenticated users can insert cidades" on public.cidades for insert to authenticated with check (true);
create policy "Authenticated users can read estados" on public.estados for select to authenticated using (true);

drop policy "Le o proprio perfil ou todos se admin" on public.user_profiles;
drop policy "Admins alteram perfis" on public.user_profiles;

create policy "Authenticated users can read profiles" on public.user_profiles for select using (auth.uid() is not null);
create policy "Allow profile creation" on public.user_profiles for insert with check (auth.uid() = user_id);
create policy "Admins can update profiles" on public.user_profiles for update using (public.is_admin());

grant execute on function public.is_admin() to public, anon, authenticated;
grant execute on function public.handle_new_user() to public, anon, authenticated;
alter function public.handle_new_user() reset search_path;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

drop function public.is_approved();

commit;
