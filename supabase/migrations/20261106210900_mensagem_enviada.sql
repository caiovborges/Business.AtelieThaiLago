-- Follow-up: separa o envio da mensagem da resposta do casal.
--
-- O que muda:
--   lead_followups ganha enviada_em. Com data preenchida, o contato esta aguardando
--   resposta ate scheduled_at, quando a Thai confere se o casal respondeu.
--
-- So acrescenta um campo vazio e nao altera nenhum registro existente. Se o autoteste
-- do final falhar, tudo e desfeito. Para voltar atras, use o arquivo em supabase/rollback.

begin;

alter table public.lead_followups
  add column enviada_em timestamptz;

-- ---------------------------------------------------------------------------
-- Autoteste: qualquer falha desfaz a migracao inteira
-- ---------------------------------------------------------------------------
do $$
declare
  admin_id uuid;
  negado_id uuid;
  contato_teste uuid;
  agendado timestamptz;
  quantidade bigint;
  total_contatos bigint;
  total_pendentes bigint;
begin
  select user_id into admin_id from public.user_profiles where role = 'admin' limit 1;
  select user_id into negado_id from public.user_profiles where role in ('denied', 'pending') limit 1;
  select id, scheduled_at into contato_teste, agendado from public.lead_followups where done is not true limit 1;
  select count(*) into total_contatos from public.lead_followups;
  select count(*) into total_pendentes from public.lead_followups where done is not true;

  if admin_id is null then
    raise exception 'AUTOTESTE: nenhuma conta admin encontrada';
  end if;

  select count(*) into quantidade from public.lead_followups where enviada_em is not null;
  if quantidade <> 0 then
    raise exception 'AUTOTESTE: contato existente ficou como enviado';
  end if;

  if contato_teste is not null then
    -- Usa um contato de verdade dentro de um bloco que e sempre desfeito.
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);

      update public.lead_followups
      set enviada_em = now(), scheduled_at = agendado + interval '7 days'
      where id = contato_teste;

      select count(*) into quantidade from public.lead_followups
      where id = contato_teste and enviada_em is not null and done is not true;
      if quantidade <> 1 then
        raise exception 'AUTOTESTE: envio nao foi registrado';
      end if;

      raise exception 'desfazer' using errcode = 'ZZ001';
    exception when sqlstate 'ZZ001' then
      null;
    end;
    perform set_config('role', 'none', true);

    if negado_id is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', negado_id, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      update public.lead_followups set enviada_em = now() where id = contato_teste;
      perform set_config('role', 'none', true);
      select count(*) into quantidade from public.lead_followups where enviada_em is not null;
      if quantidade <> 0 then
        raise exception 'AUTOTESTE: conta nao aprovada alterou contato';
      end if;
    end if;
  end if;

  perform set_config('request.jwt.claims', '', true);

  select count(*) into quantidade from public.lead_followups where enviada_em is not null;
  if quantidade <> 0 then
    raise exception 'AUTOTESTE: teste deixou residuo';
  end if;
  select count(*) into quantidade from public.lead_followups;
  if quantidade <> total_contatos then raise exception 'AUTOTESTE: total de contatos mudou'; end if;
  select count(*) into quantidade from public.lead_followups where done is not true;
  if quantidade <> total_pendentes then raise exception 'AUTOTESTE: contatos pendentes mudaram'; end if;
end;
$$;

commit;
