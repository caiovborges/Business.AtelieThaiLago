-- Nutricao de leads com casamento longe.
--
-- O que muda:
--   1. conteudos_nutricao: biblioteca de fotos e videos do atelie (links do Instagram/Drive).
--   2. leads.retomar_em: data em que o lead volta para o follow-up normal (ex.: 4 meses
--      antes do casamento). Enquanto houver data, o lead esta em nutricao.
--   3. lead_followups.nutricao marca o contato de nutricao e conteudo_id guarda o que foi enviado.
--   4. agendar_nutricao: coloca o lead em nutricao ou registra o conteudo enviado e agenda o
--      proximo contato. Quando o proximo cai na data de retomar, ele volta a ser um contato normal.
--   5. registrar_contato: qualquer resposta registrada tira o lead da nutricao.
--   6. Novos resultados (nutricao, retomar_perto) e mensagens (nutricao, retomarPerto).
--
-- Nao altera registros existentes. Se o autoteste do final falhar, tudo e desfeito.
-- Para voltar atras, use o arquivo em supabase/rollback.

begin;

-- 1. Biblioteca de conteudos
create table public.conteudos_nutricao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id),
  titulo text not null
    constraint conteudos_nutricao_titulo_check check (length(trim(titulo)) between 1 and 120),
  link text not null
    constraint conteudos_nutricao_link_check check (link ~* '^https?://[^\s]+$' and length(link) <= 500),
  servico text
    constraint conteudos_nutricao_servico_check check (servico is null or length(trim(servico)) between 1 and 80),
  texto text
    constraint conteudos_nutricao_texto_check check (texto is null or length(trim(texto)) between 1 and 2000),
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.conteudos_nutricao enable row level security;
revoke all on public.conteudos_nutricao from public, anon;
grant select, insert, update, delete on public.conteudos_nutricao to authenticated;
grant all on public.conteudos_nutricao to service_role;

create policy "Aprovados tem acesso total" on public.conteudos_nutricao
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));

-- 2 e 3. Colunas novas
alter table public.leads add column retomar_em date;
alter table public.lead_followups add column nutricao boolean not null default false;
alter table public.lead_followups add column conteudo_id uuid references public.conteudos_nutricao (id) on delete set null;
create index lead_followups_conteudo_id_idx on public.lead_followups (conteudo_id) where conteudo_id is not null;

-- 6. Resultados e mensagens novos
alter table public.lead_followups drop constraint lead_followups_resultado_check;
alter table public.lead_followups add constraint lead_followups_resultado_check check (
  resultado is null or resultado = any (array[
    'sem_resposta', 'avaliando', 'caro', 'reuniao', 'retornar', 'quer_fechar', 'desistiu', 'orcamento_enviado',
    'nutricao', 'retomar_perto'
  ])
);

alter table public.mensagens_followup drop constraint mensagens_followup_chave_check;
alter table public.mensagens_followup add constraint mensagens_followup_chave_check check (chave = any (array[
  'primeiro', 'continuidade', 'retomar', 'encerramento', 'posOrcamento', 'caro', 'lembrete', 'reuniao',
  'confirmarReuniao', 'sinal', 'nutricao', 'retomarPerto'
]));

-- 4. Entrar na nutricao / registrar o conteudo enviado
create function public.agendar_nutricao(
  p_lead_id uuid,
  p_followup_id uuid,
  p_resultado text,
  p_conteudo_id uuid,
  p_retomar_em date,
  p_proximo timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead public.leads%rowtype;
  v_retomar date;
  v_eh_nutricao boolean;
  v_linhas integer;
  v_proximo uuid;
begin
  if not public.is_approved() then
    raise exception 'Conta sem permissao para registrar contatos.' using errcode = '42501';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead nao encontrado.' using errcode = 'P0002';
  end if;

  if p_resultado not in ('retomar_perto', 'nutricao') then
    raise exception 'Resultado invalido para nutricao.' using errcode = '22023';
  end if;
  if p_resultado = 'retomar_perto' and p_retomar_em is null then
    raise exception 'Informe quando retomar o contato.' using errcode = '22023';
  end if;

  v_retomar := coalesce(p_retomar_em, v_lead.retomar_em);
  if v_retomar is null then
    raise exception 'Este lead nao esta em nutricao.' using errcode = '22023';
  end if;
  if v_retomar <= (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data de retomar precisa ser no futuro.' using errcode = '22023';
  end if;
  if p_proximo is null or p_proximo <= now() then
    raise exception 'O proximo contato precisa ser no futuro.' using errcode = '22023';
  end if;
  if p_conteudo_id is not null and p_resultado <> 'nutricao' then
    raise exception 'Conteudo so vale para o contato de nutricao.' using errcode = '22023';
  end if;

  if p_followup_id is not null then
    update public.lead_followups
    set done = true, resultado = p_resultado, feito_em = now(), conteudo_id = p_conteudo_id
    where id = p_followup_id and lead_id = p_lead_id;
    get diagnostics v_linhas = row_count;
    if v_linhas = 0 then
      raise exception 'Contato nao encontrado neste lead.' using errcode = 'P0002';
    end if;
  else
    insert into public.lead_followups (user_id, lead_id, type, scheduled_at, done, resultado, feito_em, conteudo_id)
    values (auth.uid(), p_lead_id, 'WhatsApp', now(), true, p_resultado, now(), p_conteudo_id);
  end if;

  -- Os outros contatos pendentes saem: fica so o proximo agendado aqui
  update public.lead_followups set done = true where lead_id = p_lead_id and done is not true;

  v_eh_nutricao := (p_proximo at time zone 'America/Sao_Paulo')::date < v_retomar;
  update public.leads set retomar_em = case when v_eh_nutricao then v_retomar else null end where id = p_lead_id;

  insert into public.lead_followups (user_id, lead_id, type, scheduled_at, notes, done, nutricao)
  values (
    auth.uid(), p_lead_id, 'WhatsApp', p_proximo,
    case when v_eh_nutricao then 'Nutrição' else 'Retomar: casamento se aproximando' end,
    false, v_eh_nutricao
  )
  returning id into v_proximo;

  return v_proximo;
end;
$$;

revoke execute on function public.agendar_nutricao(uuid, uuid, text, uuid, date, timestamptz) from public, anon;
grant execute on function public.agendar_nutricao(uuid, uuid, text, uuid, date, timestamptz) to authenticated;

-- 5. Registrar contato: igual ao anterior, e qualquer resposta tira o lead da nutricao.
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

  update public.leads set retomar_em = null where id = p_lead_id and retomar_em is not null;

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

-- Autoteste: tudo que ele grava e desfeito no final.
do $$
declare
  admin_id uuid;
  lead_teste uuid;
  contato uuid;
  conteudo uuid;
  proximo uuid;
  retomar date := (now() at time zone 'America/Sao_Paulo')::date + 200;
  quantidade bigint;
  total_contatos bigint;
  erro text;
  r record;
begin
  select user_id into admin_id from public.user_profiles where role = 'admin' limit 1;
  if admin_id is null then raise exception 'AUTOTESTE: nenhuma conta admin encontrada'; end if;
  select count(*) into total_contatos from public.lead_followups;

  if not (select relrowsecurity from pg_class where oid = 'public.conteudos_nutricao'::regclass) then
    raise exception 'AUTOTESTE: conteudos sem RLS';
  end if;
  if has_table_privilege('anon', 'public.conteudos_nutricao', 'select') then
    raise exception 'AUTOTESTE: visitante le os conteudos';
  end if;
  if has_function_privilege('anon', 'public.agendar_nutricao(uuid, uuid, text, uuid, date, timestamptz)', 'execute') then
    raise exception 'AUTOTESTE: visitante pode agendar nutricao';
  end if;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);

    -- Link precisa ser http(s)
    begin
      insert into public.conteudos_nutricao (titulo, link) values ('x', 'javascript:alert(1)');
      erro := 'aceitou link que nao e http';
    exception when check_violation then null;
    end;
    if erro is not null then raise exception 'AUTOTESTE: %', erro; end if;

    insert into public.conteudos_nutricao (titulo, link, servico) values ('Reels', 'https://www.instagram.com/reel/abc', 'Pintura dos Noivos')
      returning id into conteudo;
    if (select user_id from public.conteudos_nutricao where id = conteudo) is distinct from admin_id then
      raise exception 'AUTOTESTE: dono do conteudo nao foi gravado';
    end if;

    insert into public.leads (user_id, name, status, event_date) values (admin_id, 'autoteste', 'Em Conversa', retomar + 180)
      returning id into lead_teste;
    insert into public.lead_followups (user_id, lead_id, type, scheduled_at, done)
      values (admin_id, lead_teste, 'WhatsApp', now(), false) returning id into contato;
    insert into public.lead_followups (user_id, lead_id, type, scheduled_at, done)
      values (admin_id, lead_teste, 'WhatsApp', now() + interval '1 day', false);

    -- Retomar sem data e recusado
    begin
      perform public.agendar_nutricao(lead_teste, contato, 'retomar_perto', null, null, now() + interval '45 days');
      erro := 'aceitou retomar sem data';
    exception when sqlstate '22023' then null;
    end;
    if erro is not null then raise exception 'AUTOTESTE: %', erro; end if;

    -- Entra na nutricao
    proximo := public.agendar_nutricao(lead_teste, contato, 'retomar_perto', null, retomar, now() + interval '45 days');
    select * into r from public.lead_followups where id = proximo;
    if not r.nutricao or r.notes <> 'Nutrição' then raise exception 'AUTOTESTE: proximo contato nao e de nutricao'; end if;
    if (select retomar_em from public.leads where id = lead_teste) is distinct from retomar then
      raise exception 'AUTOTESTE: data de retomar nao gravada';
    end if;
    if (select resultado from public.lead_followups where id = contato) <> 'retomar_perto' then
      raise exception 'AUTOTESTE: resultado retomar_perto nao gravado';
    end if;
    select count(*) into quantidade from public.lead_followups where lead_id = lead_teste and done is not true;
    if quantidade <> 1 then raise exception 'AUTOTESTE: ficaram % contatos pendentes', quantidade; end if;

    -- Conteudo enviado, ainda longe da data: continua em nutricao e guarda o conteudo
    contato := proximo;
    proximo := public.agendar_nutricao(lead_teste, contato, 'nutricao', conteudo, null, now() + interval '90 days');
    if (select conteudo_id from public.lead_followups where id = contato) is distinct from conteudo then
      raise exception 'AUTOTESTE: conteudo enviado nao foi guardado';
    end if;
    if not (select nutricao from public.lead_followups where id = proximo) then
      raise exception 'AUTOTESTE: deveria continuar em nutricao';
    end if;

    -- Proximo cai na data de retomar: vira contato normal e o lead sai da nutricao
    contato := proximo;
    proximo := public.agendar_nutricao(lead_teste, contato, 'nutricao', conteudo, null,
      ((retomar + time '09:00') at time zone 'America/Sao_Paulo'));
    select * into r from public.lead_followups where id = proximo;
    if r.nutricao or r.notes not like 'Retomar%' then raise exception 'AUTOTESTE: contato de retomar ficou como nutricao'; end if;
    if (select retomar_em from public.leads where id = lead_teste) is not null then
      raise exception 'AUTOTESTE: lead continuou em nutricao depois de retomar';
    end if;

    -- Fora da nutricao, registrar conteudo e recusado
    begin
      perform public.agendar_nutricao(lead_teste, proximo, 'nutricao', conteudo, null, now() + interval '10 days');
      erro := 'aceitou nutricao de lead fora da nutricao';
    exception when sqlstate '22023' then null;
    end;
    if erro is not null then raise exception 'AUTOTESTE: %', erro; end if;

    -- Resposta normal tira da nutricao
    perform public.agendar_nutricao(lead_teste, proximo, 'retomar_perto', null, retomar, now() + interval '45 days');
    select id into contato from public.lead_followups where lead_id = lead_teste and done is not true;
    perform public.registrar_contato(lead_teste, contato, 'avaliando', now() + interval '7 days', null, null, null);
    if (select retomar_em from public.leads where id = lead_teste) is not null then
      raise exception 'AUTOTESTE: resposta nao tirou o lead da nutricao';
    end if;
    if (select status from public.leads where id = lead_teste) <> 'Em Conversa' then
      raise exception 'AUTOTESTE: nutricao mudou a etapa';
    end if;

    -- Data de retomar no passado e recusada
    begin
      perform public.agendar_nutricao(lead_teste, null, 'retomar_perto', null, (now() at time zone 'America/Sao_Paulo')::date, now() + interval '1 day');
      erro := 'aceitou retomar hoje';
    exception when sqlstate '22023' then null;
    end;
    if erro is not null then raise exception 'AUTOTESTE: %', erro; end if;

    -- Contato de nutricao nao tem envio, entao a classificacao de sem resposta nao o pega
    select count(*) into quantidade from public.lead_followups where lead_id = lead_teste and nutricao and enviada_em is not null;
    if quantidade <> 0 then raise exception 'AUTOTESTE: contato de nutricao com envio'; end if;

    insert into public.mensagens_followup (chave, texto) values ('nutricao', 'autoteste')
      on conflict (chave) do update set texto = excluded.texto;

    raise exception 'desfazer' using errcode = 'ZZ001';
  exception when sqlstate 'ZZ001' then
    null;
  end;

  select count(*) into quantidade from public.lead_followups;
  if quantidade <> total_contatos then raise exception 'AUTOTESTE: total de contatos mudou'; end if;
  select count(*) into quantidade from public.leads where name = 'autoteste';
  if quantidade <> 0 then raise exception 'AUTOTESTE: teste deixou lead'; end if;
  select count(*) into quantidade from public.conteudos_nutricao;
  if quantidade <> 0 then raise exception 'AUTOTESTE: teste deixou conteudo'; end if;
end;
$$;

commit;
