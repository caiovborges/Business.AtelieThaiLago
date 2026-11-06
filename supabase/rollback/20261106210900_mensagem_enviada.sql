-- Desfaz 20261106210900_mensagem_enviada.
-- Contatos que estavam aguardando resposta voltam a ser contatos pendentes comuns.

begin;

alter table public.lead_followups
  drop column enviada_em;

commit;
