-- Etapa 3: fechar um lead cria cliente e evento de uma vez, e os contratos
-- passam a ser abertos por qualquer conta aprovada.
--
-- O que muda:
--   1. eventos ganha lead_id e plano_fechado.
--   2. Um lead so pode gerar um evento.
--   3. A funcao fechar_lead faz tudo em uma unica transacao.
--   4. Contratos: leitura e exclusao para contas aprovadas; envio na propria pasta.
--
-- Nao altera nenhum registro existente. Se o autoteste do final falhar, tudo e
-- desfeito. Para voltar atras depois de aplicada, use o arquivo correspondente
-- em supabase/rollback.

begin;

alter table public.eventos
  add column lead_id uuid references public.leads (id) on delete set null,
  add column plano_fechado text;

create unique index eventos_lead_id_unico on public.eventos (lead_id) where lead_id is not null;

create function public.fechar_lead(
  p_lead_id uuid,
  p_valor numeric,
  p_plano text,
  p_servico text,
  p_custo_deslocamento numeric,
  p_proposta_id uuid,
  p_contrato text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_cliente uuid;
  v_evento uuid;
  v_email text;
  v_telefone text;
begin
  if not public.is_approved() then
    raise exception 'Conta sem permissao para fechar leads.' using errcode = '42501';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead nao encontrado.' using errcode = 'P0002';
  end if;

  if p_valor is null or p_valor < 0 then
    raise exception 'Valor invalido.' using errcode = '22023';
  end if;

  if exists (select 1 from public.eventos where lead_id = p_lead_id) then
    raise exception 'Este lead ja tem um evento.' using errcode = '23505';
  end if;

  -- Reaproveita o cliente com o mesmo e-mail ou telefone
  v_email := lower(trim(coalesce(v_lead.email, '')));
  v_telefone := right(regexp_replace(coalesce(v_lead.phone, ''), '\D', '', 'g'), 10);

  select c.id into v_cliente
  from public.clients c
  where (v_email <> '' and lower(trim(coalesce(c.email, ''))) = v_email)
     or (length(v_telefone) = 10 and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = v_telefone)
  order by c.created_at
  limit 1;

  if v_cliente is null then
    insert into public.clients (user_id, name, email, phone, instagram, interesse, cidade_id)
    values (auth.uid(), v_lead.name, v_lead.email, v_lead.phone, v_lead.instagram, v_lead.services, v_lead.cidade_id::integer)
    returning id into v_cliente;
  end if;

  insert into public.eventos (
    user_id, client_id, lead_id, nome, data_evento, status, servico, cidade_id, local,
    observacoes, contrato_url, valor_previsto, custo_prev_deslocamento, plano_fechado
  )
  values (
    auth.uid(), v_cliente, p_lead_id, v_lead.name, v_lead.event_date, 'Confirmado',
    case when nullif(trim(p_servico), '') is null then v_lead.services else array[p_servico] end,
    v_lead.cidade_id::integer, v_lead.location, v_lead.notes, nullif(p_contrato, ''), p_valor,
    coalesce(p_custo_deslocamento, 0), nullif(trim(p_plano), '')
  )
  returning id into v_evento;

  update public.leads set status = 'Fechado' where id = p_lead_id;
  update public.lead_followups set done = true where lead_id = p_lead_id and done is not true;

  if p_proposta_id is not null then
    update public.propostas set status = 'Aprovada', updated_at = now()
    where id = p_proposta_id and lead_id = p_lead_id;
  end if;

  return v_evento;
end;
$$;

revoke all on function public.fechar_lead(uuid, numeric, text, text, numeric, uuid, text) from public, anon;
grant execute on function public.fechar_lead(uuid, numeric, text, text, numeric, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Contratos
-- ---------------------------------------------------------------------------
drop policy "Users can read own contratos" on storage.objects;
drop policy "Users can upload contratos" on storage.objects;
drop policy "Users can delete own contratos" on storage.objects;

create policy "Aprovados leem contratos" on storage.objects
  for select to authenticated
  using (bucket_id = 'contratos' and (select public.is_approved()));
create policy "Aprovados enviam contratos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'contratos'
    and (select public.is_approved())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Aprovados apagam contratos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'contratos' and (select public.is_approved()));

-- ---------------------------------------------------------------------------
-- Autoteste: qualquer falha desfaz a migracao inteira
-- ---------------------------------------------------------------------------
do $$
declare
  admin_id uuid;
  aprovado_id uuid;
  negado_id uuid;
  lead_teste uuid;
  evento_teste uuid;
  total_contratos bigint;
  total_eventos bigint;
  total_clientes bigint;
  total_transacoes bigint;
  quantidade bigint;
  texto text;
  valor_teste numeric;
begin
  select user_id into admin_id from public.user_profiles where role = 'admin' limit 1;
  select user_id into negado_id from public.user_profiles where role in ('denied', 'pending') limit 1;
  select id into lead_teste from public.leads
    where status <> 'Fechado' and not exists (select 1 from public.eventos e where e.lead_id = leads.id) limit 1;
  select count(*) into total_contratos from storage.objects where bucket_id = 'contratos';
  select count(*) into total_eventos from public.eventos;
  select count(*) into total_clientes from public.clients;
  select count(*) into total_transacoes from public.transacoes;

  if admin_id is null then
    raise exception 'AUTOTESTE: nenhuma conta admin encontrada';
  end if;

  -- Toda conta aprovada ve todos os contratos.
  for aprovado_id in select user_id from public.user_profiles where role in ('admin', 'member') loop
    perform set_config('request.jwt.claims', json_build_object('sub', aprovado_id, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into quantidade from storage.objects where bucket_id = 'contratos';
    if quantidade <> total_contratos then
      raise exception 'AUTOTESTE: conta aprovada ve % de % contratos', quantidade, total_contratos;
    end if;
    perform set_config('role', 'none', true);
  end loop;

  -- Fechar um lead de verdade dentro de um bloco que e sempre desfeito.
  if lead_teste is not null then
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      evento_teste := public.fechar_lead(lead_teste, 1234.50, 'Plano autoteste', 'Aquarela dos Convidados', 100, null, null);

      select count(*) into quantidade from public.eventos
        where id = evento_teste and lead_id = lead_teste and status = 'Confirmado' and client_id is not null;
      if quantidade <> 1 then
        raise exception 'AUTOTESTE: evento nao foi criado corretamente';
      end if;
      select valor_previsto into valor_teste from public.eventos where id = evento_teste;
      if valor_teste <> 1234.50 then
        raise exception 'AUTOTESTE: valor do evento errado: %', valor_teste;
      end if;
      select status into texto from public.leads where id = lead_teste;
      if texto <> 'Fechado' then
        raise exception 'AUTOTESTE: lead nao ficou Fechado';
      end if;
      select count(*) into quantidade from public.lead_followups where lead_id = lead_teste and done is not true;
      if quantidade <> 0 then
        raise exception 'AUTOTESTE: follow-ups do lead continuaram pendentes';
      end if;

      begin
        perform public.fechar_lead(lead_teste, 1, null, null, 0, null, null);
        raise exception 'AUTOTESTE: lead fechado duas vezes';
      exception when unique_violation then
        null;
      end;

      raise exception 'desfazer' using errcode = 'ZZ001';
    exception when sqlstate 'ZZ001' then
      null;
    end;
    perform set_config('role', 'none', true);
  end if;

  -- Conta nao aprovada nao ve contratos, nao envia e nao fecha lead.
  if negado_id is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', negado_id, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into quantidade from storage.objects where bucket_id = 'contratos';
    if quantidade <> 0 then
      raise exception 'AUTOTESTE: conta nao aprovada ve % contratos', quantidade;
    end if;
    begin
      insert into storage.objects (bucket_id, name) values ('contratos', negado_id::text || '/autoteste.pdf');
      raise exception 'AUTOTESTE: conta nao aprovada enviou contrato';
    exception when insufficient_privilege then
      null;
    end;
    if lead_teste is not null then
      begin
        perform public.fechar_lead(lead_teste, 1, null, null, 0, null, null);
        raise exception 'AUTOTESTE: conta nao aprovada fechou lead';
      exception when insufficient_privilege then
        null;
      end;
    end if;
    perform set_config('role', 'none', true);
  end if;

  -- Visitante sem login nao ve contratos nem chama a funcao.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  select count(*) into quantidade from storage.objects where bucket_id = 'contratos';
  if quantidade <> 0 then
    raise exception 'AUTOTESTE: visitante ve % contratos', quantidade;
  end if;
  begin
    perform public.fechar_lead(gen_random_uuid(), 1, null, null, 0, null, null);
    raise exception 'AUTOTESTE: visitante chamou fechar_lead';
  exception when insufficient_privilege then
    null;
  end;
  perform set_config('role', 'none', true);

  -- Nada mudou nos dados.
  select count(*) into quantidade from public.eventos;
  if quantidade <> total_eventos then
    raise exception 'AUTOTESTE: total de eventos mudou';
  end if;
  select count(*) into quantidade from public.clients;
  if quantidade <> total_clientes then
    raise exception 'AUTOTESTE: total de clientes mudou';
  end if;
  select count(*) into quantidade from public.transacoes;
  if quantidade <> total_transacoes then
    raise exception 'AUTOTESTE: total de transacoes mudou';
  end if;
end;
$$;

commit;
