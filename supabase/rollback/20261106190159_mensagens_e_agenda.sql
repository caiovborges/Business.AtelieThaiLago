-- ATENCAO: use somente em emergencia.
-- Desfaz 20261106190159_mensagens_e_agenda.sql e, para isso, APAGA os textos editados
-- (o app volta aos textos padrao) e os links de agenda (quem assinou para de receber).

begin;

drop table public.agenda_assinaturas;
drop table public.mensagens_followup;

commit;
