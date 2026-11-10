-- Desfaz 20261110205345_nutricao_leads. Apaga a biblioteca de conteudos e as marcas de nutricao.
-- Os contatos de nutricao pendentes viram contatos comuns; os resultados 'nutricao' e
-- 'retomar_perto' ja registrados passam a 'avaliando' para caber na regra antiga.
-- Antes, apague as mensagens editadas: delete from public.mensagens_followup where chave in ('nutricao', 'retomarPerto');

begin;

drop function public.agendar_nutricao(uuid, uuid, text, uuid, date, timestamptz);

update public.lead_followups set resultado = 'avaliando' where resultado in ('nutricao', 'retomar_perto');

alter table public.lead_followups drop constraint lead_followups_resultado_check;
alter table public.lead_followups add constraint lead_followups_resultado_check check (
  resultado is null or resultado = any (array[
    'sem_resposta', 'avaliando', 'caro', 'reuniao', 'retornar', 'quer_fechar', 'desistiu', 'orcamento_enviado'
  ])
);

alter table public.mensagens_followup drop constraint mensagens_followup_chave_check;
alter table public.mensagens_followup add constraint mensagens_followup_chave_check check (chave = any (array[
  'primeiro', 'continuidade', 'retomar', 'encerramento', 'posOrcamento', 'caro', 'lembrete', 'reuniao',
  'confirmarReuniao', 'sinal'
]));

alter table public.lead_followups drop column conteudo_id;
alter table public.lead_followups drop column nutricao;
alter table public.leads drop column retomar_em;
drop table public.conteudos_nutricao;

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

commit;
