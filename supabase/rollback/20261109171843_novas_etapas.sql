-- Desfaz 20261109171843_novas_etapas: volta os nomes antigos das etapas e as funcoes anteriores.
-- Em Conversa volta para Novo Lead, Aguardando Sinal volta para Em Negociação e
-- Sem Resposta volta para Perdido (o motivo "Sem resposta" fica gravado).
-- Antes, apague a mensagem 'sinal' se ela tiver sido editada: delete from public.mensagens_followup where chave = 'sinal';

begin;

update public.leads set status = 'Proposta Enviada' where status = 'Orçamento Enviado';
update public.leads set status = 'Em Negociação' where status in ('Negociando', 'Aguardando Sinal');
update public.leads set status = 'Novo Lead' where status = 'Em Conversa';
update public.leads set status = 'Perdido' where status = 'Sem Resposta';

alter table public.mensagens_followup drop constraint mensagens_followup_chave_check;
alter table public.mensagens_followup add constraint mensagens_followup_chave_check check (chave = any (array[
  'primeiro', 'continuidade', 'retomar', 'encerramento', 'posOrcamento', 'caro', 'lembrete', 'reuniao', 'confirmarReuniao'
]));

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
begin
  if not public.is_approved() then
    raise exception 'Conta sem permissao para registrar contatos.' using errcode = '42501';
  end if;

  perform 1 from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead nao encontrado.' using errcode = 'P0002';
  end if;

  if p_status is not null and p_status not in ('Novo Lead', 'Proposta Enviada', 'Em Negociação', 'Perdido') then
    raise exception 'Etapa invalida.' using errcode = '22023';
  end if;

  if p_status = 'Perdido' and p_proximo is not null then
    raise exception 'Lead perdido nao tem proximo contato.' using errcode = '22023';
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

  if p_status = 'Perdido' then
    update public.leads set status = 'Perdido', motivo_perda = p_motivo where id = p_lead_id;
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
      and l.status in ('Novo Lead', 'Proposta Enviada', 'Em Negociação')
    for update of f
  loop
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
$function$;

revoke execute on function public.classificar_sem_resposta(timestamptz) from public, anon, authenticated;

commit;
