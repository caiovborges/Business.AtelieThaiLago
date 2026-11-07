-- Desfaz 20261107160009_sem_resposta_automatico.
-- Rode antes o rollback do agendamento (20261107160045_agendar_sem_resposta).
-- Os contatos ja classificados continuam como estao.

begin;

drop function public.classificar_sem_resposta(timestamptz);

commit;
