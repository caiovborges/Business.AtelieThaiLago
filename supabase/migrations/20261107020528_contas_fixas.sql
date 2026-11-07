-- Contas fixas: despesas que se repetem todo mes.
--
-- O que muda:
--   1. contas_fixas guarda cada conta uma vez, com o valor e o dia de vencimento.
--   2. contas_fixas_meses marca o que ja foi resolvido em cada mes. Com transacao_id,
--      foi pago; sem transacao_id, a conta nao teve naquele mes.
--   3. A funcao pagar_conta_fixa cria a despesa e marca o mes, juntos, e guarda o
--      valor pago como sugestao do mes seguinte.
--      Excluir essa despesa no financeiro devolve o mes para a lista de confirmar.
--
-- Nao altera nenhum registro existente. Se o autoteste do final falhar, tudo e
-- desfeito. Para voltar atras, use o arquivo em supabase/rollback.

begin;

create table public.contas_fixas (
  id uuid primary key default gen_random_uuid(),
  descricao text not null
    constraint contas_fixas_descricao_check check (length(trim(descricao)) between 1 and 200),
  valor numeric(12, 2) not null
    constraint contas_fixas_valor_check check (valor > 0),
  dia_vencimento integer not null
    constraint contas_fixas_dia_check check (dia_vencimento between 1 and 31),
  categoria_id integer references public.categorias (id) on delete set null,
  inicio date not null
    constraint contas_fixas_inicio_check check (extract(day from inicio) = 1),
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.contas_fixas_meses (
  conta_id uuid not null references public.contas_fixas (id) on delete cascade,
  mes date not null
    constraint contas_fixas_meses_mes_check check (extract(day from mes) = 1),
  transacao_id uuid unique references public.transacoes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conta_id, mes)
);

alter table public.contas_fixas enable row level security;
revoke all on public.contas_fixas from public, anon;
grant select, insert, update, delete on public.contas_fixas to authenticated;
grant all on public.contas_fixas to service_role;

create policy "Aprovados tem acesso total" on public.contas_fixas
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));

alter table public.contas_fixas_meses enable row level security;
revoke all on public.contas_fixas_meses from public, anon;
grant select, insert, update, delete on public.contas_fixas_meses to authenticated;
grant all on public.contas_fixas_meses to service_role;

create policy "Aprovados tem acesso total" on public.contas_fixas_meses
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));

create function public.pagar_conta_fixa(
  p_conta_id uuid,
  p_mes date,
  p_data date,
  p_valor numeric
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conta public.contas_fixas%rowtype;
  v_transacao uuid;
begin
  if not public.is_approved() then
    raise exception 'Conta sem permissao para confirmar pagamentos.' using errcode = '42501';
  end if;

  if p_mes is null or p_data is null or p_valor is null or p_valor <= 0 then
    raise exception 'Informe o mes, a data e um valor maior que zero.' using errcode = '22023';
  end if;

  select * into v_conta from public.contas_fixas where id = p_conta_id for update;
  if not found then
    raise exception 'Conta fixa nao encontrada.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.contas_fixas_meses where conta_id = p_conta_id and mes = p_mes) then
    raise exception 'Este mes ja foi resolvido.' using errcode = '23505';
  end if;

  insert into public.transacoes (evento_id, user_id, tipo, descricao, valor, data, categoria_id)
  values (null, auth.uid(), 'despesa', v_conta.descricao, round(p_valor, 2), p_data, v_conta.categoria_id)
  returning id into v_transacao;

  insert into public.contas_fixas_meses (conta_id, mes, transacao_id)
  values (p_conta_id, p_mes, v_transacao);

  update public.contas_fixas set valor = round(p_valor, 2) where id = p_conta_id;

  return v_transacao;
end;
$$;

revoke all on function public.pagar_conta_fixa(uuid, date, date, numeric) from public, anon;
grant execute on function public.pagar_conta_fixa(uuid, date, date, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Autoteste: qualquer falha desfaz a migracao inteira
-- ---------------------------------------------------------------------------
do $$
declare
  admin_id uuid;
  negado_id uuid;
  conta_teste uuid;
  transacao_teste uuid;
  mes_teste date := date_trunc('month', current_date)::date;
  quantidade bigint;
  valor_lido numeric;
  total_transacoes bigint;
  soma_transacoes numeric;
begin
  select user_id into admin_id from public.user_profiles where role = 'admin' limit 1;
  select user_id into negado_id from public.user_profiles where role in ('denied', 'pending') limit 1;
  select count(*), coalesce(sum(valor), 0) into total_transacoes, soma_transacoes from public.transacoes;

  if admin_id is null then
    raise exception 'AUTOTESTE: nenhuma conta admin encontrada';
  end if;

  -- Bloco sempre desfeito no final.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    insert into public.contas_fixas (descricao, valor, dia_vencimento, inicio)
    values ('autoteste', 50, 10, mes_teste)
    returning id into conta_teste;

    begin
      insert into public.contas_fixas (descricao, valor, dia_vencimento, inicio) values ('autoteste', 50, 32, mes_teste);
      raise exception 'AUTOTESTE: dia invalido foi aceito';
    exception when check_violation then
      null;
    end;

    begin
      perform public.pagar_conta_fixa(conta_teste, mes_teste, current_date, 0);
      raise exception 'AUTOTESTE: pagamento de valor zero foi aceito';
    exception when invalid_parameter_value then
      null;
    end;

    transacao_teste := public.pagar_conta_fixa(conta_teste, mes_teste, current_date, 60);

    select valor into valor_lido from public.transacoes
    where id = transacao_teste and tipo = 'despesa' and evento_id is null and user_id = admin_id;
    if valor_lido is distinct from 60 then
      raise exception 'AUTOTESTE: despesa nao foi criada com o valor pago';
    end if;

    select valor into valor_lido from public.contas_fixas where id = conta_teste;
    if valor_lido is distinct from 60 then
      raise exception 'AUTOTESTE: valor pago nao virou sugestao';
    end if;

    begin
      perform public.pagar_conta_fixa(conta_teste, mes_teste, current_date, 60);
      raise exception 'AUTOTESTE: mes foi pago duas vezes';
    exception when unique_violation then
      null;
    end;

    delete from public.transacoes where id = transacao_teste;
    select count(*) into quantidade from public.contas_fixas_meses where conta_id = conta_teste and mes = mes_teste;
    if quantidade <> 0 then
      raise exception 'AUTOTESTE: excluir a despesa nao reabriu o mes';
    end if;

    transacao_teste := public.pagar_conta_fixa(conta_teste, mes_teste, current_date, 60);
    delete from public.contas_fixas where id = conta_teste;
    select count(*) into quantidade from public.transacoes where id = transacao_teste;
    if quantidade <> 1 then
      raise exception 'AUTOTESTE: excluir a conta apagou a despesa';
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
      insert into public.contas_fixas (descricao, valor, dia_vencimento, inicio) values ('autoteste', 1, 1, mes_teste);
      raise exception 'AUTOTESTE: conta nao aprovada criou conta fixa';
    exception when insufficient_privilege then
      null;
    end;
    begin
      perform public.pagar_conta_fixa(gen_random_uuid(), mes_teste, current_date, 1);
      raise exception 'AUTOTESTE: conta nao aprovada confirmou pagamento';
    exception when insufficient_privilege then
      null;
    end;
    perform set_config('role', 'none', true);
  end if;

  if has_function_privilege('anon', 'public.pagar_conta_fixa(uuid, date, date, numeric)', 'execute') then
    raise exception 'AUTOTESTE: visitante pode executar pagar_conta_fixa';
  end if;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin
    perform 1 from public.contas_fixas limit 1;
    raise exception 'AUTOTESTE: visitante leu contas fixas';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform 1 from public.contas_fixas_meses limit 1;
    raise exception 'AUTOTESTE: visitante leu os meses das contas';
  exception when insufficient_privilege then
    null;
  end;
  perform set_config('role', 'none', true);

  select count(*) into quantidade from public.contas_fixas;
  if quantidade <> 0 then raise exception 'AUTOTESTE: teste deixou conta fixa'; end if;
  select count(*), coalesce(sum(valor), 0) into quantidade, valor_lido from public.transacoes;
  if quantidade <> total_transacoes or valor_lido <> soma_transacoes then
    raise exception 'AUTOTESTE: transacoes mudaram';
  end if;
end;
$$;

commit;
