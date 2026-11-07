-- Desfaz 20261107015445_parcelas.
-- As receitas ja criadas continuam no financeiro. O combinado das parcelas e perdido,
-- entao salve um backup antes de rodar se houver parcelas cadastradas.

begin;

drop function public.receber_parcela(uuid, date, numeric, integer);
drop table public.parcelas;

commit;
