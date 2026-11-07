-- Desfaz 20261107160045_agendar_sem_resposta.
-- Para o agendamento. A extensao pg_cron fica instalada, sem nenhuma tarefa.

select cron.unschedule('classificar-sem-resposta');
