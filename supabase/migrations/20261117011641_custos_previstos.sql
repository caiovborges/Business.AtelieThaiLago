-- Custos previstos do evento, em linhas com categoria (ver GLOSSARY.md).
--
-- O que muda:
--   1. Cria a categoria de despesa "Deslocamento", se ainda nao existir.
--   2. custos_previstos guarda cada custo previsto: evento, categoria, descricao e valor.
--   3. Copia o planejamento atual para la:
--        custo_prev_equipe       -> Assistentes (uma linha por pintora, cache dividido igual)
--        custo_prev_materiais    -> Custos materiais
--        custo_prev_deslocamento -> Deslocamento
--        custo_prev_outros       -> Custos operacionais
--        custos_personalizados   -> Custos operacionais
--   4. salvar_custos_previstos troca todos os custos de um evento de uma vez.
--   5. fechar_lead passa a gravar o deslocamento do orcamento tambem em custos_previstos.
--
-- As colunas antigas (custo_prev_*, custos_personalizados, pintoras) NAO sao apagadas:
-- saem numa migracao separada, depois de conferir. Nenhum evento ou transacao e alterado.
-- Se o autoteste do final falhar, tudo e desfeito. Para voltar atras, use supabase/rollback.

begin;

-- ---------------------------------------------------------------------------
-- 1. Categoria Deslocamento
-- ---------------------------------------------------------------------------
insert into public.categorias (user_id, nome, tipo)
select c.user_id, 'Deslocamento', 'despesa'
from public.categorias c
where c.nome = 'Assistentes' and c.tipo = 'despesa'
  and not exists (select 1 from public.categorias where nome = 'Deslocamento' and tipo = 'despesa')
limit 1;

-- ---------------------------------------------------------------------------
-- 2. Tabela
-- ---------------------------------------------------------------------------
create table public.custos_previstos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete cascade,
  categoria_id integer references public.categorias (id) on delete set null,
  descricao text not null
    constraint custos_previstos_descricao_check check (length(trim(descricao)) between 1 and 200),
  valor numeric(12, 2) not null
    constraint custos_previstos_valor_check check (valor >= 0),
  -- clock_timestamp: guarda a ordem em que as linhas foram digitadas
  created_at timestamptz not null default clock_timestamp()
);

create index custos_previstos_evento_id_idx on public.custos_previstos (evento_id);

alter table public.custos_previstos enable row level security;
revoke all on public.custos_previstos from public, anon;
grant select, insert, update, delete on public.custos_previstos to authenticated;
grant all on public.custos_previstos to service_role;

create policy "Aprovados tem acesso total" on public.custos_previstos
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));

-- ---------------------------------------------------------------------------
-- 3. Copia do planejamento atual
-- ---------------------------------------------------------------------------
create temporary table _cat on commit drop as
select
  (select id from public.categorias where nome = 'Assistentes' and tipo = 'despesa' order by id limit 1) as equipe,
  (select id from public.categorias where nome = 'Custos materiais' and tipo = 'despesa' order by id limit 1) as materiais,
  (select id from public.categorias where nome = 'Deslocamento' and tipo = 'despesa' order by id limit 1) as deslocamento,
  (select id from public.categorias where nome = 'Custos operacionais' and tipo = 'despesa' order by id limit 1) as operacionais;

-- Equipe com pintoras: divide o custo igual, a diferenca de centavos fica na ultima
with p as (
  select e.id as evento_id, trim(u.pintora) as nome, u.ordem,
         count(*) over (partition by e.id) as total,
         round(coalesce(e.custo_prev_equipe, 0), 2) as custo
  from public.eventos e,
       unnest(e.pintoras) with ordinality as u(pintora, ordem)
  where trim(coalesce(u.pintora, '')) <> ''
)
insert into public.custos_previstos (evento_id, categoria_id, descricao, valor)
select evento_id, (select equipe from _cat), left(nome, 200),
       case when ordem = max(ordem) over (partition by evento_id)
            then custo - floor(custo * 100 / total) / 100 * (total - 1)
            else floor(custo * 100 / total) / 100 end
from p
order by evento_id, ordem;

-- Equipe sem pintoras
insert into public.custos_previstos (evento_id, categoria_id, descricao, valor)
select e.id, (select equipe from _cat), 'Equipe', e.custo_prev_equipe
from public.eventos e
where coalesce(e.custo_prev_equipe, 0) > 0
  and not exists (select 1 from unnest(e.pintoras) n where trim(coalesce(n, '')) <> '');

insert into public.custos_previstos (evento_id, categoria_id, descricao, valor)
select id, (select materiais from _cat), 'Materiais', custo_prev_materiais
from public.eventos where coalesce(custo_prev_materiais, 0) > 0;

insert into public.custos_previstos (evento_id, categoria_id, descricao, valor)
select id, (select deslocamento from _cat), 'Deslocamento', custo_prev_deslocamento
from public.eventos where coalesce(custo_prev_deslocamento, 0) > 0;

insert into public.custos_previstos (evento_id, categoria_id, descricao, valor)
select id, (select operacionais from _cat), 'Outros', custo_prev_outros
from public.eventos where coalesce(custo_prev_outros, 0) > 0;

insert into public.custos_previstos (evento_id, categoria_id, descricao, valor)
select e.id, (select operacionais from _cat),
       left(coalesce(nullif(trim(c ->> 'descricao'), ''), 'Outro custo'), 200),
       (c ->> 'valor')::numeric
from public.eventos e,
     jsonb_array_elements(case when jsonb_typeof(e.custos_personalizados) = 'array' then e.custos_personalizados else '[]'::jsonb end) c
where coalesce((c ->> 'valor')::numeric, 0) > 0;

-- ---------------------------------------------------------------------------
-- 4. Salvar o planejamento de um evento
-- ---------------------------------------------------------------------------
create function public.salvar_custos_previstos(p_evento_id uuid, p_custos jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_approved() then
    raise exception 'Conta sem permissao para planejar eventos.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_custos) is distinct from 'array' then
    raise exception 'Lista de custos invalida.' using errcode = '22023';
  end if;

  perform 1 from public.eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento nao encontrado.' using errcode = 'P0002';
  end if;

  delete from public.custos_previstos where evento_id = p_evento_id;

  insert into public.custos_previstos (evento_id, categoria_id, descricao, valor)
  select p_evento_id, (c.item ->> 'categoria_id')::integer, trim(c.item ->> 'descricao'), round((c.item ->> 'valor')::numeric, 2)
  from jsonb_array_elements(p_custos) with ordinality as c(item, ordem)
  order by c.ordem;
end;
$$;

revoke all on function public.salvar_custos_previstos(uuid, jsonb) from public, anon;
grant execute on function public.salvar_custos_previstos(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. fechar_lead: igual ao anterior + deslocamento em custos_previstos
-- ---------------------------------------------------------------------------
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

  if coalesce(p_custo_deslocamento, 0) > 0 then
    insert into public.custos_previstos (evento_id, categoria_id, descricao, valor)
    values (
      v_evento,
      (select id from public.categorias where nome = 'Deslocamento' and tipo = 'despesa' order by id limit 1),
      'Deslocamento',
      round(p_custo_deslocamento, 2)
    );
  end if;

  update public.leads set status = 'Fechado' where id = p_lead_id;
  update public.lead_followups set done = true where lead_id = p_lead_id and done is not true;

  if p_proposta_id is not null then
    update public.propostas set status = 'Aprovada', updated_at = now()
    where id = p_proposta_id and lead_id = p_lead_id;
  end if;

  return v_evento;
end;
$$;

-- ---------------------------------------------------------------------------
-- Autoteste: qualquer falha desfaz a migracao inteira
-- ---------------------------------------------------------------------------
do $$
declare
  admin_id uuid;
  negado_id uuid;
  evento_teste uuid;
  lead_teste uuid;
  evento_lead uuid;
  quantidade bigint;
  soma_antiga numeric;
  soma_nova numeric;
  total_transacoes bigint;
  soma_transacoes numeric;
  total_eventos bigint;
  cat_equipe integer;
  cat_deslocamento integer;
begin
  -- Le as categorias antes de trocar de usuario: a tabela temporaria e so do dono da migracao
  select equipe, deslocamento into cat_equipe, cat_deslocamento from _cat;

  select user_id into admin_id from public.user_profiles where role = 'admin' limit 1;
  select user_id into negado_id from public.user_profiles where role in ('denied', 'pending') limit 1;
  select count(*), coalesce(sum(valor), 0) into total_transacoes, soma_transacoes from public.transacoes;
  select count(*) into total_eventos from public.eventos;

  if admin_id is null then
    raise exception 'AUTOTESTE: nenhuma conta admin encontrada';
  end if;

  -- Categorias usadas pela copia existem
  if exists (select 1 from _cat where equipe is null or materiais is null or deslocamento is null or operacionais is null) then
    raise exception 'AUTOTESTE: falta uma das categorias Assistentes, Custos materiais, Deslocamento ou Custos operacionais';
  end if;

  -- Cada evento tem o mesmo total de antes, centavo por centavo
  select count(*) into quantidade
  from public.eventos e
  where round(coalesce(e.custo_prev_materiais, 0) + coalesce(e.custo_prev_deslocamento, 0)
            + coalesce(e.custo_prev_equipe, 0) + coalesce(e.custo_prev_outros, 0)
            + coalesce((select sum((c ->> 'valor')::numeric)
                        from jsonb_array_elements(case when jsonb_typeof(e.custos_personalizados) = 'array' then e.custos_personalizados else '[]'::jsonb end) c
                        where coalesce((c ->> 'valor')::numeric, 0) > 0), 0), 2)
        <> coalesce((select sum(valor) from public.custos_previstos cp where cp.evento_id = e.id), 0);
  if quantidade <> 0 then
    raise exception 'AUTOTESTE: % evento(s) com total de custos diferente do anterior', quantidade;
  end if;

  -- Cada pintora virou uma linha de Assistentes
  select count(*) into quantidade
  from public.eventos e, unnest(e.pintoras) n
  where trim(coalesce(n, '')) <> ''
    and not exists (select 1 from public.custos_previstos cp
                    where cp.evento_id = e.id and cp.categoria_id = cat_equipe and cp.descricao = left(trim(n), 200));
  if quantidade <> 0 then
    raise exception 'AUTOTESTE: % pintora(s) sem linha de custo', quantidade;
  end if;

  select count(*) into quantidade from public.eventos;
  if quantidade <> total_eventos then raise exception 'AUTOTESTE: eventos mudaram'; end if;

  select id into evento_teste from public.eventos limit 1;
  select id into lead_teste from public.leads
    where status <> 'Fechado' and not exists (select 1 from public.eventos e where e.lead_id = leads.id) limit 1;

  if evento_teste is not null then
    -- Usa dados de verdade dentro de um bloco que e sempre desfeito.
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);

      perform public.salvar_custos_previstos(evento_teste,
        jsonb_build_array(
          jsonb_build_object('categoria_id', cat_equipe, 'descricao', ' Ana ', 'valor', 300.555),
          jsonb_build_object('categoria_id', null, 'descricao', 'Bolo', 'valor', 50)));

      select count(*), sum(valor) into quantidade, soma_nova from public.custos_previstos where evento_id = evento_teste;
      if quantidade <> 2 or soma_nova <> 350.56 then
        raise exception 'AUTOTESTE: salvar_custos_previstos gravou % linhas somando %', quantidade, soma_nova;
      end if;
      if not exists (select 1 from public.custos_previstos where evento_id = evento_teste and descricao = 'Ana') then
        raise exception 'AUTOTESTE: descricao nao foi aparada';
      end if;

      begin
        perform public.salvar_custos_previstos(evento_teste,
          jsonb_build_array(jsonb_build_object('categoria_id', null, 'descricao', 'x', 'valor', -1)));
        raise exception 'AUTOTESTE: custo negativo foi aceito';
      exception when check_violation then
        null;
      end;

      begin
        perform public.salvar_custos_previstos(evento_teste,
          jsonb_build_array(jsonb_build_object('categoria_id', null, 'descricao', '  ', 'valor', 1)));
        raise exception 'AUTOTESTE: custo sem descricao foi aceito';
      exception when check_violation then
        null;
      end;

      perform public.salvar_custos_previstos(evento_teste, '[]'::jsonb);
      select count(*) into quantidade from public.custos_previstos where evento_id = evento_teste;
      if quantidade <> 0 then
        raise exception 'AUTOTESTE: lista vazia nao apagou os custos';
      end if;

      if lead_teste is not null then
        evento_lead := public.fechar_lead(lead_teste, 1000, 'Plano autoteste', 'Aquarela dos Convidados', 120.40, null, null);
        select count(*) into quantidade from public.custos_previstos
          where evento_id = evento_lead and categoria_id = cat_deslocamento and valor = 120.40;
        if quantidade <> 1 then
          raise exception 'AUTOTESTE: fechar_lead nao gravou o deslocamento previsto';
        end if;
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
        perform public.salvar_custos_previstos(evento_teste, '[]'::jsonb);
        raise exception 'AUTOTESTE: conta nao aprovada salvou planejamento';
      exception when insufficient_privilege then
        null;
      end;
      select count(*) into quantidade from public.custos_previstos;
      if quantidade <> 0 then
        raise exception 'AUTOTESTE: conta nao aprovada le custos previstos';
      end if;
      perform set_config('role', 'none', true);
    end if;
  end if;

  if has_function_privilege('anon', 'public.salvar_custos_previstos(uuid, jsonb)', 'execute') then
    raise exception 'AUTOTESTE: visitante pode executar salvar_custos_previstos';
  end if;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin
    perform 1 from public.custos_previstos limit 1;
    raise exception 'AUTOTESTE: visitante leu custos previstos';
  exception when insufficient_privilege then
    null;
  end;
  perform set_config('role', 'none', true);

  select count(*), coalesce(sum(valor), 0) into quantidade, soma_nova from public.transacoes;
  if quantidade <> total_transacoes or soma_nova <> soma_transacoes then
    raise exception 'AUTOTESTE: transacoes mudaram';
  end if;
end;
$$;

commit;
