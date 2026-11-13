-- Desfaz mensagens_proprias: apaga as mensagens proprias criadas na tela Mensagens.
-- As listas de mensagem (apagadas por esta migracao, estavam vazias) nao voltam; para
-- recria-las, rode de novo a migracao 20261113112159_mensagens_para_listas.

begin;

drop table public.mensagens_proprias;

commit;
