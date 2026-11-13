-- Troca as "mensagens para listas" por mensagens proprias, mais simples.
--
-- O que muda:
--   1. Apaga listas_mensagem, envios_lista e registrar_envio_lista (estavam vazias).
--   2. mensagens_proprias: textos criados pela Thai na tela Mensagens (ex.: recado para as
--      noivas da feira). Aparecem como opcao no campo "Mensagem do botao WhatsApp" do lead.
--
-- Se o autoteste do final falhar, tudo e desfeito.
-- Para voltar atras, use o arquivo em supabase/rollback.

begin;

-- 1. Sai o recurso de listas (so apaga se estiver vazio)
do $$
begin
  if exists (select 1 from public.listas_mensagem) or exists (select 1 from public.envios_lista) then
    raise exception 'As listas de mensagem nao estao vazias; nada foi apagado.';
  end if;
end $$;

drop function public.registrar_envio_lista(uuid, uuid, timestamptz);
drop table public.envios_lista;
drop table public.listas_mensagem;

-- 2. Mensagens proprias
create table public.mensagens_proprias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id),
  titulo text not null
    constraint mensagens_proprias_titulo_check check (length(trim(titulo)) between 1 and 80),
  texto text not null
    constraint mensagens_proprias_texto_check check (length(trim(texto)) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.mensagens_proprias enable row level security;
revoke all on public.mensagens_proprias from public, anon;
grant select, insert, update, delete on public.mensagens_proprias to authenticated;
grant all on public.mensagens_proprias to service_role;

create policy "Aprovados tem acesso total" on public.mensagens_proprias
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));

-- Autoteste: tudo que ele grava e desfeito no final.
do $$
declare
  admin_id uuid;
  pendente_id uuid;
  n bigint;
  erro text;
begin
  select user_id into admin_id from public.user_profiles where role = 'admin' limit 1;
  if admin_id is null then raise exception 'AUTOTESTE: nenhuma conta admin encontrada'; end if;
  select user_id into pendente_id from public.user_profiles where role not in ('admin', 'member') limit 1;

  if not (select relrowsecurity from pg_class where oid = 'public.mensagens_proprias'::regclass) then
    raise exception 'AUTOTESTE: tabela sem RLS';
  end if;
  if has_table_privilege('anon', 'public.mensagens_proprias', 'select') then
    raise exception 'AUTOTESTE: visitante le as mensagens';
  end if;
  if to_regclass('public.listas_mensagem') is not null or to_regclass('public.envios_lista') is not null then
    raise exception 'AUTOTESTE: listas nao foram apagadas';
  end if;

  begin
    -- Como a Thai logada (mesmas permissoes do app)
    perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    insert into public.mensagens_proprias (titulo, texto) values ('Feira', 'Oi {nome}!');
    update public.mensagens_proprias set texto = 'Oi {nome}, tudo bem?' where titulo = 'Feira';
    select count(*) into n from public.mensagens_proprias where texto = 'Oi {nome}, tudo bem?' and user_id = admin_id;
    if n <> 1 then raise exception 'AUTOTESTE: a Thai nao consegue criar ou editar'; end if;

    begin
      insert into public.mensagens_proprias (titulo, texto) values ('x', '   ');
      erro := 'aceitou texto vazio';
    exception when check_violation then null;
    end;
    if erro is not null then raise exception 'AUTOTESTE: %', erro; end if;

    -- Conta ainda nao aprovada nao ve nada
    if pendente_id is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', pendente_id, 'role', 'authenticated')::text, true);
      select count(*) into n from public.mensagens_proprias;
      if n <> 0 then raise exception 'AUTOTESTE: conta nao aprovada le as mensagens'; end if;
    end if;

    raise exception using errcode = 'ZZ001';
  exception when sqlstate 'ZZ001' then
    null; -- desfaz tudo que o teste gravou
  end;

  if exists (select 1 from public.mensagens_proprias) then
    raise exception 'AUTOTESTE: o teste deixou registros para tras';
  end if;
end $$;

commit;
