-- Historico das listas exportadas para publicos da Meta (trafego pago).
--
-- O que muda:
--   1. exportacoes_publico guarda cada lista baixada: o publico, quantas pessoas e quais
--      leads/clientes foram nela. Serve para exportar so quem ainda nao subiu naquele publico.
--
-- Nao altera nenhum registro existente. Se o autoteste do final falhar, tudo e
-- desfeito. Para voltar atras, use o arquivo em supabase/rollback.

begin;

create table public.exportacoes_publico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id),
  publico text not null
    constraint exportacoes_publico_publico_check check (length(trim(publico)) between 1 and 60),
  quantidade integer not null
    constraint exportacoes_publico_quantidade_check check (quantidade >= 0),
  -- chaves de quem foi na lista: 'lead:<id>' ou 'cliente:<id>'
  pessoas text[] not null default '{}',
  criado_em timestamptz not null default now()
);

create index exportacoes_publico_publico_idx on public.exportacoes_publico (publico, criado_em desc);

alter table public.exportacoes_publico enable row level security;
revoke all on public.exportacoes_publico from public, anon;
grant select, insert, delete on public.exportacoes_publico to authenticated;
grant all on public.exportacoes_publico to service_role;

create policy "Aprovados tem acesso total" on public.exportacoes_publico
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));

-- Autoteste: tudo que ele grava e desfeito no final.
do $$
declare
  admin_id uuid;
  quantidade bigint;
  erro text;
begin
  select user_id into admin_id from public.user_profiles where role = 'admin' limit 1;
  if admin_id is null then raise exception 'AUTOTESTE: nenhuma conta admin encontrada'; end if;

  if not (select relrowsecurity from pg_class where oid = 'public.exportacoes_publico'::regclass) then
    raise exception 'AUTOTESTE: tabela sem RLS';
  end if;
  if has_table_privilege('anon', 'public.exportacoes_publico', 'select') then
    raise exception 'AUTOTESTE: visitante pode ler o historico';
  end if;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
    insert into public.exportacoes_publico (publico, quantidade, pessoas) values ('autoteste', 2, array['lead:1', 'cliente:2']);
    if (select user_id from public.exportacoes_publico where publico = 'autoteste') is distinct from admin_id then
      raise exception 'AUTOTESTE: dono da exportacao nao foi gravado';
    end if;

    begin
      insert into public.exportacoes_publico (publico, quantidade) values ('   ', 0);
      erro := 'aceitou publico vazio';
    exception when check_violation then null;
    end;
    if erro is not null then raise exception 'AUTOTESTE: %', erro; end if;

    begin
      insert into public.exportacoes_publico (publico, quantidade) values ('x', -1);
      erro := 'aceitou quantidade negativa';
    exception when check_violation then null;
    end;
    if erro is not null then raise exception 'AUTOTESTE: %', erro; end if;

    raise exception 'desfazer' using errcode = 'ZZ001';
  exception when sqlstate 'ZZ001' then
    null;
  end;

  select count(*) into quantidade from public.exportacoes_publico;
  if quantidade <> 0 then raise exception 'AUTOTESTE: teste deixou registro'; end if;
end;
$$;

commit;
