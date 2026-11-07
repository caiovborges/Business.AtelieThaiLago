-- Follow-up: classifica sozinho quem ficou 3 dias aguardando resposta.
--
-- O que muda:
--   A funcao classificar_sem_resposta encerra o contato como sem resposta e agenda o
--   proximo, para as 9h no horario de Brasilia, no prazo da tentativa:
--     sem orcamento: 2, 25 e 30 dias; com orcamento: 7, 14 e 30 dias.
--   Estes prazos sao os mesmos de diasAteProximo em leadContato.ts: mude nos dois.
--
-- A funcao nao roda sozinha aqui: quem a chama e o agendamento da migracao seguinte.
-- Nao altera nenhum registro existente. Se o autoteste do final falhar, tudo e
-- desfeito. Para voltar atras, use o arquivo em supabase/rollback.

begin;

create function public.classificar_sem_resposta(p_agora timestamptz default now())
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
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
      and l.status in ('Novo Lead', 'Proposta Enviada', 'Em Negociação')
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

    v_tem_orcamento := v_contato.status in ('Proposta Enviada', 'Em Negociação')
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
$$;

-- So o agendamento do banco chama: as telas nao executam esta funcao.
revoke all on function public.classificar_sem_resposta(timestamptz) from public, anon, authenticated;
grant execute on function public.classificar_sem_resposta(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Autoteste: qualquer falha desfaz a migracao inteira
-- ---------------------------------------------------------------------------
do $$
declare
  admin_id uuid;
  lead_teste uuid;
  lead_orcamento uuid;
  lead_perdido uuid;
  contato_recente uuid;
  envio timestamptz := '2026-03-10 15:00:00+00';
  agora timestamptz := '2026-03-13 15:00:00+00';
  esperado timestamptz;
  achado timestamptz;
  quantidade bigint;
  texto text;
  total_contatos bigint;
  total_pendentes bigint;
  prazo integer;
  ordem integer := 0;
begin
  select user_id into admin_id from public.user_profiles where role = 'admin' limit 1;
  if admin_id is null then
    raise exception 'AUTOTESTE: nenhuma conta admin encontrada';
  end if;
  select count(*) into total_contatos from public.lead_followups;
  select count(*) into total_pendentes from public.lead_followups where done is not true;

  -- Bloco sempre desfeito no final. O envio antigo so casa com p_agora do teste.
  begin
    insert into public.leads (user_id, name, status) values (admin_id, 'autoteste', 'Novo Lead') returning id into lead_teste;
    insert into public.leads (user_id, name, status) values (admin_id, 'autoteste', 'Proposta Enviada') returning id into lead_orcamento;
    insert into public.leads (user_id, name, status) values (admin_id, 'autoteste', 'Perdido') returning id into lead_perdido;

    insert into public.lead_followups (user_id, lead_id, type, scheduled_at, done, enviada_em)
    values (admin_id, lead_perdido, 'WhatsApp', envio, false, envio);
    insert into public.lead_followups (user_id, lead_id, type, scheduled_at, done, enviada_em)
    values (admin_id, lead_teste, 'WhatsApp', envio, false, agora - interval '71 hours')
    returning id into contato_recente;

    if public.classificar_sem_resposta(agora) <> 0 then
      raise exception 'AUTOTESTE: classificou antes dos 3 dias ou lead perdido';
    end if;
    if (select done from public.lead_followups where id = contato_recente) is true then
      raise exception 'AUTOTESTE: contato recente foi encerrado';
    end if;
    delete from public.lead_followups where id = contato_recente;

    -- Sequencia sem orcamento: 2, 25 e 30 dias depois do fim da espera.
    foreach prazo in array array[2, 25, 30] loop
      ordem := ordem + 1;
      envio := '2026-03-10 15:00:00+00'::timestamptz + (ordem || ' months')::interval;
      agora := envio + interval '3 days';
      update public.lead_followups set enviada_em = envio where lead_id = lead_teste and done is not true;
      if ordem = 1 then
        insert into public.lead_followups (user_id, lead_id, type, scheduled_at, done, enviada_em)
        values (admin_id, lead_teste, 'WhatsApp', envio, false, envio);
      end if;

      if public.classificar_sem_resposta(agora) <> 1 then
        raise exception 'AUTOTESTE: tentativa % nao foi classificada', ordem;
      end if;
      if public.classificar_sem_resposta(agora) <> 0 then
        raise exception 'AUTOTESTE: tentativa % foi classificada duas vezes', ordem;
      end if;

      select count(*) into quantidade from public.lead_followups
      where lead_id = lead_teste and done is true and resultado = 'sem_resposta';
      if quantidade <> ordem then
        raise exception 'AUTOTESTE: tentativas registradas erradas: %', quantidade;
      end if;

      esperado := (((agora at time zone 'America/Sao_Paulo')::date + prazo) + time '09:00') at time zone 'America/Sao_Paulo';
      select scheduled_at, notes into achado, texto from public.lead_followups where lead_id = lead_teste and done is not true;
      if achado is distinct from esperado then
        raise exception 'AUTOTESTE: tentativa % agendou % em vez de %', ordem, achado, esperado;
      end if;
      if texto is distinct from 'Tentativa ' || (ordem + 1) || ' de 4' then
        raise exception 'AUTOTESTE: anotacao errada: %', texto;
      end if;
    end loop;

    -- Com orcamento: o primeiro prazo e 7 dias.
    envio := '2026-08-10 15:00:00+00';
    agora := envio + interval '3 days';
    insert into public.lead_followups (user_id, lead_id, type, scheduled_at, done, enviada_em)
    values (admin_id, lead_orcamento, 'WhatsApp', envio, false, envio);
    perform public.classificar_sem_resposta(agora);
    esperado := (((agora at time zone 'America/Sao_Paulo')::date + 7) + time '09:00') at time zone 'America/Sao_Paulo';
    select scheduled_at into achado from public.lead_followups where lead_id = lead_orcamento and done is not true;
    if achado is distinct from esperado then
      raise exception 'AUTOTESTE: com orcamento agendou % em vez de %', achado, esperado;
    end if;

    -- Outro resultado zera a contagem.
    update public.lead_followups set done = true, resultado = 'avaliando', feito_em = '2026-09-01 12:00:00+00'
    where lead_id = lead_orcamento and done is not true;
    envio := '2026-09-10 15:00:00+00';
    agora := envio + interval '3 days';
    insert into public.lead_followups (user_id, lead_id, type, scheduled_at, done, enviada_em)
    values (admin_id, lead_orcamento, 'WhatsApp', envio, false, envio);
    perform public.classificar_sem_resposta(agora);
    select notes into texto from public.lead_followups where lead_id = lead_orcamento and done is not true;
    if texto is distinct from 'Tentativa 2 de 4' then
      raise exception 'AUTOTESTE: resposta nao zerou as tentativas: %', texto;
    end if;

    if (select done from public.lead_followups where lead_id = lead_perdido limit 1) is true then
      raise exception 'AUTOTESTE: lead perdido foi alterado';
    end if;

    raise exception 'desfazer' using errcode = 'ZZ001';
  exception when sqlstate 'ZZ001' then
    null;
  end;

  if has_function_privilege('anon', 'public.classificar_sem_resposta(timestamptz)', 'execute') then
    raise exception 'AUTOTESTE: visitante pode executar a funcao';
  end if;
  if has_function_privilege('authenticated', 'public.classificar_sem_resposta(timestamptz)', 'execute') then
    raise exception 'AUTOTESTE: conta logada pode executar a funcao';
  end if;

  select count(*) into quantidade from public.lead_followups;
  if quantidade <> total_contatos then raise exception 'AUTOTESTE: total de contatos mudou'; end if;
  select count(*) into quantidade from public.lead_followups where done is not true;
  if quantidade <> total_pendentes then raise exception 'AUTOTESTE: contatos pendentes mudaram'; end if;
  select count(*) into quantidade from public.leads where name = 'autoteste';
  if quantidade <> 0 then raise exception 'AUTOTESTE: teste deixou lead'; end if;
end;
$$;

commit;
