-- Follow-up: cada contato passa a registrar o que aconteceu.
--
-- O que muda:
--   1. lead_followups ganha resultado.
--   2. leads ganha motivo_perda, convidados e horario.
--   3. A funcao registrar_contato grava resultado, proximo contato e etapa juntos.
--
-- So acrescenta campos e nao altera nenhum registro existente. Se o autoteste do
-- final falhar, tudo e desfeito. Para voltar atras, use o arquivo em supabase/rollback.

begin;

alter table public.lead_followups
  add column resultado text
  constraint lead_followups_resultado_check check (
    resultado is null or resultado in (
      'sem_resposta', 'avaliando', 'caro', 'reuniao', 'retornar', 'quer_fechar', 'desistiu', 'orcamento_enviado'
    )
  ),
  add column feito_em timestamptz;

alter table public.leads
  add column motivo_perda text,
  add column convidados integer constraint leads_convidados_check check (convidados is null or convidados >= 0),
  add column horario text;

create function public.registrar_contato(
  p_lead_id uuid,
  p_followup_id uuid,
  p_resultado text,
  p_proximo timestamptz,
  p_nota text,
  p_status text,
  p_motivo text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_linhas integer;
  v_proximo uuid;
begin
  if not public.is_approved() then
    raise exception 'Conta sem permissao para registrar contatos.' using errcode = '42501';
  end if;

  perform 1 from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead nao encontrado.' using errcode = 'P0002';
  end if;

  if p_status is not null and p_status not in ('Novo Lead', 'Proposta Enviada', 'Em Negociação', 'Perdido') then
    raise exception 'Etapa invalida.' using errcode = '22023';
  end if;

  if p_status = 'Perdido' and p_proximo is not null then
    raise exception 'Lead perdido nao tem proximo contato.' using errcode = '22023';
  end if;

  if p_followup_id is not null then
    update public.lead_followups
    set done = true, resultado = p_resultado, feito_em = now()
    where id = p_followup_id and lead_id = p_lead_id;
    get diagnostics v_linhas = row_count;
    if v_linhas = 0 then
      raise exception 'Contato nao encontrado neste lead.' using errcode = 'P0002';
    end if;
  else
    insert into public.lead_followups (user_id, lead_id, type, scheduled_at, notes, done, resultado, feito_em)
    values (auth.uid(), p_lead_id, 'WhatsApp', now(), null, true, p_resultado, now());
  end if;

  if p_status = 'Perdido' then
    update public.leads set status = 'Perdido', motivo_perda = p_motivo where id = p_lead_id;
    update public.lead_followups set done = true where lead_id = p_lead_id and done is not true;
  elsif p_status is not null then
    update public.leads set status = p_status where id = p_lead_id;
  end if;

  if p_proximo is not null then
    insert into public.lead_followups (user_id, lead_id, type, scheduled_at, notes, done)
    values (auth.uid(), p_lead_id, 'WhatsApp', p_proximo, nullif(trim(p_nota), ''), false)
    returning id into v_proximo;
  end if;

  return v_proximo;
end;
$$;

revoke all on function public.registrar_contato(uuid, uuid, text, timestamptz, text, text, text) from public, anon;
grant execute on function public.registrar_contato(uuid, uuid, text, timestamptz, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Autoteste: qualquer falha desfaz a migracao inteira
-- ---------------------------------------------------------------------------
do $$
declare
  admin_id uuid;
  negado_id uuid;
  lead_teste uuid;
  novo_contato uuid;
  contato_anterior uuid;
  texto text;
  quantidade bigint;
  total_leads bigint;
  total_contatos bigint;
  total_pendentes bigint;
  total_transacoes bigint;
begin
  select user_id into admin_id from public.user_profiles where role = 'admin' limit 1;
  select user_id into negado_id from public.user_profiles where role in ('denied', 'pending') limit 1;
  select id into lead_teste from public.leads where status <> 'Fechado' limit 1;
  select count(*) into total_leads from public.leads;
  select count(*) into total_contatos from public.lead_followups;
  select count(*) into total_pendentes from public.lead_followups where done is not true;
  select count(*) into total_transacoes from public.transacoes;

  if admin_id is null then
    raise exception 'AUTOTESTE: nenhuma conta admin encontrada';
  end if;

  if lead_teste is not null then
    -- Usa um lead de verdade dentro de um bloco que e sempre desfeito.
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);

      novo_contato := public.registrar_contato(lead_teste, null, 'sem_resposta', now() + interval '2 days', 'autoteste', null, null);
      if novo_contato is null then
        raise exception 'AUTOTESTE: proximo contato nao foi criado';
      end if;

      contato_anterior := novo_contato;
      novo_contato := public.registrar_contato(lead_teste, contato_anterior, 'caro', now() + interval '2 days', 'autoteste', 'Em Negociação', null);
      select status into texto from public.leads where id = lead_teste;
      if texto <> 'Em Negociação' then
        raise exception 'AUTOTESTE: etapa nao mudou';
      end if;
      select count(*) into quantidade from public.lead_followups where id = contato_anterior and done is true and resultado = 'caro' and feito_em is not null;
      if quantidade <> 1 then
        raise exception 'AUTOTESTE: contato nao foi encerrado com o resultado';
      end if;

      begin
        perform public.registrar_contato(lead_teste, null, 'invalido', null, null, null, null);
        raise exception 'AUTOTESTE: resultado invalido foi aceito';
      exception when check_violation then
        null;
      end;

      begin
        perform public.registrar_contato(lead_teste, null, 'desistiu', now(), null, 'Perdido', 'teste');
        raise exception 'AUTOTESTE: perdido com proximo contato foi aceito';
      exception when invalid_parameter_value then
        null;
      end;

      perform public.registrar_contato(lead_teste, null, 'desistiu', null, null, 'Perdido', 'Ficou caro');
      select motivo_perda into texto from public.leads where id = lead_teste;
      if texto is distinct from 'Ficou caro' then
        raise exception 'AUTOTESTE: motivo nao foi gravado';
      end if;
      select count(*) into quantidade from public.lead_followups where lead_id = lead_teste and done is not true;
      if quantidade <> 0 then
        raise exception 'AUTOTESTE: lead perdido ficou com contato pendente';
      end if;

      raise exception 'desfazer' using errcode = 'ZZ001';
    exception when sqlstate 'ZZ001' then
      null;
    end;
    perform set_config('role', 'none', true);
  end if;

  if negado_id is not null and lead_teste is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', negado_id, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    begin
      perform public.registrar_contato(lead_teste, null, 'sem_resposta', null, null, null, null);
      raise exception 'AUTOTESTE: conta nao aprovada registrou contato';
    exception when insufficient_privilege then
      null;
    end;
    perform set_config('role', 'none', true);
  end if;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin
    perform public.registrar_contato(gen_random_uuid(), null, 'sem_resposta', null, null, null, null);
    raise exception 'AUTOTESTE: visitante registrou contato';
  exception when insufficient_privilege then
    null;
  end;
  perform set_config('role', 'none', true);

  select count(*) into quantidade from public.leads;
  if quantidade <> total_leads then raise exception 'AUTOTESTE: total de leads mudou'; end if;
  select count(*) into quantidade from public.lead_followups;
  if quantidade <> total_contatos then raise exception 'AUTOTESTE: total de contatos mudou'; end if;
  select count(*) into quantidade from public.lead_followups where done is not true;
  if quantidade <> total_pendentes then raise exception 'AUTOTESTE: contatos pendentes mudaram'; end if;
  select count(*) into quantidade from public.transacoes;
  if quantidade <> total_transacoes then raise exception 'AUTOTESTE: transacoes mudaram'; end if;
end;
$$;

commit;
