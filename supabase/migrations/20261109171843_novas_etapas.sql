-- Novas etapas do funil de leads.
--   Novo Lead -> Em Conversa -> Orcamento Enviado -> Negociando -> Aguardando Sinal -> Fechado
--   Saidas: Sem Resposta (sumiu depois de todas as tentativas) e Perdido.
-- Renomeia Proposta Enviada e Em Negociacao, passa para Em Conversa os novos leads que ja
-- tiveram contato e atualiza as funcoes do banco que usam os nomes das etapas.

begin;

-- 1. Dados
update public.leads set status = 'Orçamento Enviado' where status = 'Proposta Enviada';
update public.leads set status = 'Negociando' where status = 'Em Negociação';
update public.leads l set status = 'Em Conversa'
 where l.status = 'Novo Lead'
   and exists (select 1 from public.lead_followups f
               where f.lead_id = l.id and (f.done is true or f.enviada_em is not null));
update public.leads set status = 'Sem Resposta' where status = 'Perdido' and motivo_perda = 'Sem resposta';

alter table public.leads alter column status set default 'Novo Lead';

-- 2. Mensagem para cobrar o sinal (editavel na tela Mensagens)
alter table public.mensagens_followup drop constraint mensagens_followup_chave_check;
alter table public.mensagens_followup add constraint mensagens_followup_chave_check check (chave = any (array[
  'primeiro', 'continuidade', 'retomar', 'encerramento', 'posOrcamento', 'caro', 'lembrete', 'reuniao',
  'confirmarReuniao', 'sinal'
]));

-- 3. Registrar contato: aceita as novas etapas; Sem Resposta encerra o lead como Perdido.
create or replace function public.registrar_contato(
  p_lead_id uuid, p_followup_id uuid, p_resultado text, p_proximo timestamptz,
  p_nota text, p_status text, p_motivo text
)
returns uuid
language plpgsql
set search_path to ''
as $function$
declare
  v_linhas integer;
  v_proximo uuid;
  v_encerra boolean := p_status in ('Perdido', 'Sem Resposta');
begin
  if not public.is_approved() then
    raise exception 'Conta sem permissao para registrar contatos.' using errcode = '42501';
  end if;

  perform 1 from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead nao encontrado.' using errcode = 'P0002';
  end if;

  if p_status is not null and p_status not in (
    'Novo Lead', 'Em Conversa', 'Orçamento Enviado', 'Negociando', 'Aguardando Sinal', 'Sem Resposta', 'Perdido'
  ) then
    raise exception 'Etapa invalida.' using errcode = '22023';
  end if;

  if v_encerra and p_proximo is not null then
    raise exception 'Lead encerrado nao tem proximo contato.' using errcode = '22023';
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

  if v_encerra then
    update public.leads set status = p_status, motivo_perda = p_motivo where id = p_lead_id;
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
$function$;

-- 4. Classificacao automatica: novas etapas ativas e quais contam como "com orcamento".
create or replace function public.classificar_sem_resposta(p_agora timestamptz default now())
returns integer
language plpgsql
set search_path to ''
as $function$
declare
  v_contato record;
  v_anterior record;
  v_tentativas integer;
  v_tem_orcamento boolean;
  v_prazo integer;
  v_fim_da_espera timestamptz;
  v_total integer := 0;
begin
  for v_contato in
    select f.id, f.lead_id, f.user_id, f.type, f.enviada_em, l.status
    from public.lead_followups f
    join public.leads l on l.id = f.lead_id
    where f.done is not true
      and f.enviada_em is not null
      and f.enviada_em <= p_agora - interval '3 days'
      and l.status in ('Novo Lead', 'Em Conversa', 'Orçamento Enviado', 'Negociando', 'Aguardando Sinal')
    for update of f
  loop
    -- So contam os "sem resposta" seguidos: qualquer outro resultado zera a contagem.
    v_tentativas := 0;
    for v_anterior in
      select resultado from public.lead_followups
      where lead_id = v_contato.lead_id and done is true
      order by coalesce(feito_em, scheduled_at) desc
    loop
      exit when v_anterior.resultado is distinct from 'sem_resposta';
      v_tentativas := v_tentativas + 1;
    end loop;

    v_tem_orcamento := v_contato.status in ('Orçamento Enviado', 'Negociando', 'Aguardando Sinal')
      or exists (select 1 from public.propostas where lead_id = v_contato.lead_id);

    v_prazo := (case when v_tem_orcamento then array[7, 14, 30] else array[2, 25, 30] end)[least(v_tentativas + 1, 3)];
    v_fim_da_espera := v_contato.enviada_em + interval '3 days';

    update public.lead_followups
    set done = true, resultado = 'sem_resposta', feito_em = v_contato.enviada_em
    where id = v_contato.id;

    insert into public.lead_followups (user_id, lead_id, type, scheduled_at, notes, done)
    values (
      v_contato.user_id,
      v_contato.lead_id,
      v_contato.type,
      (((v_fim_da_espera at time zone 'America/Sao_Paulo')::date + v_prazo) + time '09:00') at time zone 'America/Sao_Paulo',
      'Tentativa ' || (v_tentativas + 2) || ' de 4',
      false
    );

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$function$;

revoke execute on function public.classificar_sem_resposta(timestamptz) from public, anon, authenticated;

-- 5. Autoteste: tudo que ele grava e desfeito no final.
do $$
declare
  admin_id uuid;
  lead_teste uuid;
  lead_sinal uuid;
  contato uuid;
  envio timestamptz := '2026-03-10 15:00:00+00';
  esperado timestamptz;
  achado timestamptz;
  quantidade bigint;
  total_contatos bigint;
begin
  select count(*) into quantidade from public.leads
   where status in ('Proposta Enviada', 'Em Negociação', 'Novo') ;
  if quantidade <> 0 then raise exception 'AUTOTESTE: sobrou lead com etapa antiga: %', quantidade; end if;

  select count(*) into quantidade from public.leads l
   where l.status = 'Novo Lead'
     and exists (select 1 from public.lead_followups f where f.lead_id = l.id and (f.done is true or f.enviada_em is not null));
  if quantidade <> 0 then raise exception 'AUTOTESTE: novo lead com contato ficou em Novo Lead'; end if;

  select user_id into admin_id from public.user_profiles where role = 'admin' limit 1;
  if admin_id is null then raise exception 'AUTOTESTE: nenhuma conta admin encontrada'; end if;
  select count(*) into total_contatos from public.lead_followups;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);

    insert into public.leads (user_id, name) values (admin_id, 'autoteste') returning id into lead_teste;
    if (select status from public.leads where id = lead_teste) <> 'Novo Lead' then
      raise exception 'AUTOTESTE: etapa padrao errada';
    end if;

    -- Aguardando Sinal conta como "com orcamento": primeiro prazo de 7 dias.
    insert into public.leads (user_id, name, status) values (admin_id, 'autoteste', 'Aguardando Sinal') returning id into lead_sinal;
    insert into public.lead_followups (user_id, lead_id, type, scheduled_at, done, enviada_em)
    values (admin_id, lead_sinal, 'WhatsApp', envio, false, envio);
    if public.classificar_sem_resposta(envio + interval '3 days') <> 1 then
      raise exception 'AUTOTESTE: Aguardando Sinal nao foi classificado';
    end if;
    esperado := ((((envio + interval '3 days') at time zone 'America/Sao_Paulo')::date + 7) + time '09:00') at time zone 'America/Sao_Paulo';
    select scheduled_at into achado from public.lead_followups where lead_id = lead_sinal and done is not true;
    if achado is distinct from esperado then
      raise exception 'AUTOTESTE: Aguardando Sinal agendou % em vez de %', achado, esperado;
    end if;

    -- Etapa nova aceita no registro de contato.
    perform public.registrar_contato(lead_teste, null, 'quer_fechar', now() + interval '3 days', 'Cobrar sinal', 'Aguardando Sinal', null);
    if (select status from public.leads where id = lead_teste) <> 'Aguardando Sinal' then
      raise exception 'AUTOTESTE: registrar_contato nao gravou Aguardando Sinal';
    end if;

    -- Etapa antiga recusada.
    begin
      perform public.registrar_contato(lead_teste, null, 'caro', null, null, 'Em Negociação', null);
      raise exception 'AUTOTESTE: aceitou etapa antiga';
    exception when sqlstate '22023' then null;
    end;

    -- Sem Resposta encerra: fecha os contatos pendentes e guarda o motivo.
    begin
      perform public.registrar_contato(lead_teste, null, 'sem_resposta', now() + interval '1 day', null, 'Sem Resposta', 'Sem resposta');
      raise exception 'AUTOTESTE: Sem Resposta aceitou proximo contato';
    exception when sqlstate '22023' then null;
    end;
    perform public.registrar_contato(lead_teste, null, 'sem_resposta', null, null, 'Sem Resposta', 'Sem resposta');
    if (select status from public.leads where id = lead_teste) <> 'Sem Resposta'
       or (select motivo_perda from public.leads where id = lead_teste) is distinct from 'Sem resposta' then
      raise exception 'AUTOTESTE: Sem Resposta nao foi gravado';
    end if;
    select count(*) into quantidade from public.lead_followups where lead_id = lead_teste and done is not true;
    if quantidade <> 0 then raise exception 'AUTOTESTE: Sem Resposta deixou contato pendente'; end if;

    -- Lead encerrado nao e classificado.
    insert into public.lead_followups (user_id, lead_id, type, scheduled_at, done, enviada_em)
    values (admin_id, lead_teste, 'WhatsApp', envio, false, envio) returning id into contato;
    if public.classificar_sem_resposta(envio + interval '3 days') <> 0 then
      raise exception 'AUTOTESTE: classificou lead Sem Resposta';
    end if;

    insert into public.mensagens_followup (chave, texto) values ('sinal', 'autoteste')
      on conflict (chave) do update set texto = excluded.texto;

    raise exception 'desfazer' using errcode = 'ZZ001';
  exception when sqlstate 'ZZ001' then
    null;
  end;

  if has_function_privilege('anon', 'public.classificar_sem_resposta(timestamptz)', 'execute') then
    raise exception 'AUTOTESTE: visitante pode executar a classificacao';
  end if;
  select count(*) into quantidade from public.lead_followups;
  if quantidade <> total_contatos then raise exception 'AUTOTESTE: total de contatos mudou'; end if;
  select count(*) into quantidade from public.leads where name = 'autoteste';
  if quantidade <> 0 then raise exception 'AUTOTESTE: teste deixou lead'; end if;
  select count(*) into quantidade from public.mensagens_followup where texto = 'autoteste';
  if quantidade <> 0 then raise exception 'AUTOTESTE: teste deixou mensagem'; end if;
end;
$$;

commit;
