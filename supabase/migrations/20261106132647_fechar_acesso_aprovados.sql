-- Prioridade 1: fecha o acesso aos dados e protege o financeiro dos eventos.
--
-- O que muda:
--   1. So contas com papel admin ou member acessam os dados.
--   2. Cada conta le o proprio perfil; admin le todos.
--   3. Evento com lancamentos nao pode mais ser excluido.
--
-- Nao altera nenhum registro. Roda em uma unica transacao: se o autoteste do
-- final falhar, tudo e desfeito. Para voltar atras depois de aplicada, use
-- supabase/rollback/20261106132647_fechar_acesso_aprovados.sql.

begin;

-- ---------------------------------------------------------------------------
-- Funcoes de permissao
-- ---------------------------------------------------------------------------
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles
    where user_id = (select auth.uid()) and role in ('admin', 'member')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

alter function public.handle_new_user() set search_path = '';

revoke all on function public.is_approved() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.is_approved() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tabelas de negocio: acesso total so para contas aprovadas
-- ---------------------------------------------------------------------------
drop policy "Enable all for authenticated users" on public.clients;
drop policy "Enable all for authenticated users" on public.eventos;
drop policy "Enable all for authenticated users" on public.transacoes;
drop policy "Enable all for authenticated users" on public.categorias;
drop policy "Enable all for authenticated users" on public.propostas;
drop policy "Enable all for authenticated users" on public.proposta_itens;
drop policy "Enable all for authenticated users" on public.leads;
drop policy "Enable all for authenticated users" on public.lead_followups;

create policy "Aprovados tem acesso total" on public.clients
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));
create policy "Aprovados tem acesso total" on public.eventos
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));
create policy "Aprovados tem acesso total" on public.transacoes
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));
create policy "Aprovados tem acesso total" on public.categorias
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));
create policy "Aprovados tem acesso total" on public.propostas
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));
create policy "Aprovados tem acesso total" on public.proposta_itens
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));
create policy "Aprovados tem acesso total" on public.leads
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));
create policy "Aprovados tem acesso total" on public.lead_followups
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));

-- ---------------------------------------------------------------------------
-- Cidades e estados: mantem as mesmas operacoes, so para aprovados
-- ---------------------------------------------------------------------------
drop policy "Authenticated users can read cidades" on public.cidades;
drop policy "Authenticated users can insert cidades" on public.cidades;
drop policy "Authenticated users can read estados" on public.estados;

create policy "Aprovados leem cidades" on public.cidades
  for select to authenticated using ((select public.is_approved()));
create policy "Aprovados criam cidades" on public.cidades
  for insert to authenticated with check ((select public.is_approved()));
create policy "Aprovados leem estados" on public.estados
  for select to authenticated using ((select public.is_approved()));

-- ---------------------------------------------------------------------------
-- Perfis: a tela precisa do proprio perfil para saber se a conta foi aprovada
-- ---------------------------------------------------------------------------
drop policy "Authenticated users can read profiles" on public.user_profiles;
drop policy "Allow profile creation" on public.user_profiles;
drop policy "Admins can update profiles" on public.user_profiles;

create policy "Le o proprio perfil ou todos se admin" on public.user_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Admins alteram perfis" on public.user_profiles
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- O perfil novo continua sendo criado pelo gatilho handle_new_user.

-- ---------------------------------------------------------------------------
-- Excluir evento nao apaga mais o financeiro dele
-- ---------------------------------------------------------------------------
alter table public.transacoes drop constraint transacoes_evento_id_fkey;
alter table public.transacoes
  add constraint transacoes_evento_id_fkey
  foreign key (evento_id) references public.eventos (id) on delete no action;

-- ---------------------------------------------------------------------------
-- Autoteste: qualquer falha desfaz a migracao inteira
-- ---------------------------------------------------------------------------
do $$
declare
  total_transacoes bigint;
  total_perfis bigint;
  evento_com_lancamento uuid;
  admin_id uuid;
  negado_id uuid;
  nao_aprovados uuid[];
  conta uuid;
  tabela text;
  quantidade bigint;
begin
  select count(*) into total_transacoes from public.transacoes;
  select count(*) into total_perfis from public.user_profiles;
  select evento_id into evento_com_lancamento from public.transacoes where evento_id is not null limit 1;
  select user_id into admin_id from public.user_profiles where role = 'admin' limit 1;
  select user_id into negado_id from public.user_profiles where role in ('denied', 'pending') limit 1;

  if admin_id is null then
    raise exception 'AUTOTESTE: nenhuma conta admin encontrada';
  end if;

  -- Um admin continua vendo tudo.
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into quantidade from public.transacoes;
  if quantidade <> total_transacoes then
    raise exception 'AUTOTESTE: admin ve % de % transacoes', quantidade, total_transacoes;
  end if;
  select count(*) into quantidade from public.user_profiles;
  if quantidade <> total_perfis then
    raise exception 'AUTOTESTE: admin ve % de % perfis', quantidade, total_perfis;
  end if;
  perform set_config('role', 'none', true);

  -- Conta nao aprovada e conta sem perfil nao veem nem alteram nada.
  nao_aprovados := array['00000000-0000-0000-0000-000000000001'::uuid];
  if negado_id is not null then
    nao_aprovados := nao_aprovados || negado_id;
  end if;

  foreach conta in array nao_aprovados loop
    perform set_config('request.jwt.claims', json_build_object('sub', conta, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    foreach tabela in array array['clients','eventos','transacoes','categorias','propostas','proposta_itens','leads','lead_followups','cidades','estados'] loop
      execute format('select count(*) from public.%I', tabela) into quantidade;
      if quantidade <> 0 then
        raise exception 'AUTOTESTE: conta nao aprovada ve % linhas em %', quantidade, tabela;
      end if;
    end loop;

    select count(*) into quantidade from public.user_profiles where user_id <> conta;
    if quantidade <> 0 then
      raise exception 'AUTOTESTE: conta nao aprovada ve perfis de outras contas';
    end if;

    update public.transacoes set descricao = descricao;
    get diagnostics quantidade = row_count;
    if quantidade <> 0 then
      raise exception 'AUTOTESTE: conta nao aprovada alterou % transacoes', quantidade;
    end if;

    delete from public.transacoes;
    get diagnostics quantidade = row_count;
    if quantidade <> 0 then
      raise exception 'AUTOTESTE: conta nao aprovada apagou % transacoes', quantidade;
    end if;

    begin
      insert into public.transacoes (user_id, tipo, descricao, valor) values (conta, 'despesa', 'autoteste', 0);
      raise exception 'AUTOTESTE: conta nao aprovada conseguiu inserir transacao';
    exception when insufficient_privilege then
      null;
    end;

    begin
      insert into public.user_profiles (user_id, role) values (conta, 'admin');
      raise exception 'AUTOTESTE: conta nao aprovada conseguiu criar perfil admin';
    exception when insufficient_privilege then
      null;
    end;

    perform set_config('role', 'none', true);
  end loop;

  -- Visitante sem login nao ve nada.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  foreach tabela in array array['clients','eventos','transacoes','categorias','propostas','proposta_itens','leads','lead_followups','cidades','estados','user_profiles'] loop
    execute format('select count(*) from public.%I', tabela) into quantidade;
    if quantidade <> 0 then
      raise exception 'AUTOTESTE: visitante ve % linhas em %', quantidade, tabela;
    end if;
  end loop;
  perform set_config('role', 'none', true);

  -- Excluir evento com lancamentos precisa ser bloqueado.
  if evento_com_lancamento is not null then
    begin
      delete from public.eventos where id = evento_com_lancamento;
      raise exception 'AUTOTESTE: evento com lancamentos foi excluido';
    exception when foreign_key_violation then
      null;
    end;
  end if;

  select count(*) into quantidade from public.transacoes;
  if quantidade <> total_transacoes then
    raise exception 'AUTOTESTE: total de transacoes mudou de % para %', total_transacoes, quantidade;
  end if;
end;
$$;

commit;
