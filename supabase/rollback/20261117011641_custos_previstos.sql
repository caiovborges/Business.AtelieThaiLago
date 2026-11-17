-- Desfaz 20261117011641_custos_previstos.
-- As colunas antigas (custo_prev_*, custos_personalizados, pintoras) continuam intactas,
-- mas o que foi planejado DEPOIS da migracao so existe em custos_previstos e e perdido.
-- Rode npm run backup antes.

begin;

-- fechar_lead volta a gravar o deslocamento so na coluna antiga
create or replace function public.fechar_lead(p_lead_id uuid, p_valor numeric, p_plano text, p_servico text, p_custo_deslocamento numeric, p_proposta_id uuid, p_contrato text)
returns uuid
language plpgsql
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

drop function public.salvar_custos_previstos(uuid, jsonb);
drop table public.custos_previstos;
-- A categoria Deslocamento fica: pode ja ter despesas lancadas nela.

commit;
