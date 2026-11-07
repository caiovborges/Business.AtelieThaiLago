-- Roda a classificacao automatica a cada 15 minutos, mesmo com ninguem usando o sistema.

begin;

create extension if not exists pg_cron;

select cron.schedule(
  'classificar-sem-resposta',
  '*/15 * * * *',
  $$select public.classificar_sem_resposta()$$
);

commit;
