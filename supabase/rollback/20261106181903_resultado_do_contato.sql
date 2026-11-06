-- ATENCAO: use somente em emergencia.
-- Desfaz 20261106181903_resultado_do_contato.sql e, para isso, APAGA os resultados
-- de contato, os motivos de perda, os convidados e os horarios ja registrados.
-- Os contatos e os leads continuam existindo.

begin;

drop function public.registrar_contato(uuid, uuid, text, timestamptz, text, text, text);
alter table public.lead_followups drop column resultado, drop column feito_em;
alter table public.leads drop column motivo_perda, drop column convidados, drop column horario;

commit;
