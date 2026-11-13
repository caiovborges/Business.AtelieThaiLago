-- Mensagens para listas (ex.: todas as noivas da feira).
--
-- O que muda:
--   1. listas_mensagem: texto pronto + para quem vai (uma origem e, se quiser, algumas etapas).
--   2. envios_lista: quem ja recebeu a mensagem de cada lista (uma vez por lead).
--   3. registrar_envio_lista: grava o envio e, se o lead esta em atendimento (e fora da nutricao),
--      faz o mesmo que "Mensagem enviada": o lead aguarda resposta ate p_espera_ate e
--      Novo Lead passa para Em Conversa. Tudo junto: ou grava tudo, ou nada.
--
-- Nao altera registros existentes. Se o autoteste do final falhar, tudo e desfeito.
-- Para voltar atras, use o arquivo em supabase/rollback.

begin;

-- 1. Listas
create table public.listas_mensagem (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id),
  titulo text not null
    constraint listas_mensagem_titulo_check check (length(trim(titulo)) between 1 and 80),
  texto text not null
    constraint listas_mensagem_texto_check check (length(trim(texto)) between 1 and 2000),
  -- null = leads de qualquer origem
  origem text
    constraint listas_mensagem_origem_check check (origem is null or length(trim(origem)) between 1 and 200),
  -- vazio = todas as etapas
  etapas text[] not null default '{}'
    constraint listas_mensagem_etapas_check check (etapas <@ array[
      'Novo Lead', 'Em Conversa', 'Orçamento Enviado', 'Negociando', 'Aguardando Sinal', 'Fechado', 'Sem Resposta', 'Perdido'
    ]::text[]),
  arquivada boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. Envios
create table public.envios_lista (
  lista_id uuid not null references public.listas_mensagem (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id),
  enviado_em timestamptz not null default now(),
  primary key (lista_id, lead_id)
);
create index envios_lista_lead_id_idx on public.envios_lista (lead_id);

alter table public.listas_mensagem enable row level security;
alter table public.envios_lista enable row level security;
revoke all on public.listas_mensagem, public.envios_lista from public, anon;
grant select, insert, update, delete on public.listas_mensagem to authenticated;
-- O envio normal e pela funcao (que tambem cuida do follow-up).
grant select, insert, delete on public.envios_lista to authenticated;
grant all on public.listas_mensagem, public.envios_lista to service_role;

create policy "Aprovados tem acesso total" on public.listas_mensagem
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));
create policy "Aprovados tem acesso total" on public.envios_lista
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));

-- 3. Registrar o envio
create function public.registrar_envio_lista(
  p_lista_id uuid,
  p_lead_id uuid,
  p_espera_ate timestamptz
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead public.leads%rowtype;
  v_pendente uuid;
begin
  if not public.is_approved() then
    raise exception 'Conta sem permissao para registrar envios.' using errcode = '42501';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead nao encontrado.' using errcode = 'P0002';
  end if;

  perform 1 from public.listas_mensagem where id = p_lista_id and not arquivada;
  if not found then
    raise exception 'Lista nao encontrada ou arquivada.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.envios_lista where lista_id = p_lista_id and lead_id = p_lead_id) then
    raise exception 'Esta mensagem ja foi registrada para este lead.' using errcode = '23505';
  end if;

  insert into public.envios_lista (lista_id, lead_id) values (p_lista_id, p_lead_id);

  -- Fora do atendimento (fechado, encerrado) ou em nutricao: so registra o envio.
  if v_lead.status not in ('Novo Lead', 'Em Conversa', 'Orçamento Enviado', 'Negociando', 'Aguardando Sinal')
     or v_lead.retomar_em is not null then
    return 'envio';
  end if;

  if p_espera_ate is null or p_espera_ate <= now() then
    raise exception 'O fim da espera precisa ser no futuro.' using errcode = '22023';
  end if;

  -- Igual a "Mensagem enviada": usa o proximo contato pendente ou cria um, aguardando resposta.
  select id into v_pendente from public.lead_followups
  where lead_id = p_lead_id and done is not true and nutricao is not true
  order by scheduled_at
  limit 1;

  if v_pendente is not null then
    update public.lead_followups set enviada_em = now(), scheduled_at = p_espera_ate where id = v_pendente;
  else
    insert into public.lead_followups (user_id, lead_id, type, scheduled_at, done, enviada_em)
    values (auth.uid(), p_lead_id, 'WhatsApp', p_espera_ate, false, now());
  end if;

  if v_lead.status = 'Novo Lead' then
    update public.leads set status = 'Em Conversa' where id = p_lead_id;
  end if;

  return 'followup';
end;
$$;

revoke execute on function public.registrar_envio_lista(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.registrar_envio_lista(uuid, uuid, timestamptz) to authenticated;

-- Autoteste: tudo que ele grava e desfeito no final.
do $$
declare
  admin_id uuid;
  lista uuid;
  lead_novo uuid;
  lead_fechado uuid;
  lead_nutricao uuid;
  espera timestamptz := now() + interval '3 days';
  r text;
  erro text;
  total_contatos bigint;
  total_leads bigint;
begin
  select user_id into admin_id from public.user_profiles where role = 'admin' limit 1;
  if admin_id is null then raise exception 'AUTOTESTE: nenhuma conta admin encontrada'; end if;
  select count(*) into total_contatos from public.lead_followups;
  select count(*) into total_leads from public.leads;

  if not (select relrowsecurity from pg_class where oid = 'public.listas_mensagem'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.envios_lista'::regclass) then
    raise exception 'AUTOTESTE: tabela sem RLS';
  end if;
  if has_table_privilege('anon', 'public.listas_mensagem', 'select') or has_table_privilege('anon', 'public.envios_lista', 'select') then
    raise exception 'AUTOTESTE: visitante le as listas';
  end if;
  if has_function_privilege('anon', 'public.registrar_envio_lista(uuid, uuid, timestamptz)', 'execute') then
    raise exception 'AUTOTESTE: visitante pode registrar envio';
  end if;

  begin
    insert into public.listas_mensagem (user_id, titulo, texto, origem, etapas)
    values (admin_id, 'Teste', 'Oi {nome}', 'Origem de teste', array['Novo Lead']) returning id into lista;

    insert into public.leads (user_id, name, status, source) values (admin_id, 'Teste novo', 'Novo Lead', 'Origem de teste') returning id into lead_novo;
    insert into public.leads (user_id, name, status, source) values (admin_id, 'Teste fechado', 'Fechado', 'Origem de teste') returning id into lead_fechado;
    insert into public.leads (user_id, name, status, source, retomar_em) values (admin_id, 'Teste nutricao', 'Em Conversa', 'Origem de teste', current_date + 200) returning id into lead_nutricao;

    -- Sem login: recusado
    begin
      perform public.registrar_envio_lista(lista, lead_novo, espera);
      erro := 'aceitou sem login';
    exception when insufficient_privilege then null;
    end;
    if erro is not null then raise exception 'AUTOTESTE: %', erro; end if;

    -- Daqui em diante, como a Thai logada (mesmas permissoes do app)
    perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    -- Etapa que nao existe e recusada
    begin
      insert into public.listas_mensagem (titulo, texto, etapas) values ('x', 'y', array['Inventada']);
      erro := 'aceitou etapa inventada';
    exception when check_violation then null;
    end;
    if erro is not null then raise exception 'AUTOTESTE: %', erro; end if;

    -- A Thai consegue criar lista
    insert into public.listas_mensagem (titulo, texto) values ('Outra', 'Oi');

    -- Lead novo: entra no follow-up aguardando resposta e vai para Em Conversa
    r := public.registrar_envio_lista(lista, lead_novo, espera);
    if r <> 'followup' then raise exception 'AUTOTESTE: lead novo devolveu %', r; end if;
    if (select status from public.leads where id = lead_novo) <> 'Em Conversa' then
      raise exception 'AUTOTESTE: lead novo nao foi para Em Conversa';
    end if;
    if (select count(*) from public.lead_followups where lead_id = lead_novo and done is not true and enviada_em is not null and scheduled_at = espera) <> 1 then
      raise exception 'AUTOTESTE: lead novo sem contato aguardando resposta';
    end if;

    -- Segunda vez na mesma lista: recusado
    begin
      perform public.registrar_envio_lista(lista, lead_novo, espera);
      erro := 'registrou duas vezes';
    exception when unique_violation then null;
    end;
    if erro is not null then raise exception 'AUTOTESTE: %', erro; end if;

    -- Fechado e nutricao: so o envio, sem mexer no follow-up nem na etapa
    if public.registrar_envio_lista(lista, lead_fechado, espera) <> 'envio'
       or public.registrar_envio_lista(lista, lead_nutricao, espera) <> 'envio' then
      raise exception 'AUTOTESTE: fechado ou nutricao mexeu no follow-up';
    end if;
    if exists (select 1 from public.lead_followups where lead_id in (lead_fechado, lead_nutricao))
       or (select status from public.leads where id = lead_fechado) <> 'Fechado' then
      raise exception 'AUTOTESTE: fechado ou nutricao foi alterado';
    end if;
    if (select count(*) from public.envios_lista where lista_id = lista) <> 3 then
      raise exception 'AUTOTESTE: envios nao gravados';
    end if;

    -- Espera no passado e recusada (e nada fica gravado)
    update public.leads set status = 'Novo Lead' where id = lead_fechado;
    delete from public.envios_lista where lead_id = lead_fechado;
    begin
      perform public.registrar_envio_lista(lista, lead_fechado, now() - interval '1 hour');
      erro := 'aceitou espera no passado';
    exception when invalid_parameter_value then null;
    end;
    if erro is not null then raise exception 'AUTOTESTE: %', erro; end if;
    if exists (select 1 from public.envios_lista where lead_id = lead_fechado) then
      raise exception 'AUTOTESTE: envio ficou gravado apos erro';
    end if;

    raise exception using errcode = 'ZZ001';
  exception when sqlstate 'ZZ001' then
    null; -- desfaz tudo que o teste gravou
  end;

  perform set_config('request.jwt.claims', '', true);
  if (select count(*) from public.lead_followups) <> total_contatos or (select count(*) from public.leads) <> total_leads
     or exists (select 1 from public.listas_mensagem) then
    raise exception 'AUTOTESTE: o teste deixou registros para tras';
  end if;
end $$;

commit;
