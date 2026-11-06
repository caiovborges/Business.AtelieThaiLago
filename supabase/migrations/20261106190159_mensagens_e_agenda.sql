-- Mensagens editaveis e assinatura de agenda.
--
-- O que muda:
--   1. mensagens_followup guarda os textos alterados. Sem registro, vale o texto padrao do app.
--   2. agenda_assinaturas guarda o link privado de agenda de cada conta.
--
-- Nao altera nenhum registro existente. Se o autoteste do final falhar, tudo e
-- desfeito. Para voltar atras, use o arquivo em supabase/rollback.

begin;

create table public.mensagens_followup (
  chave text primary key
    constraint mensagens_followup_chave_check check (chave in (
      'primeiro', 'continuidade', 'retomar', 'encerramento', 'posOrcamento', 'caro', 'lembrete', 'reuniao', 'confirmarReuniao'
    )),
  texto text not null
    constraint mensagens_followup_texto_check check (length(trim(texto)) between 1 and 2000),
  updated_at timestamptz not null default now()
);

alter table public.mensagens_followup enable row level security;
revoke all on public.mensagens_followup from public, anon;
grant select, insert, update, delete on public.mensagens_followup to authenticated;
grant all on public.mensagens_followup to service_role;

create policy "Aprovados tem acesso total" on public.mensagens_followup
  for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));

create table public.agenda_assinaturas (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
    constraint agenda_assinaturas_token_check check (token ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.agenda_assinaturas enable row level security;
revoke all on public.agenda_assinaturas from public, anon;
grant select, insert, delete on public.agenda_assinaturas to authenticated;
grant all on public.agenda_assinaturas to service_role;

-- Cada conta so enxerga e altera o proprio link, mesmo sendo admin.
create policy "Le a propria assinatura" on public.agenda_assinaturas
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_approved()));
create policy "Cria a propria assinatura" on public.agenda_assinaturas
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_approved()));
create policy "Apaga a propria assinatura" on public.agenda_assinaturas
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Autoteste: qualquer falha desfaz a migracao inteira
-- ---------------------------------------------------------------------------
do $$
declare
  aprovado_a uuid;
  aprovado_b uuid;
  negado_id uuid;
  quantidade bigint;
  texto_lido text;
  token_lido text;
begin
  select user_id into aprovado_a from public.user_profiles where role in ('admin', 'member') order by user_id limit 1;
  select user_id into aprovado_b from public.user_profiles where role in ('admin', 'member') and user_id <> aprovado_a order by user_id limit 1;
  select user_id into negado_id from public.user_profiles where role in ('denied', 'pending') limit 1;

  if aprovado_a is null then
    raise exception 'AUTOTESTE: nenhuma conta aprovada encontrada';
  end if;

  begin
    -- Conta aprovada edita mensagens e cria a propria assinatura.
    perform set_config('request.jwt.claims', json_build_object('sub', aprovado_a, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    insert into public.mensagens_followup (chave, texto) values ('primeiro', 'autoteste');
    select texto into texto_lido from public.mensagens_followup where chave = 'primeiro';
    if texto_lido is distinct from 'autoteste' then
      raise exception 'AUTOTESTE: mensagem nao foi gravada';
    end if;
    begin
      insert into public.mensagens_followup (chave, texto) values ('inexistente', 'x');
      raise exception 'AUTOTESTE: chave invalida foi aceita';
    exception when check_violation then
      null;
    end;
    begin
      insert into public.mensagens_followup (chave, texto) values ('caro', '   ');
      raise exception 'AUTOTESTE: texto vazio foi aceito';
    exception when check_violation then
      null;
    end;

    insert into public.agenda_assinaturas (user_id) values (aprovado_a);
    select token into token_lido from public.agenda_assinaturas where user_id = aprovado_a;
    if token_lido !~ '^[a-f0-9]{64}$' then
      raise exception 'AUTOTESTE: token fora do formato';
    end if;
    begin
      insert into public.agenda_assinaturas (user_id) values (coalesce(aprovado_b, negado_id, gen_random_uuid()));
      raise exception 'AUTOTESTE: criou assinatura para outra conta';
    exception when insufficient_privilege then
      null;
    end;
    perform set_config('role', 'none', true);

    -- Outra conta aprovada ve a mensagem, mas nao o link de quem assinou.
    if aprovado_b is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', aprovado_b, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      select count(*) into quantidade from public.agenda_assinaturas;
      if quantidade <> 0 then
        raise exception 'AUTOTESTE: conta aprovada ve o link de outra conta';
      end if;
      select count(*) into quantidade from public.mensagens_followup;
      if quantidade <> 1 then
        raise exception 'AUTOTESTE: conta aprovada nao ve a mensagem';
      end if;
      perform set_config('role', 'none', true);
    end if;

    -- Conta nao aprovada nao ve nem altera.
    if negado_id is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', negado_id, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      select count(*) into quantidade from public.mensagens_followup;
      if quantidade <> 0 then
        raise exception 'AUTOTESTE: conta nao aprovada ve mensagens';
      end if;
      begin
        insert into public.mensagens_followup (chave, texto) values ('caro', 'x');
        raise exception 'AUTOTESTE: conta nao aprovada editou mensagem';
      exception when insufficient_privilege then
        null;
      end;
      begin
        insert into public.agenda_assinaturas (user_id) values (negado_id);
        raise exception 'AUTOTESTE: conta nao aprovada criou assinatura';
      exception when insufficient_privilege then
        null;
      end;
      perform set_config('role', 'none', true);
    end if;

    -- Visitante nao tem acesso nenhum.
    perform set_config('request.jwt.claims', '', true);
    perform set_config('role', 'anon', true);
    begin
      perform 1 from public.agenda_assinaturas;
      raise exception 'AUTOTESTE: visitante leu assinaturas';
    exception when insufficient_privilege then
      null;
    end;
    begin
      perform 1 from public.mensagens_followup;
      raise exception 'AUTOTESTE: visitante leu mensagens';
    exception when insufficient_privilege then
      null;
    end;
    perform set_config('role', 'none', true);

    raise exception 'desfazer' using errcode = 'ZZ001';
  exception when sqlstate 'ZZ001' then
    null;
  end;
  perform set_config('role', 'none', true);

  select count(*) into quantidade from public.mensagens_followup;
  if quantidade <> 0 then
    raise exception 'AUTOTESTE: sobrou mensagem de teste';
  end if;
  select count(*) into quantidade from public.agenda_assinaturas;
  if quantidade <> 0 then
    raise exception 'AUTOTESTE: sobrou assinatura de teste';
  end if;
end;
$$;

commit;
