-- Parcelas a receber de cada evento.
--
-- O que muda:
--   1. parcelas guarda o combinado de pagamento. transacao_id vazio significa em aberto.
--   2. A funcao receber_parcela cria a receita e liga a parcela a ela, juntas.
--      Excluir essa receita no financeiro devolve a parcela para em aberto.
--
-- Nao altera nenhum registro existente. Se o autoteste do final falhar, tudo e
-- desfeito. Para voltar atras, use o arquivo em supabase/rollback.

begin;

create table public.parcelas (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete cascade,
  descricao text not null
    constraint parcelas_descricao_check check (length(trim(descricao)) between 1 and 200),
  valor numeric(12, 2) not null
    constraint parcelas_valor_check check (valor > 0),
  vencimento date not null,
  categoria_id integer references public.categorias (id) on delete set null,
  transacao_id uuid unique references public.transacoes (id) on delete set null,
  created_at timestamptz not null default now()
);

create index parcelas_evento_id_idx on public.parcelas (evento_id);
create index parcelas_abertas_idx on public.parcelas (vencimento) where transacao_id is null;

alter table public.parcelas enable row level security;
revoke all on public.parcelas from public, anon;
grant select, insert, update, delete on public.parcelas to authenticated;
grant all on public.parcelas to service_role;

create policy "Aprovados tem acesso total" on public.parcelas
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));

create function public.receber_parcela(
  p_parcela_id uuid,
  p_data date,
  p_valor numeric,
  p_categoria_id integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_parcela public.parcelas%rowtype;
  v_evento text;
  v_transacao uuid;
begin
  if not public.is_approved() then
    raise exception 'Conta sem permissao para receber parcelas.' using errcode = '42501';
  end if;

  if p_data is null or p_valor is null or p_valor <= 0 then
    raise exception 'Informe a data e um valor maior que zero.' using errcode = '22023';
  end if;

  select * into v_parcela from public.parcelas where id = p_parcela_id for update;
  if not found then
    raise exception 'Parcela nao encontrada.' using errcode = 'P0002';
  end if;

  if v_parcela.transacao_id is not null then
    raise exception 'Esta parcela ja foi recebida.' using errcode = '23505';
  end if;

  select nome into v_evento from public.eventos where id = v_parcela.evento_id;

  insert into public.transacoes (evento_id, user_id, tipo, descricao, valor, data, categoria_id)
  values (v_parcela.evento_id, auth.uid(), 'receita', v_parcela.descricao || ' - ' || v_evento, round(p_valor, 2), p_data, p_categoria_id)
  returning id into v_transacao;

  update public.parcelas set transacao_id = v_transacao where id = v_parcela.id;

  return v_transacao;
end;
$$;

revoke all on function public.receber_parcela(uuid, date, numeric, integer) from public, anon;
grant execute on function public.receber_parcela(uuid, date, numeric, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Autoteste: qualquer falha desfaz a migracao inteira
-- ---------------------------------------------------------------------------
do $$
declare
  admin_id uuid;
  negado_id uuid;
  evento_teste uuid;
  parcela_teste uuid;
  transacao_teste uuid;
  quantidade bigint;
  valor_lido numeric;
  total_transacoes bigint;
  soma_transacoes numeric;
begin
  select user_id into admin_id from public.user_profiles where role = 'admin' limit 1;
  select user_id into negado_id from public.user_profiles where role in ('denied', 'pending') limit 1;
  select id into evento_teste from public.eventos limit 1;
  select count(*), coalesce(sum(valor), 0) into total_transacoes, soma_transacoes from public.transacoes;

  if admin_id is null then
    raise exception 'AUTOTESTE: nenhuma conta admin encontrada';
  end if;

  if evento_teste is not null then
    -- Usa um evento de verdade dentro de um bloco que e sempre desfeito.
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);

      insert into public.parcelas (evento_id, descricao, valor, vencimento)
      values (evento_teste, 'autoteste', 100.50, current_date)
      returning id into parcela_teste;

      begin
        insert into public.parcelas (evento_id, descricao, valor, vencimento) values (evento_teste, 'autoteste', 0, current_date);
        raise exception 'AUTOTESTE: parcela de valor zero foi aceita';
      exception when check_violation then
        null;
      end;

      begin
        perform public.receber_parcela(parcela_teste, current_date, 0, null);
        raise exception 'AUTOTESTE: recebimento de valor zero foi aceito';
      exception when invalid_parameter_value then
        null;
      end;

      transacao_teste := public.receber_parcela(parcela_teste, current_date, 90, null);

      select valor into valor_lido from public.transacoes
      where id = transacao_teste and tipo = 'receita' and evento_id = evento_teste and user_id = admin_id;
      if valor_lido is distinct from 90 then
        raise exception 'AUTOTESTE: receita nao foi criada com o valor recebido';
      end if;

      select count(*) into quantidade from public.parcelas where id = parcela_teste and transacao_id = transacao_teste;
      if quantidade <> 1 then
        raise exception 'AUTOTESTE: parcela nao foi ligada a receita';
      end if;

      begin
        perform public.receber_parcela(parcela_teste, current_date, 90, null);
        raise exception 'AUTOTESTE: parcela foi recebida duas vezes';
      exception when unique_violation then
        null;
      end;

      delete from public.transacoes where id = transacao_teste;
      select count(*) into quantidade from public.parcelas where id = parcela_teste and transacao_id is null;
      if quantidade <> 1 then
        raise exception 'AUTOTESTE: excluir a receita nao reabriu a parcela';
      end if;

      raise exception 'desfazer' using errcode = 'ZZ001';
    exception when sqlstate 'ZZ001' then
      null;
    end;
    perform set_config('role', 'none', true);

    if negado_id is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', negado_id, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      begin
        insert into public.parcelas (evento_id, descricao, valor, vencimento) values (evento_teste, 'autoteste', 1, current_date);
        raise exception 'AUTOTESTE: conta nao aprovada criou parcela';
      exception when insufficient_privilege then
        null;
      end;
      begin
        perform public.receber_parcela(gen_random_uuid(), current_date, 1, null);
        raise exception 'AUTOTESTE: conta nao aprovada recebeu parcela';
      exception when insufficient_privilege then
        null;
      end;
      perform set_config('role', 'none', true);
    end if;
  end if;

  if has_function_privilege('anon', 'public.receber_parcela(uuid, date, numeric, integer)', 'execute') then
    raise exception 'AUTOTESTE: visitante pode executar receber_parcela';
  end if;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin
    perform 1 from public.parcelas limit 1;
    raise exception 'AUTOTESTE: visitante leu parcelas';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.receber_parcela(gen_random_uuid(), current_date, 1, null);
    raise exception 'AUTOTESTE: visitante recebeu parcela';
  exception when insufficient_privilege then
    null;
  end;
  perform set_config('role', 'none', true);

  select count(*) into quantidade from public.parcelas;
  if quantidade <> 0 then raise exception 'AUTOTESTE: teste deixou parcela'; end if;
  select count(*), coalesce(sum(valor), 0) into quantidade, valor_lido from public.transacoes;
  if quantidade <> total_transacoes or valor_lido <> soma_transacoes then
    raise exception 'AUTOTESTE: transacoes mudaram';
  end if;
end;
$$;

commit;
