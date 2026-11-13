-- Desfaz mensagens_para_listas: apaga as listas e o registro de quem recebeu cada uma.
-- Os contatos e etapas que os envios ja mudaram no follow-up continuam como estao.

begin;

drop function public.registrar_envio_lista(uuid, uuid, timestamptz);
drop table public.envios_lista;
drop table public.listas_mensagem;

commit;
