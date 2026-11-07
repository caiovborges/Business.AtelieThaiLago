-- Desfaz 20261107020528_contas_fixas.
-- As despesas ja criadas continuam no financeiro. O cadastro das contas e perdido,
-- entao salve um backup antes de rodar se houver contas cadastradas.

begin;

drop function public.pagar_conta_fixa(uuid, date, date, numeric);
drop table public.contas_fixas_meses;
drop table public.contas_fixas;

commit;
