-- Etiqueta "Alto padrao" nos leads.
--
-- A Thai marca manualmente quem tem perfil de alto padrao (medicas, dentistas, gestoras,
-- espacos caros...). A lista marcada vira um publico na exportacao para a Meta, base para
-- um publico semelhante.
--
-- Nao altera registros existentes: todos comecam desmarcados.
-- Para voltar atras, use o arquivo em supabase/rollback.

begin;

alter table public.leads add column alto_padrao boolean not null default false;

comment on column public.leads.alto_padrao is
  'Marcado a mao: lead com perfil de alto padrao, usado no publico da Meta.';

-- Autoteste: a coluna existe, comeca falsa em todos e aceita a marcacao. Tudo e desfeito.
do $$
declare
  v_marcados integer;
  v_id uuid;
begin
  select count(*) into v_marcados from public.leads where alto_padrao;
  if v_marcados <> 0 then
    raise exception 'Autoteste: % leads ja vieram marcados', v_marcados;
  end if;

  select id into v_id from public.leads limit 1;
  if v_id is not null then
    begin
      update public.leads set alto_padrao = true where id = v_id;
      if not (select alto_padrao from public.leads where id = v_id) then
        raise exception 'Autoteste: marcacao nao gravou';
      end if;
      raise exception using errcode = 'ZZ001';
    exception when sqlstate 'ZZ001' then
      null; -- desfaz a marcacao de teste
    end;

    begin
      update public.leads set alto_padrao = null where id = v_id;
      raise exception 'Autoteste: aceitou nulo';
    exception when not_null_violation then
      null;
    end;
  end if;
end $$;

commit;
