-- Desfaz a etiqueta "Alto padrao" nos leads. As marcacoes feitas se perdem.

begin;

alter table public.leads drop column alto_padrao;

commit;
