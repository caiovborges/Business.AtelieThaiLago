-- Desfaz 20261109192559_exportacoes_publico. Apaga o historico de listas exportadas
-- (os arquivos ja baixados e os publicos na Meta nao sao afetados).

begin;

drop table public.exportacoes_publico;

commit;
